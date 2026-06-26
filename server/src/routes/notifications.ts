import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

// GET /api/notifications — list user notifications
router.get("/", async (req: Request, res: Response) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ success: true, data: notifications });
  } catch (error) {
    logger.error("NOTIFICATION", "List failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/notifications/unread-count — count unread
router.get("/unread-count", async (req: Request, res: Response) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.userId, read: false },
    });

    res.json({ success: true, data: { count } });
  } catch (error) {
    logger.error("NOTIFICATION", "Count failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/notifications/:id/read — mark as read
router.patch("/:id/read", async (req: Request, res: Response) => {
  try {
    const updated = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.userId },
      data: { read: true },
    });

    if (updated.count === 0) {
      res.status(404).json({ success: false, message: "Notification not found" });
      return;
    }

    res.json({ success: true, message: "Marked as read" });
  } catch (error) {
    logger.error("NOTIFICATION", "Mark read failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/notifications/read-all — mark all as read
router.patch("/read-all", async (req: Request, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.userId, read: false },
      data: { read: true },
    });

    res.json({ success: true, message: "All marked as read" });
  } catch (error) {
    logger.error("NOTIFICATION", "Mark all read failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/notifications/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await prisma.notification.deleteMany({
      where: { id: req.params.id, userId: req.userId },
    });

    if (deleted.count === 0) {
      res.status(404).json({ success: false, message: "Notification not found" });
      return;
    }

    res.json({ success: true, message: "Notification deleted" });
  } catch (error) {
    logger.error("NOTIFICATION", "Delete failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
