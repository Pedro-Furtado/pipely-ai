import { Router, Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

// GET /api/team/my-teams — list teams where I'm a member
router.get("/my-teams", async (req: Request, res: Response) => {
  try {
    const memberships = await prisma.teamMember.findMany({
      where: { userId: req.userId, status: "accepted" },
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const teams = memberships.map((m) => ({
      ownerId: m.ownerId,
      ownerName: m.owner.name,
      ownerEmail: m.owner.email,
      role: m.role,
    }));

    res.json({ success: true, data: teams });
  } catch (error) {
    logger.error("TEAM", "List my teams failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/team — list my team members (only accepted)
router.get("/", async (req: Request, res: Response) => {
  try {
    const members = await prisma.teamMember.findMany({
      where: { ownerId: req.userId, status: "accepted" },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({ success: true, data: members });
  } catch (error) {
    logger.error("TEAM", "List members failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/team/pending — list pending invites I sent
router.get("/pending", async (req: Request, res: Response) => {
  try {
    const pending = await prisma.teamMember.findMany({
      where: { ownerId: req.userId, status: "pending" },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: pending });
  } catch (error) {
    logger.error("TEAM", "List pending failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/team/invite-link — generate invite link
router.post("/invite-link", async (req: Request, res: Response) => {
  try {
    // Only owner can generate invite links
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user?.isOwner) {
      res.status(403).json({ success: false, message: "Apenas o proprietario pode gerar links de convite" });
      return;
    }

    const { expiresInHours } = req.body;
    const hours = Number(expiresInHours) || 48;

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const invite = await prisma.inviteToken.create({
      data: {
        token,
        ownerId: req.userId,
        expiresAt,
      },
    });

    logger.info("TEAM", "Invite link generated", { tokenId: invite.id, expiresAt });

    res.status(201).json({
      success: true,
      data: {
        token: invite.token,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error) {
    logger.error("TEAM", "Generate invite link failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/team/invite-links — list active invite links
router.get("/invite-links", async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user?.isOwner) {
      res.status(403).json({ success: false, message: "Apenas o proprietario pode ver links de convite" });
      return;
    }

    const links = await prisma.inviteToken.findMany({
      where: { ownerId: req.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.json({ success: true, data: links });
  } catch (error) {
    logger.error("TEAM", "List invite links failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/team/invite-link/:id — revoke invite link
router.delete("/invite-link/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await prisma.inviteToken.deleteMany({
      where: { id: req.params.id, ownerId: req.userId },
    });

    if (deleted.count === 0) {
      res.status(404).json({ success: false, message: "Link nao encontrado" });
      return;
    }

    logger.info("TEAM", "Invite link revoked", { tokenId: req.params.id });
    res.json({ success: true, message: "Link revogado" });
  } catch (error) {
    logger.error("TEAM", "Revoke invite link failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/team/invite — send invite to user by email (legacy — kept for existing members)
router.post("/invite", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email?.trim()) {
      res.status(400).json({ success: false, message: "Email is required" });
      return;
    }

    const targetUser = await prisma.user.findUnique({ where: { email: email.trim() } });
    if (!targetUser) {
      res.status(404).json({ success: false, message: "Nenhum usuario encontrado com esse email" });
      return;
    }

    if (targetUser.id === req.userId) {
      res.status(400).json({ success: false, message: "Voce nao pode convidar a si mesmo" });
      return;
    }

    const existing = await prisma.teamMember.findUnique({
      where: { ownerId_userId: { ownerId: req.userId, userId: targetUser.id } },
    });

    if (existing) {
      if (existing.status === "pending") {
        res.status(409).json({ success: false, message: "Convite ja enviado para esse usuario" });
        return;
      }
      if (existing.status === "accepted") {
        res.status(409).json({ success: false, message: "Usuario ja faz parte do seu time" });
        return;
      }
      await prisma.teamMember.update({
        where: { id: existing.id },
        data: { status: "pending" },
      });
    } else {
      await prisma.teamMember.create({
        data: {
          ownerId: req.userId,
          userId: targetUser.id,
          status: "pending",
        },
      });
    }

    const owner = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { name: true },
    });

    await prisma.notification.create({
      data: {
        userId: targetUser.id,
        type: "team_invite",
        title: "Convite para time",
        message: `${owner?.name || "Alguem"} convidou voce para fazer parte do time.`,
        data: { ownerId: req.userId, ownerName: owner?.name },
      },
    });

    logger.info("TEAM", "Invite sent", { to: targetUser.id });
    res.status(201).json({ success: true, message: "Convite enviado" });
  } catch (error) {
    logger.error("TEAM", "Send invite failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/team/respond — accept or reject invite
router.post("/respond", async (req: Request, res: Response) => {
  try {
    const { ownerId, accept } = req.body;

    if (!ownerId || accept === undefined) {
      res.status(400).json({ success: false, message: "ownerId and accept are required" });
      return;
    }

    const invite = await prisma.teamMember.findUnique({
      where: { ownerId_userId: { ownerId, userId: req.userId } },
    });

    if (!invite || invite.status !== "pending") {
      res.status(404).json({ success: false, message: "Convite nao encontrado" });
      return;
    }

    const newStatus = accept ? "accepted" : "rejected";
    await prisma.teamMember.update({
      where: { id: invite.id },
      data: { status: newStatus },
    });

    const responder = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { name: true },
    });

    await prisma.notification.create({
      data: {
        userId: ownerId,
        type: "team_invite_response",
        title: accept ? "Convite aceito" : "Convite recusado",
        message: `${responder?.name || "Alguem"} ${accept ? "aceitou" : "recusou"} seu convite para o time.`,
        data: { userId: req.userId, userName: responder?.name, accepted: accept },
      },
    });

    logger.info("TEAM", `Invite ${newStatus}`, { ownerId, userId: req.userId });
    res.json({ success: true, message: accept ? "Convite aceito" : "Convite recusado" });
  } catch (error) {
    logger.error("TEAM", "Respond invite failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/team/:memberId — update role
router.patch("/:memberId", async (req: Request, res: Response) => {
  try {
    const { role } = req.body;

    const member = await prisma.teamMember.findFirst({
      where: { id: req.params.memberId as string, ownerId: req.userId, status: "accepted" },
    });

    if (!member) {
      res.status(404).json({ success: false, message: "Member not found" });
      return;
    }

    const updated = await prisma.teamMember.update({
      where: { id: member.id },
      data: { role },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error("TEAM", "Update member failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/team/:memberId — remove member or cancel invite
router.delete("/:memberId", async (req: Request, res: Response) => {
  try {
    const deleted = await prisma.teamMember.deleteMany({
      where: { id: req.params.memberId as string, ownerId: req.userId },
    });

    if (deleted.count === 0) {
      res.status(404).json({ success: false, message: "Member not found" });
      return;
    }

    logger.info("TEAM", "Member removed", { memberId: req.params.memberId as string });
    res.json({ success: true, message: "Member removed" });
  } catch (error) {
    logger.error("TEAM", "Remove member failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
