import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import {
  generateAccessToken,
  generateRefreshToken,
  generatePasswordResetToken,
} from "../services/token.js";
import {
  sendPasswordResetEmail,
} from "../services/email.js";
import { authenticate } from "../middleware/auth.js";
import { clearSetupCache } from "../middleware/setupGuard.js";

const router = Router();

// GET /setup-status — check if owner account exists
router.get("/setup-status", async (_req: Request, res: Response) => {
  try {
    const owner = await prisma.user.findFirst({ where: { isOwner: true } });
    res.json({ success: true, data: { hasOwner: !!owner } });
  } catch (error) {
    logger.error("AUTH", "Setup status check failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /setup — create owner account (first-time setup)
router.post("/setup", async (req: Request, res: Response) => {
  try {
    const { setupKey, email, password, name, phone, countryCode } = req.body;

    const expectedKey = process.env.OWNER_SETUP_KEY;
    if (!expectedKey) {
      logger.error("AUTH", "OWNER_SETUP_KEY not configured in .env");
      res.status(500).json({ success: false, message: "Setup key not configured on server" });
      return;
    }

    if (!setupKey || setupKey !== expectedKey) {
      logger.warn("AUTH", "Setup attempt with invalid key");
      res.status(403).json({ success: false, message: "Chave de configuracao invalida" });
      return;
    }

    const existingOwner = await prisma.user.findFirst({ where: { isOwner: true } });
    if (existingOwner) {
      res.status(409).json({ success: false, message: "Conta de proprietario ja existe" });
      return;
    }

    if (!email || !password || !name) {
      res.status(400).json({ success: false, message: "Email, senha e nome sao obrigatorios" });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ success: false, message: "Email ja cadastrado" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    let remoteJid: string | null = null;
    if (phone && countryCode) {
      const digits = phone.replace(/\D/g, "");
      remoteJid = `${countryCode}${digits}@s.whatsapp.net`;
    }

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        phone: phone || null,
        remoteJid,
        isOwner: true,
        emailVerified: true,
      },
    });

    clearSetupCache();
    logger.info("AUTH", "Owner account created", { userId: user.id, email });

    res.status(201).json({
      success: true,
      message: "Conta de proprietario criada com sucesso",
    });
  } catch (error) {
    logger.error("AUTH", "Setup failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /invite/:token — validate invite token (public)
router.get("/invite/:token", async (req: Request, res: Response) => {
  try {
    const invite = await prisma.inviteToken.findUnique({
      where: { token: req.params.token as string },
      include: { owner: { select: { name: true } } },
    });

    if (!invite) {
      res.status(404).json({ success: false, message: "Convite nao encontrado" });
      return;
    }

    if (invite.usedAt) {
      res.status(410).json({ success: false, message: "Convite ja utilizado" });
      return;
    }

    if (invite.expiresAt < new Date()) {
      res.status(410).json({ success: false, message: "Convite expirado" });
      return;
    }

    res.json({
      success: true,
      data: {
        ownerName: invite.owner.name,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error) {
    logger.error("AUTH", "Validate invite failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /register — create account (requires invite token)
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name, phone, countryCode, inviteToken } = req.body;

    if (!inviteToken) {
      res.status(403).json({
        success: false,
        message: "Registro requer um convite. Solicite um link de convite ao proprietario.",
      });
      return;
    }

    // Validate invite
    const invite = await prisma.inviteToken.findUnique({
      where: { token: inviteToken },
    });

    if (!invite) {
      res.status(404).json({ success: false, message: "Convite nao encontrado" });
      return;
    }

    if (invite.usedAt) {
      res.status(410).json({ success: false, message: "Convite ja utilizado" });
      return;
    }

    if (invite.expiresAt < new Date()) {
      res.status(410).json({ success: false, message: "Convite expirado" });
      return;
    }

    if (!email || !password || !name) {
      res.status(400).json({ success: false, message: "Email, senha e nome sao obrigatorios" });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ success: false, message: "Email ja cadastrado" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    let remoteJid: string | null = null;
    if (phone && countryCode) {
      const digits = phone.replace(/\D/g, "");
      remoteJid = `${countryCode}${digits}@s.whatsapp.net`;
    }

    // Create user + join team in a transaction
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          phone: phone || null,
          remoteJid,
          emailVerified: true,
        },
      });

      // Mark invite as used
      await tx.inviteToken.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), usedBy: newUser.id },
      });

      // Auto-join owner's team
      await tx.teamMember.create({
        data: {
          ownerId: invite.ownerId,
          userId: newUser.id,
          status: "accepted",
        },
      });

      // Notify owner
      await tx.notification.create({
        data: {
          userId: invite.ownerId,
          type: "team_member_joined",
          title: "Novo membro no time",
          message: `${name} entrou no time usando um link de convite.`,
          data: { userId: newUser.id, userName: name },
        },
      });

      return newUser;
    });

    logger.info("AUTH", "User registered via invite", {
      userId: user.id,
      email,
      ownerId: invite.ownerId,
    });

    res.status(201).json({
      success: true,
      message: "Conta criada com sucesso",
    });
  } catch (error) {
    logger.error("AUTH", "Register failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      logger.warn("AUTH", "Login attempt with missing fields");
      res.status(400).json({ success: false, message: "Email and password are required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      logger.warn("AUTH", "Login attempt with unknown email", { email });
      res.status(401).json({ success: false, message: "Email ou senha invalidos" });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      logger.warn("AUTH", "Login attempt with wrong password", { userId: user.id });
      res.status(401).json({ success: false, message: "Email ou senha invalidos" });
      return;
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = await generateRefreshToken(user.id);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    logger.info("AUTH", "User logged in", { userId: user.id });

    res.json({
      success: true,
      message: "Login successful",
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          isOwner: user.isOwner,
          emailVerified: user.emailVerified,
        },
      },
    });
  } catch (error) {
    logger.error("AUTH", "Login failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /logout
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    logger.info("AUTH", "User logged out");
    res.json({ success: true, message: "Logout successful" });
  } catch (error) {
    logger.error("AUTH", "Logout failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /forgot-password
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ success: false, message: "Email is required" });
      return;
    }

    logger.info("AUTH", "Password reset requested", { email });

    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      const resetToken = await generatePasswordResetToken(user.id);
      sendPasswordResetEmail(email, user.name, resetToken).catch((emailError) => {
        logger.error("EMAIL", "Failed to send password reset email", emailError);
      });
    }

    res.json({
      success: true,
      message: "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (error) {
    logger.error("AUTH", "Forgot password failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /reset-password
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      res.status(400).json({ success: false, message: "Token and new password are required" });
      return;
    }

    await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });

    if (!resetToken || resetToken.expiresAt < new Date()) {
      if (resetToken) await prisma.passwordResetToken.delete({ where: { id: resetToken.id } });
      res.status(400).json({ success: false, message: "Token invalido ou expirado" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: hashedPassword },
    });

    await prisma.passwordResetToken.delete({ where: { id: resetToken.id } });

    logger.info("AUTH", "Password reset successful", { userId: resetToken.userId });
    res.json({ success: true, message: "Senha redefinida com sucesso" });
  } catch (error) {
    logger.error("AUTH", "Reset password failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /refresh-token
router.post("/refresh-token", async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ success: false, message: "Refresh token is required" });
      return;
    }

    await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    const storedToken = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      if (storedToken) await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });
      res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
      return;
    }

    await prisma.refreshToken.delete({ where: { id: storedToken.id } });

    const newAccessToken = generateAccessToken(storedToken.userId);
    const newRefreshToken = await generateRefreshToken(storedToken.userId);

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    logger.info("AUTH", "Token refreshed", { userId: storedToken.userId });

    res.json({
      success: true,
      message: "Token refreshed successfully",
      data: { accessToken: newAccessToken },
    });
  } catch (error) {
    logger.error("AUTH", "Token refresh failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /me
router.get("/me", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        remoteJid: true,
        isOwner: true,
        emailVerified: true,
      },
    });

    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    res.json({ success: true, message: "User data retrieved", data: { user } });
  } catch (error) {
    logger.error("AUTH", "Get me failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /me — update account
router.patch("/me", authenticate, async (req: Request, res: Response) => {
  try {
    const { name, phone, countryCode, currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (phone !== undefined) {
      data.phone = phone?.trim() || null;
      if (phone?.trim() && countryCode) {
        const digits = phone.replace(/\D/g, "");
        data.remoteJid = `${countryCode}${digits}@s.whatsapp.net`;
      } else if (!phone?.trim()) {
        data.remoteJid = null;
      }
    }

    if (newPassword) {
      if (!currentPassword) {
        res.status(400).json({ success: false, message: "Senha atual e obrigatoria" });
        return;
      }
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        res.status(400).json({ success: false, message: "Senha atual incorreta" });
        return;
      }
      if (newPassword.length < 6) {
        res.status(400).json({ success: false, message: "Nova senha deve ter no minimo 6 caracteres" });
        return;
      }
      data.password = await bcrypt.hash(newPassword, 12);
    }

    const updated = await prisma.user.update({
      where: { id: req.userId },
      data,
      select: { id: true, email: true, name: true, phone: true, remoteJid: true, isOwner: true, emailVerified: true },
    });

    logger.info("AUTH", "Account updated", { userId: req.userId });
    res.json({ success: true, data: { user: updated } });
  } catch (error) {
    logger.error("AUTH", "Update account failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
