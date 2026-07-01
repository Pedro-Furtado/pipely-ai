import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../services/token.js";
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

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        phone: phone || null,
        isOwner: true,
      },
    });

    clearSetupCache();
    logger.info("AUTH", "Owner account created", { userId: user.id, email });

    // Auto-configure WhatsApp if Evolution Go is bundled
    const evolutionUrl = process.env.EVOLUTION_SERVER_URL;
    const evolutionKey = process.env.EVOLUTION_API_KEY;
    if (evolutionUrl && evolutionKey) {
      try {
        await prisma.whatsAppConfig.create({
          data: {
            userId: user.id,
            serverUrl: evolutionUrl,
            globalApiKey: evolutionKey,
          },
        });
        logger.info("AUTH", "Auto-configured WhatsApp (bundled Evolution Go)");
      } catch {
        logger.warn("AUTH", "Could not auto-configure WhatsApp");
      }
    }

    res.status(201).json({
      success: true,
      message: "Conta de proprietario criada com sucesso",
    });
  } catch (error) {
    logger.error("AUTH", "Setup failed", error);
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

// POST /reset-password — reset password using setup key
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { setupKey, password } = req.body;

    if (!setupKey || !password) {
      res.status(400).json({ success: false, message: "Chave de setup e nova senha sao obrigatorios" });
      return;
    }

    const expectedKey = process.env.OWNER_SETUP_KEY;
    if (!expectedKey) {
      res.status(500).json({ success: false, message: "Setup key not configured on server" });
      return;
    }

    if (setupKey !== expectedKey) {
      res.status(403).json({ success: false, message: "Chave de setup invalida" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ success: false, message: "Senha deve ter no minimo 6 caracteres" });
      return;
    }

    const owner = await prisma.user.findFirst({ where: { isOwner: true } });
    if (!owner) {
      res.status(404).json({ success: false, message: "Nenhuma conta encontrada" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: owner.id },
      data: { password: hashedPassword },
    });

    logger.info("AUTH", "Password reset via setup key", { userId: owner.id });
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
        isOwner: true,
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
    const { name, phone, currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (phone !== undefined) data.phone = phone?.trim() || null;

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
      select: { id: true, email: true, name: true, phone: true, isOwner: true },
    });

    logger.info("AUTH", "Account updated", { userId: req.userId });
    res.json({ success: true, data: { user: updated } });
  } catch (error) {
    logger.error("AUTH", "Update account failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
