import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

// GET /api/team — list team members
router.get("/", async (req: Request, res: Response) => {
  try {
    const members = await prisma.teamMember.findMany({
      where: { ownerId: req.userId },
      orderBy: { createdAt: "asc" },
    });

    res.json({ success: true, data: members });
  } catch (error) {
    logger.error("TEAM", "List members failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/team — create team member
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, phone, countryCode } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ success: false, message: "Nome e obrigatorio" });
      return;
    }

    if (!phone?.trim()) {
      res.status(400).json({ success: false, message: "Telefone e obrigatorio" });
      return;
    }

    const digits = phone.replace(/\D/g, "");
    let remoteJid: string | null = null;
    if (countryCode) {
      remoteJid = `${countryCode}${digits}@s.whatsapp.net`;
    }

    const existing = await prisma.teamMember.findUnique({
      where: { ownerId_phone: { ownerId: req.userId, phone: digits } },
    });

    if (existing) {
      res.status(409).json({ success: false, message: "Membro com esse telefone ja existe" });
      return;
    }

    const member = await prisma.teamMember.create({
      data: {
        ownerId: req.userId,
        name: name.trim(),
        phone: digits,
        remoteJid,
      },
    });

    logger.info("TEAM", "Member created", { memberId: member.id });
    res.status(201).json({ success: true, data: member });
  } catch (error) {
    logger.error("TEAM", "Create member failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/team/:memberId — update member
router.patch("/:memberId", async (req: Request, res: Response) => {
  try {
    const { name, phone, countryCode, role } = req.body;

    const member = await prisma.teamMember.findFirst({
      where: { id: req.params.memberId as string, ownerId: req.userId },
    });

    if (!member) {
      res.status(404).json({ success: false, message: "Membro nao encontrado" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (role !== undefined) data.role = role;
    if (phone !== undefined) {
      const digits = phone.replace(/\D/g, "");
      data.phone = digits;
      if (countryCode) {
        data.remoteJid = `${countryCode}${digits}@s.whatsapp.net`;
      }
    }

    const updated = await prisma.teamMember.update({
      where: { id: member.id },
      data,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error("TEAM", "Update member failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/team/:memberId — remove member
router.delete("/:memberId", async (req: Request, res: Response) => {
  try {
    const deleted = await prisma.teamMember.deleteMany({
      where: { id: req.params.memberId as string, ownerId: req.userId },
    });

    if (deleted.count === 0) {
      res.status(404).json({ success: false, message: "Membro nao encontrado" });
      return;
    }

    logger.info("TEAM", "Member removed", { memberId: req.params.memberId as string });
    res.json({ success: true, message: "Membro removido" });
  } catch (error) {
    logger.error("TEAM", "Remove member failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
