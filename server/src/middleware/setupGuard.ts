import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";

let ownerExists: boolean | null = null;

export async function setupGuard(req: Request, res: Response, next: NextFunction) {
  // Always allow setup and health endpoints
  const path = req.path;
  if (
    path === "/api/auth/setup-status" ||
    path === "/api/auth/setup" ||
    path === "/health"
  ) {
    next();
    return;
  }

  // Cache the check — only query DB once until owner is created
  if (ownerExists === null) {
    const owner = await prisma.user.findFirst({ where: { isOwner: true } });
    ownerExists = !!owner;
  }

  if (!ownerExists) {
    // Allow invite validation (needed for register page)
    if (path.startsWith("/api/auth/invite/")) {
      next();
      return;
    }

    res.status(503).json({
      success: false,
      message: "Setup required. Create an owner account first.",
      code: "SETUP_REQUIRED",
    });
    return;
  }

  next();
}

/** Call after owner is created to clear cache */
export function clearSetupCache() {
  ownerExists = null;
}
