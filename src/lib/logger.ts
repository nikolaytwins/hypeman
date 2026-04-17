export type LogLevel = "info" | "warn" | "error" | "debug";

export interface Logger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  debug: (msg: string, meta?: Record<string, unknown>) => void;
}

function line(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  const logFn = level === "debug" ? console.log : console[level];
  logFn(`[${ts}] [${level.toUpperCase()}] ${msg}${suffix}`);
}

export function createLogger(scope: string): Logger {
  const p = (msg: string) => `[${scope}] ${msg}`;
  return {
    info: (msg, meta) => line("info", p(msg), meta),
    warn: (msg, meta) => line("warn", p(msg), meta),
    error: (msg, meta) => line("error", p(msg), meta),
    debug: (msg, meta) => line("debug", p(msg), meta),
  };
}
