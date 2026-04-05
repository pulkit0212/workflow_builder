type LogLevel = "info" | "warn" | "error" | "debug";

interface LogContext {
  sessionId?: string;
  userId?: string;
  platform?: string;
  [key: string]: unknown;
}

function log(level: LogLevel, module: string, message: string, context?: LogContext) {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`;

  if (context && Object.keys(context).length > 0) {
    const contextStr = Object.entries(context)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(" ");
    if (level === "error") {
      console.error(formatted, contextStr);
    } else if (level === "warn") {
      console.warn(formatted, contextStr);
    } else {
      console.log(formatted, contextStr);
    }
  } else {
    if (level === "error") console.error(formatted);
    else if (level === "warn") console.warn(formatted);
    else console.log(formatted);
  }
}

export const logger = {
  info: (module: string, msg: string, ctx?: LogContext) => log("info", module, msg, ctx),
  warn: (module: string, msg: string, ctx?: LogContext) => log("warn", module, msg, ctx),
  error: (module: string, msg: string, ctx?: LogContext) => log("error", module, msg, ctx),
  debug: (module: string, msg: string, ctx?: LogContext) => log("debug", module, msg, ctx),
};
