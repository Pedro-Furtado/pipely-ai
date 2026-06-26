import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

// GET /api/ai/config
router.get("/config", async (req: Request, res: Response) => {
  try {
    const config = await prisma.aiConfig.findUnique({
      where: { userId: req.userId },
    });

    res.json({
      success: true,
      data: config
        ? { id: config.id, hasKey: true, keyPreview: "sk-••••••••" }
        : null,
    });
  } catch (error) {
    logger.error("AI", "Get config failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/ai/config
router.post("/config", async (req: Request, res: Response) => {
  try {
    const { openaiApiKey } = req.body;

    if (!openaiApiKey?.trim()) {
      res.status(400).json({ success: false, message: "API Key e obrigatoria" });
      return;
    }

    const key = openaiApiKey.trim();

    if (!key.startsWith("sk-")) {
      res.status(400).json({ success: false, message: "API Key invalida. Deve comecar com sk-" });
      return;
    }

    await prisma.aiConfig.upsert({
      where: { userId: req.userId },
      update: { openaiApiKey: key },
      create: { userId: req.userId, openaiApiKey: key },
    });

    logger.info("AI", "Config saved", { userId: req.userId });
    res.json({ success: true, message: "API Key salva" });
  } catch (error) {
    logger.error("AI", "Save config failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/ai/config
router.delete("/config", async (req: Request, res: Response) => {
  try {
    await prisma.aiConfig.deleteMany({ where: { userId: req.userId } });
    logger.info("AI", "Config removed", { userId: req.userId });
    res.json({ success: true, message: "API Key removida" });
  } catch (error) {
    logger.error("AI", "Remove config failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
