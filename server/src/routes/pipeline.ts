import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

// ─── PIPELINES ───────────────────────────────────────────────────────────────

// GET /api/pipeline — list all pipelines for user
router.get("/", async (req: Request, res: Response) => {
  try {
    const pipelines = await prisma.pipeline.findMany({
      where: { ownerId: req.userId },
      include: {
        phases: {
          orderBy: { position: "asc" },
          include: {
            blocks: {
              orderBy: { position: "asc" },
              include: { _count: { select: { tasks: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({ success: true, data: pipelines });
  } catch (error) {
    logger.error("PIPELINE", "List pipelines failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/pipeline — create pipeline
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ success: false, message: "Name is required" });
      return;
    }

    const pipeline = await prisma.pipeline.create({
      data: { name: name.trim(), ownerId: req.userId },
    });

    logger.info("PIPELINE", "Pipeline created", { pipelineId: pipeline.id });
    res.status(201).json({ success: true, data: pipeline });
  } catch (error) {
    logger.error("PIPELINE", "Create pipeline failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/pipeline/:id — get pipeline with full data
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: req.params.id, ownerId: req.userId },
      include: {
        phases: {
          orderBy: { position: "asc" },
          include: {
            blocks: {
              orderBy: { position: "asc" },
              include: {
                tasks: {
                  include: {
                    assignee: { select: { id: true, name: true, phone: true } },
                  },
                  orderBy: { enteredAt: "asc" },
                },
                automations: true,
                _count: { select: { tasks: true } },
              },
            },
          },
        },
      },
    });

    if (!pipeline) {
      res.status(404).json({ success: false, message: "Pipeline not found" });
      return;
    }

    res.json({ success: true, data: pipeline });
  } catch (error) {
    logger.error("PIPELINE", "Get pipeline failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/pipeline/:id — rename pipeline
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    const pipeline = await prisma.pipeline.updateMany({
      where: { id: req.params.id, ownerId: req.userId },
      data: { name: name?.trim() },
    });

    if (pipeline.count === 0) {
      res.status(404).json({ success: false, message: "Pipeline not found" });
      return;
    }

    res.json({ success: true, message: "Pipeline updated" });
  } catch (error) {
    logger.error("PIPELINE", "Update pipeline failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/pipeline/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await prisma.pipeline.deleteMany({
      where: { id: req.params.id, ownerId: req.userId },
    });

    if (deleted.count === 0) {
      res.status(404).json({ success: false, message: "Pipeline not found" });
      return;
    }

    logger.info("PIPELINE", "Pipeline deleted", { pipelineId: req.params.id });
    res.json({ success: true, message: "Pipeline deleted" });
  } catch (error) {
    logger.error("PIPELINE", "Delete pipeline failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── PHASES ──────────────────────────────────────────────────────────────────

// POST /api/pipeline/:id/phases — create phase
router.post("/:id/phases", async (req: Request, res: Response) => {
  try {
    const { name, color } = req.body;

    const pipeline = await prisma.pipeline.findFirst({
      where: { id: req.params.id, ownerId: req.userId },
    });
    if (!pipeline) {
      res.status(404).json({ success: false, message: "Pipeline not found" });
      return;
    }

    if (!name?.trim()) {
      res.status(400).json({ success: false, message: "Name is required" });
      return;
    }

    const maxPos = await prisma.pipelinePhase.aggregate({
      where: { pipelineId: pipeline.id },
      _max: { position: true },
    });

    const phase = await prisma.pipelinePhase.create({
      data: {
        pipelineId: pipeline.id,
        name: name.trim(),
        color: color || "blue",
        position: (maxPos._max.position ?? -1) + 1,
      },
    });

    logger.info("PIPELINE", "Phase created", { phaseId: phase.id });
    res.status(201).json({ success: true, data: phase });
  } catch (error) {
    logger.error("PIPELINE", "Create phase failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/pipeline/phases/:phaseId — update phase
router.patch("/phases/:phaseId", async (req: Request, res: Response) => {
  try {
    const { name, color, position } = req.body;

    const phase = await prisma.pipelinePhase.findFirst({
      where: { id: req.params.phaseId },
      include: { pipeline: true },
    });

    if (!phase || phase.pipeline.ownerId !== req.userId) {
      res.status(404).json({ success: false, message: "Phase not found" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (color !== undefined) data.color = color;
    if (position !== undefined) data.position = position;

    const updated = await prisma.pipelinePhase.update({
      where: { id: phase.id },
      data,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error("PIPELINE", "Update phase failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/pipeline/phases/:phaseId
router.delete("/phases/:phaseId", async (req: Request, res: Response) => {
  try {
    const phase = await prisma.pipelinePhase.findFirst({
      where: { id: req.params.phaseId },
      include: {
        pipeline: true,
        blocks: { include: { _count: { select: { tasks: true } } } },
      },
    });

    if (!phase || phase.pipeline.ownerId !== req.userId) {
      res.status(404).json({ success: false, message: "Phase not found" });
      return;
    }

    const hasCards = phase.blocks.some((b) => b._count.tasks > 0);
    if (hasCards) {
      res.status(400).json({ success: false, message: "Cannot delete phase with tasks. Move cards first." });
      return;
    }

    const hasLocked = phase.blocks.some((b) => b.isLocked);
    if (hasLocked) {
      res.status(400).json({ success: false, message: "Cannot delete phase with locked blocks" });
      return;
    }

    await prisma.pipelinePhase.delete({ where: { id: phase.id } });
    logger.info("PIPELINE", "Phase deleted", { phaseId: phase.id });
    res.json({ success: true, message: "Phase deleted" });
  } catch (error) {
    logger.error("PIPELINE", "Delete phase failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/pipeline/:id/phases/reorder — reorder phases
router.patch("/:id/phases/reorder", async (req: Request, res: Response) => {
  try {
    const { order } = req.body; // [{ id, position }]

    const pipeline = await prisma.pipeline.findFirst({
      where: { id: req.params.id, ownerId: req.userId },
    });
    if (!pipeline) {
      res.status(404).json({ success: false, message: "Pipeline not found" });
      return;
    }

    // Verify all phases belong to this pipeline
    const phaseIds = (order as Array<{ id: string; position: number }>).map((i) => i.id);
    const ownedPhases = await prisma.pipelinePhase.count({
      where: { id: { in: phaseIds }, pipelineId: pipeline.id },
    });
    if (ownedPhases !== phaseIds.length) {
      res.status(403).json({ success: false, message: "Some phases do not belong to this pipeline" });
      return;
    }

    await prisma.$transaction(
      (order as Array<{ id: string; position: number }>).map((item) =>
        prisma.pipelinePhase.update({
          where: { id: item.id },
          data: { position: item.position },
        })
      )
    );

    res.json({ success: true, message: "Phases reordered" });
  } catch (error) {
    logger.error("PIPELINE", "Reorder phases failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── BLOCKS ──────────────────────────────────────────────────────────────────

// POST /api/pipeline/phases/:phaseId/blocks — create block
router.post("/phases/:phaseId/blocks", async (req: Request, res: Response) => {
  try {
    const { name, blockType } = req.body;

    const phase = await prisma.pipelinePhase.findFirst({
      where: { id: req.params.phaseId },
      include: { pipeline: true },
    });

    if (!phase || phase.pipeline.ownerId !== req.userId) {
      res.status(404).json({ success: false, message: "Phase not found" });
      return;
    }

    if (!name?.trim()) {
      res.status(400).json({ success: false, message: "Name is required" });
      return;
    }

    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

    const maxPos = await prisma.pipelineBlock.aggregate({
      where: { phaseId: phase.id },
      _max: { position: true },
    });

    const block = await prisma.pipelineBlock.create({
      data: {
        phaseId: phase.id,
        name: name.trim(),
        slug: `${slug}_${Date.now()}`,
        blockType: blockType || "stage",
        position: (maxPos._max.position ?? -1) + 1,
      },
    });

    logger.info("PIPELINE", "Block created", { blockId: block.id, blockType: block.blockType });
    res.status(201).json({ success: true, data: block });
  } catch (error) {
    logger.error("PIPELINE", "Create block failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/pipeline/blocks/:blockId — update block
router.patch("/blocks/:blockId", async (req: Request, res: Response) => {
  try {
    const { name, blockType, config, position, phaseId } = req.body;

    const block = await prisma.pipelineBlock.findFirst({
      where: { id: req.params.blockId },
      include: { phase: { include: { pipeline: true } } },
    });

    if (!block || block.phase.pipeline.ownerId !== req.userId) {
      res.status(404).json({ success: false, message: "Block not found" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (blockType !== undefined) data.blockType = blockType;
    if (config !== undefined) data.config = config;
    if (position !== undefined) data.position = position;
    if (phaseId !== undefined) {
      // Verify target phase belongs to owner's pipeline
      const targetPhase = await prisma.pipelinePhase.findFirst({
        where: { id: phaseId },
        include: { pipeline: true },
      });
      if (!targetPhase || targetPhase.pipeline.ownerId !== req.userId) {
        res.status(403).json({ success: false, message: "Target phase not found" });
        return;
      }
      data.phaseId = phaseId;
    }

    const updated = await prisma.pipelineBlock.update({
      where: { id: block.id },
      data,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error("PIPELINE", "Update block failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/pipeline/blocks/:blockId
router.delete("/blocks/:blockId", async (req: Request, res: Response) => {
  try {
    const block = await prisma.pipelineBlock.findFirst({
      where: { id: req.params.blockId },
      include: {
        phase: { include: { pipeline: true } },
        _count: { select: { tasks: true } },
      },
    });

    if (!block || block.phase.pipeline.ownerId !== req.userId) {
      res.status(404).json({ success: false, message: "Block not found" });
      return;
    }

    if (block.isLocked) {
      res.status(403).json({ success: false, message: "Cannot delete locked block" });
      return;
    }

    if (block._count.tasks > 0) {
      res.status(400).json({ success: false, message: "Cannot delete block with tasks. Move cards first." });
      return;
    }

    await prisma.pipelineBlock.delete({ where: { id: block.id } });
    logger.info("PIPELINE", "Block deleted", { blockId: block.id });
    res.json({ success: true, message: "Block deleted" });
  } catch (error) {
    logger.error("PIPELINE", "Delete block failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/pipeline/phases/:phaseId/blocks/reorder
router.patch("/phases/:phaseId/blocks/reorder", async (req: Request, res: Response) => {
  try {
    const { order } = req.body; // [{ id, position }]

    const phase = await prisma.pipelinePhase.findFirst({
      where: { id: req.params.phaseId },
      include: { pipeline: true },
    });

    if (!phase || phase.pipeline.ownerId !== req.userId) {
      res.status(404).json({ success: false, message: "Phase not found" });
      return;
    }

    // Verify all blocks belong to this phase
    const blockIds = (order as Array<{ id: string; position: number }>).map((i) => i.id);
    const ownedBlocks = await prisma.pipelineBlock.count({
      where: { id: { in: blockIds }, phaseId: phase.id },
    });
    if (ownedBlocks !== blockIds.length) {
      res.status(403).json({ success: false, message: "Some blocks do not belong to this phase" });
      return;
    }

    await prisma.$transaction(
      (order as Array<{ id: string; position: number }>).map((item) =>
        prisma.pipelineBlock.update({
          where: { id: item.id },
          data: { position: item.position },
        })
      )
    );

    res.json({ success: true, message: "Blocks reordered" });
  } catch (error) {
    logger.error("PIPELINE", "Reorder blocks failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── TASK MOVEMENT IN PIPELINE ───────────────────────────────────────────────

// PATCH /api/pipeline/tasks/:taskId/move — move task to another block
router.patch("/tasks/:taskId/move", async (req: Request, res: Response) => {
  try {
    const { blockId } = req.body;

    if (!blockId) {
      res.status(400).json({ success: false, message: "blockId is required" });
      return;
    }

    const task = await prisma.task.findFirst({
      where: { id: req.params.taskId, ownerId: req.userId },
    });

    if (!task) {
      res.status(404).json({ success: false, message: "Task not found" });
      return;
    }

    if (task.blockId === blockId) {
      res.json({ success: true, message: "Already in this block" });
      return;
    }

    // Verify target block belongs to owner's pipeline
    const targetBlock = await prisma.pipelineBlock.findFirst({
      where: { id: blockId },
      include: { phase: { include: { pipeline: true } } },
    });
    if (!targetBlock || targetBlock.phase.pipeline.ownerId !== req.userId) {
      res.status(403).json({ success: false, message: "Target block not found" });
      return;
    }

    // Close previous log
    if (task.blockId) {
      await prisma.taskLog.updateMany({
        where: { taskId: task.id, leftAt: null },
        data: { leftAt: new Date() },
      });
    }

    // Create new log
    await prisma.taskLog.create({
      data: { taskId: task.id, blockId },
    });

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { blockId, enteredAt: new Date(), processedAt: null },
      include: {
        assignee: { select: { id: true, name: true, phone: true } },
      },
    });

    logger.info("PIPELINE", "Task moved", { taskId: task.id, from: task.blockId, to: blockId });
    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error("PIPELINE", "Move task failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── AUTOMATIONS ─────────────────────────────────────────────────────────────

// POST /api/pipeline/blocks/:blockId/automations
router.post("/blocks/:blockId/automations", async (req: Request, res: Response) => {
  try {
    const { type, config } = req.body;

    const block = await prisma.pipelineBlock.findFirst({
      where: { id: req.params.blockId },
      include: { phase: { include: { pipeline: true } } },
    });

    if (!block || block.phase.pipeline.ownerId !== req.userId) {
      res.status(404).json({ success: false, message: "Block not found" });
      return;
    }

    if (!type) {
      res.status(400).json({ success: false, message: "Type is required" });
      return;
    }

    const automation = await prisma.pipelineAutomation.create({
      data: {
        blockId: block.id,
        type,
        config: config || {},
      },
    });

    logger.info("PIPELINE", "Automation created", { automationId: automation.id, type });
    res.status(201).json({ success: true, data: automation });
  } catch (error) {
    logger.error("PIPELINE", "Create automation failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/pipeline/automations/:automationId
router.patch("/automations/:automationId", async (req: Request, res: Response) => {
  try {
    const { type, config, isActive } = req.body;

    const automation = await prisma.pipelineAutomation.findFirst({
      where: { id: req.params.automationId },
      include: { block: { include: { phase: { include: { pipeline: true } } } } },
    });

    if (!automation || automation.block.phase.pipeline.ownerId !== req.userId) {
      res.status(404).json({ success: false, message: "Automation not found" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (type !== undefined) data.type = type;
    if (config !== undefined) data.config = config;
    if (isActive !== undefined) data.isActive = isActive;

    const updated = await prisma.pipelineAutomation.update({
      where: { id: automation.id },
      data,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error("PIPELINE", "Update automation failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/pipeline/automations/:automationId
router.delete("/automations/:automationId", async (req: Request, res: Response) => {
  try {
    const automation = await prisma.pipelineAutomation.findFirst({
      where: { id: req.params.automationId },
      include: { block: { include: { phase: { include: { pipeline: true } } } } },
    });

    if (!automation || automation.block.phase.pipeline.ownerId !== req.userId) {
      res.status(404).json({ success: false, message: "Automation not found" });
      return;
    }

    await prisma.pipelineAutomation.delete({ where: { id: automation.id } });
    logger.info("PIPELINE", "Automation deleted", { automationId: automation.id });
    res.json({ success: true, message: "Automation deleted" });
  } catch (error) {
    logger.error("PIPELINE", "Delete automation failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
