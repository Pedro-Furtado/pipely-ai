import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { authenticate } from "../middleware/auth.js";
import { resolveWorkspace } from "../middleware/workspace.js";

const router = Router();
router.use(authenticate);
router.use(resolveWorkspace);

// GET /api/tasks
router.get("/", async (req: Request, res: Response) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { creatorId: req.ownerId },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        block: { select: { id: true, name: true, phase: { select: { name: true, color: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: tasks });
  } catch (error) {
    logger.error("TASKS", "List failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/tasks
router.post("/", async (req: Request, res: Response) => {
  try {
    const { title, description, priority, assigneeId, blockId, status } = req.body;

    if (!title?.trim()) {
      res.status(400).json({ success: false, message: "Titulo e obrigatorio" });
      return;
    }

    // Validate assignee is a team member or the owner
    if (assigneeId && assigneeId !== req.ownerId) {
      const isMember = await prisma.teamMember.findFirst({
        where: { ownerId: req.ownerId, userId: assigneeId, status: "accepted" },
      });
      if (!isMember) {
        res.status(400).json({ success: false, message: "Assignee is not a team member" });
        return;
      }
    }

    // Validate blockId belongs to owner's pipeline
    if (blockId) {
      const block = await prisma.pipelineBlock.findFirst({
        where: { id: blockId },
        include: { phase: { include: { pipeline: true } } },
      });
      if (!block || block.phase.pipeline.ownerId !== req.ownerId) {
        res.status(400).json({ success: false, message: "Block not found" });
        return;
      }
    }

    const task = await prisma.task.create({
      data: {
        creatorId: req.ownerId,
        title: title.trim(),
        description: description?.trim() || null,
        priority: priority || "medium",
        status: status || "todo",
        assigneeId: assigneeId || null,
        blockId: blockId || null,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        block: { select: { id: true, name: true, phase: { select: { name: true, color: true } } } },
      },
    });

    // Create initial log if placed in a block
    if (blockId) {
      await prisma.taskLog.create({
        data: { taskId: task.id, blockId },
      });
    }

    logger.info("TASKS", "Task created", { taskId: task.id });
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    logger.error("TASKS", "Create failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/tasks/:id
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { title, description, priority, assigneeId, blockId, status } = req.body;

    const task = await prisma.task.findFirst({
      where: { id: req.params.id, creatorId: req.ownerId },
    });

    if (!task) {
      res.status(404).json({ success: false, message: "Tarefa nao encontrada" });
      return;
    }

    // Validate assignee
    if (assigneeId && assigneeId !== req.ownerId) {
      const isMember = await prisma.teamMember.findFirst({
        where: { ownerId: req.ownerId, userId: assigneeId, status: "accepted" },
      });
      if (!isMember) {
        res.status(400).json({ success: false, message: "Assignee is not a team member" });
        return;
      }
    }

    // Validate blockId
    if (blockId) {
      const block = await prisma.pipelineBlock.findFirst({
        where: { id: blockId },
        include: { phase: { include: { pipeline: true } } },
      });
      if (!block || block.phase.pipeline.ownerId !== req.ownerId) {
        res.status(400).json({ success: false, message: "Block not found" });
        return;
      }
    }

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (priority !== undefined) data.priority = priority;
    if (assigneeId !== undefined) data.assigneeId = assigneeId || null;
    if (blockId !== undefined) data.blockId = blockId || null;
    if (status !== undefined) data.status = status;

    const updated = await prisma.task.update({
      where: { id: task.id },
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        block: { select: { id: true, name: true, phase: { select: { name: true, color: true } } } },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error("TASKS", "Update failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/tasks/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await prisma.task.deleteMany({
      where: { id: req.params.id, creatorId: req.ownerId },
    });

    if (deleted.count === 0) {
      res.status(404).json({ success: false, message: "Tarefa nao encontrada" });
      return;
    }

    logger.info("TASKS", "Task deleted", { taskId: req.params.id });
    res.json({ success: true, message: "Tarefa excluida" });
  } catch (error) {
    logger.error("TASKS", "Delete failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
