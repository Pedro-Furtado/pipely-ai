const colors = {
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

function ts(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

export const log = {
  info(ctx: string, msg: string, meta?: Record<string, unknown>) {
    const m = meta ? ` ${colors.dim}${JSON.stringify(meta)}${colors.reset}` : "";
    console.log(`${colors.dim}${ts()}${colors.reset} ${colors.info}INFO ${colors.reset}${colors.bold}[${ctx}]${colors.reset} ${msg}${m}`);
  },
  warn(ctx: string, msg: string, meta?: Record<string, unknown>) {
    const m = meta ? ` ${colors.dim}${JSON.stringify(meta)}${colors.reset}` : "";
    console.warn(`${colors.dim}${ts()}${colors.reset} ${colors.warn}WARN ${colors.reset}${colors.bold}[${ctx}]${colors.reset} ${msg}${m}`);
  },
  error(ctx: string, msg: string, err?: unknown) {
    const e = err instanceof Error ? ` ${colors.dim}${err.message}${colors.reset}` : err ? ` ${colors.dim}${String(err)}${colors.reset}` : "";
    console.error(`${colors.dim}${ts()}${colors.reset} ${colors.error}ERROR${colors.reset} ${colors.bold}[${ctx}]${colors.reset} ${msg}${e}`);
  },
};
