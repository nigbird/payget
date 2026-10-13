// pino-roll ships without TypeScript types; only the options we use are declared.
declare module "pino-roll" {
  import type { EventEmitter } from "events";

  interface PinoRollOptions {
    file: string | (() => string);
    frequency?: "daily" | "hourly" | number;
    size?: string | number;
    extension?: string;
    dateFormat?: string;
    mkdir?: boolean;
    symlink?: boolean;
    limit?: { count?: number; removeOtherLogFiles?: boolean };
  }

  interface RollStream extends EventEmitter {
    write(data: string): boolean;
  }

  export default function pinoRoll(options: PinoRollOptions): Promise<RollStream>;
}
