// Runs once when the Next.js server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bridgeConsoleToLogger, logger } = await import("@/lib/logger");
    bridgeConsoleToLogger();
    logger.info({ env: process.env.NODE_ENV }, "server started");
  }
}
