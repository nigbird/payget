// Server-side application logger. Writes JSON lines to a daily-rotated file
// (logs/app.YYYY-MM-DD.N.log) and echoes a short line to the terminal.
// Node runtime only — do not import from middleware.ts or client components.
import os from "os";
import path from "path";
import { format } from "util";
import pino, { type Logger } from "pino";

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), "logs");
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
// Old files kept besides the active one (~1 per day unless a day exceeds 100 MB).
const LOG_MAX_FILES = Number(process.env.LOG_MAX_FILES) || 90;
const LOG_TO_FILE = process.env.LOG_TO_FILE !== "false";

// Keys that must never reach disk, at any nesting depth we commonly use.
const REDACT_KEYS = [
  "password", "newPassword", "currentPassword", "otp", "pin", "cvv", "cvc",
  "pan", "cardNumber", "token", "accessToken", "refreshToken", "secret",
  "sharedSecret", "privateKey", "authorization", "cookie",
];
const REDACT_PATHS = REDACT_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]);

// The unpatched console, captured once per process (before the bridge below
// replaces it) so echoing a logger.* call never re-enters the bridge.
const gc = globalThis as typeof globalThis & { __rawConsole?: Pick<Console, "info" | "warn" | "error"> };
const rawConsole = (gc.__rawConsole ??= {
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
});

function createLogger(): Logger {
  let fileFailed = false;
  const transport = LOG_TO_FILE
    ? pino.transport({
        target: "pino-roll",
        options: {
          file: path.join(LOG_DIR, "app"),
          frequency: "daily",
          dateFormat: "yyyy-MM-dd",
          size: "100m",
          mkdir: true,
          // logs/current.log -> today's file (symlinks need admin rights on Windows)
          symlink: process.platform !== "win32",
          limit: { count: LOG_MAX_FILES, removeOtherLogFiles: true },
        },
      })
    : undefined;

  // If the file can't be written (disk full, permissions), keep serving
  // requests and terminal output; just stop writing to the file.
  transport?.on("error", (err: Error) => {
    if (!fileFailed) rawConsole.error("[logger] file logging disabled:", err.message);
    fileFailed = true;
  });

  return pino(
    {
      level: LOG_LEVEL,
      base: { pid: process.pid },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
      hooks: {
        // Echo direct logger.* calls to the terminal. Calls bridged from
        // console.* (src: "console") were already printed by the original console.
        logMethod(args, method, level) {
          if ((this.bindings() as { src?: string }).src !== "console") {
            const label = pino.levels.labels[level] ?? "info";
            const out = level >= 50 ? rawConsole.error : level >= 40 ? rawConsole.warn : rawConsole.info;
            out(`[${label}]`, ...args.map((a) => (typeof a === "string" ? a : format("%O", a))));
          }
          if (fileFailed) return;
          try {
            return method.apply(this, args);
          } catch {
            fileFailed = true;
          }
        },
      },
    },
    transport ?? pino.destination({ dest: os.devNull, sync: false }),
  );
}

// One logger (and one file-writer thread) per process, even though Next.js
// may load this module from several server bundles.
const g = globalThis as typeof globalThis & { __appLogger?: Logger };
export const logger: Logger = g.__appLogger ?? (g.__appLogger = createLogger());

/**
 * Mirror every server-side console.* call into the log file, keeping the
 * normal terminal output. Called once from src/instrumentation.ts.
 */
export function bridgeConsoleToLogger() {
  const gb = globalThis as typeof globalThis & { __consoleBridged?: boolean };
  if (gb.__consoleBridged) return;
  gb.__consoleBridged = true;

  const fileOnly = logger.child({ src: "console" });
  const map = [
    ["debug", "debug"],
    ["log", "info"],
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"],
  ] as const;

  for (const [method, level] of map) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      original(...args);
      try {
        const err = args.find((a): a is Error => a instanceof Error);
        // eslint-disable-next-line no-control-regex
        const msg = format(...args).replace(/\x1b\[[0-9;]*m/g, ""); // drop terminal colours
        if (err) fileOnly[level]({ err }, msg);
        else fileOnly[level](msg);
      } catch {
        // Logging must never break a request.
      }
    };
  }
}
