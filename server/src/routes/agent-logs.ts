import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

// GET /api/agent-logs — list agent logs for current user
router.get("/", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const type = (req.query.type as string) || undefined;

    const where = {
      ownerId: req.userId,
      ...(type ? { type } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.agentLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.agentLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error("AGENT_LOGS", "List failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/agent-logs — clear all agent logs for current user
router.delete("/", async (req: Request, res: Response) => {
  try {
    await prisma.agentLog.deleteMany({ where: { ownerId: req.userId } });
    res.json({ success: true, message: "Logs limpos" });
  } catch (error) {
    logger.error("AGENT_LOGS", "Clear failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
