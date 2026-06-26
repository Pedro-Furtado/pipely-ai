type LogLevel = "info" | "warn" | "error";

const colors = {
  info: "\x1b[36m",   // cyan
  warn: "\x1b[33m",   // yellow
  error: "\x1b[31m",  // red
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

function formatMessage(level: LogLevel, context: string, message: string, meta?: Record<string, unknown>): string {
  const color = colors[level];
  const tag = level.toUpperCase().padEnd(5);
  const metaStr = meta ? ` ${colors.dim}${JSON.stringify(meta)}${colors.reset}` : "";
  return `${colors.dim}${timestamp()}${colors.reset} ${color}${tag}${colors.reset} ${colors.bold}[${context}]${colors.reset} ${message}${metaStr}`;
}

function sanitize(data: Record<string, unknown>): Record<string, unknown> {
  const sensitive = ["password", "token", "refreshToken", "accessToken", "secret", "pass"];
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (sensitive.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export const logger = {
  info(context: string, message: string, meta?: Record<string, unknown>) {
    console.log(formatMessage("info", context, message, meta ? sanitize(meta) : undefined));
  },
  warn(context: string, message: string, meta?: Record<string, unknown>) {
    console.warn(formatMessage("warn", context, message, meta ? sanitize(meta) : undefined));
  },
  error(context: string, message: string, error?: unknown) {
    const errorMeta = error instanceof Error
      ? { name: error.name, message: error.message }
      : error
        ? { raw: String(error) }
        : undefined;
    console.error(formatMessage("error", context, message, errorMeta));
  },
};
