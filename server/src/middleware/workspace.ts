import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";

export async function resolveWorkspace(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const raw = req.headers["x-workspace-owner"] as string | undefined;
  const workspaceOwner = raw?.trim() || undefined;

  if (!workspaceOwner || workspaceOwner === req.userId) {
    req.ownerId = req.userId;
    next();
    return;
  }

  const membership = await prisma.teamMember.findUnique({
    where: {
      ownerId_userId: {
        ownerId: workspaceOwner,
        userId: req.userId,
      },
    },
  });

  if (!membership || membership.status !== "accepted") {
    res.status(403).json({
      success: false,
      message: "You are not a member of this workspace",
    });
    return;
  }

  req.ownerId = workspaceOwner;
  next();
}
