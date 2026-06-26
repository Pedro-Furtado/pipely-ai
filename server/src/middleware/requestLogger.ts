import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const method = req.method;
    const url = req.originalUrl;

    const meta: Record<string, unknown> = {
      status,
      duration: `${duration}ms`,
    };

    if (status >= 500) {
      logger.error("HTTP", `${method} ${url}`, undefined);
    } else if (status >= 400) {
      logger.warn("HTTP", `${method} ${url} ${status}`, meta);
    } else {
      logger.info("HTTP", `${method} ${url} ${status}`, meta);
    }
  });

  next();
}
