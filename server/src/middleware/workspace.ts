import { Request, Response, NextFunction } from "express";

// Simplified: single owner, no workspace switching needed.
// Kept for backwards compatibility — just sets ownerId = userId.
export async function resolveWorkspace(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  req.ownerId = req.userId;
  next();
}
