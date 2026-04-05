/**
 * Structured logger for bot process.
 * Outputs: [timestamp] [LEVEL] [module] message key=value ...
 */
function log(level, module, message, context) {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`;

  if (context && Object.keys(context).length > 0) {
    const contextStr = Object.entries(context)
      .map(([k, v]) => `${k}=${v}`)
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

const logger = {
  info: (module, msg, ctx) => log("info", module, msg, ctx),
  warn: (module, msg, ctx) => log("warn", module, msg, ctx),
  error: (module, msg, ctx) => log("error", module, msg, ctx),
  debug: (module, msg, ctx) => log("debug", module, msg, ctx),
};

module.exports = { logger };
