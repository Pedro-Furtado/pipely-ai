import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

// ─── CONFIG (only credentials, no instance data) ─────────────────────────────

// GET /api/whatsapp/config
router.get("/config", async (req: Request, res: Response) => {
  try {
    const config = await prisma.whatsAppConfig.findUnique({
      where: { userId: req.userId },
    });

    res.json({
      success: true,
      data: config
        ? { id: config.id, serverUrl: config.serverUrl }
        : null,
    });
  } catch (error) {
    logger.error("WHATSAPP", "Get config failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/whatsapp/config
router.post("/config", async (req: Request, res: Response) => {
  try {
    const { serverUrl, globalApiKey } = req.body;

    if (!serverUrl?.trim() || !globalApiKey?.trim()) {
      res.status(400).json({ success: false, message: "serverUrl and globalApiKey are required" });
      return;
    }

    let cleanUrl = serverUrl.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = `https://${cleanUrl}`;
    }

    // Validate credentials by hitting /server/ok
    try {
      const testRes = await fetch(`${cleanUrl}/server/ok`, {
        headers: { apikey: globalApiKey.trim() },
      });
      if (!testRes.ok) {
        res.status(400).json({ success: false, message: "Nao foi possivel conectar. Verifique URL e API Key." });
        return;
      }
    } catch {
      res.status(400).json({ success: false, message: "Nao foi possivel conectar ao servidor." });
      return;
    }

    await prisma.whatsAppConfig.upsert({
      where: { userId: req.userId },
      update: { serverUrl: cleanUrl, globalApiKey: globalApiKey.trim() },
      create: { userId: req.userId, serverUrl: cleanUrl, globalApiKey: globalApiKey.trim() },
    });

    logger.info("WHATSAPP", "Config saved", { userId: req.userId });
    res.json({ success: true, message: "Credenciais salvas" });
  } catch (error) {
    logger.error("WHATSAPP", "Save config failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/whatsapp/config
router.delete("/config", async (req: Request, res: Response) => {
  try {
    await prisma.whatsAppConfig.deleteMany({ where: { userId: req.userId } });
    logger.info("WHATSAPP", "Config removed", { userId: req.userId });
    res.json({ success: true, message: "Credenciais removidas" });
  } catch (error) {
    logger.error("WHATSAPP", "Remove config failed", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── EVOLUTION PROXY ─────────────────────────────────────────────────────────

// Verify instance belongs to user's Evolution server and return its token
async function getVerifiedInstance(userId: string, instanceId: string): Promise<{ token: string } | null> {
  const allResult = await evolutionFetch(userId, "/instance/all");
  const instances = ((allResult.data as Record<string, unknown>)?.data as Array<Record<string, unknown>>) || [];
  const instance = instances.find((i) => i.id === instanceId);
  if (!instance) return null;
  return { token: String(instance.token || "") };
}

async function evolutionFetch(userId: string, path: string, method: string = "GET", body?: unknown, instanceToken?: string) {
  const config = await prisma.whatsAppConfig.findUnique({ where: { userId } });
  if (!config) throw new Error("NO_CONFIG");

  const url = `${config.serverUrl}${path}`;
  const apikey = instanceToken || config.globalApiKey;

  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", apikey },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    logger.warn("WHATSAPP", `Non-JSON response: ${text.substring(0, 200)}`);
    data = { raw: text };
  }

  return { status: response.status, data };
}

// ─── INSTANCES (all fetched from Evolution in real-time) ─────────────────────

// GET /api/whatsapp/instances — list all instances from Evolution
router.get("/instances", async (req: Request, res: Response) => {
  try {
    const result = await evolutionFetch(req.userId, "/instance/all");
    const data = result.data as Record<string, unknown>;
    const instances = (data?.data as Array<Record<string, unknown>>) || [];

    res.json({ success: true, data: instances });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_CONFIG") {
      res.json({ success: true, data: [] });
      return;
    }
    logger.error("WHATSAPP", "List instances failed", error);
    res.status(500).json({ success: false, message: "Erro ao buscar instancias" });
  }
});

// POST /api/whatsapp/instances — create instance
router.post("/instances", async (req: Request, res: Response) => {
  try {
    const { name, token } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ success: false, message: "Nome da instancia e obrigatorio" });
      return;
    }

    const crypto = await import("crypto");
    const instanceToken = token?.trim() || crypto.randomBytes(24).toString("hex");

    const result = await evolutionFetch(req.userId, "/instance/create", "POST", {
      name: name.trim(),
      token: instanceToken,
    });

    const data = result.data as Record<string, unknown>;

    if (data?.error) {
      res.status(400).json({ success: false, message: String(data.error) });
      return;
    }

    logger.info("WHATSAPP", "Instance created", { name: name.trim() });
    res.status(201).json({ success: true, data: data?.data || data });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_CONFIG") {
      res.status(400).json({ success: false, message: "Configure suas credenciais primeiro" });
      return;
    }
    logger.error("WHATSAPP", "Create instance failed", error);
    res.status(500).json({ success: false, message: "Erro ao criar instancia" });
  }
});

// DELETE /api/whatsapp/instances/:instanceId — delete instance
router.delete("/instances/:instanceId", async (req: Request, res: Response) => {
  try {
    const result = await evolutionFetch(req.userId, `/instance/delete/${req.params.instanceId}`, "DELETE");
    const data = result.data as Record<string, unknown>;

    if (data?.error) {
      res.status(400).json({ success: false, message: String(data.error) });
      return;
    }

    logger.info("WHATSAPP", "Instance deleted", { instanceId: req.params.instanceId });
    res.json({ success: true, message: "Instancia excluida" });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_CONFIG") {
      res.status(400).json({ success: false, message: "Configure suas credenciais primeiro" });
      return;
    }
    logger.error("WHATSAPP", "Delete instance failed", error);
    res.status(500).json({ success: false, message: "Erro ao excluir instancia" });
  }
});

// GET /api/whatsapp/instances/:instanceId/status — instance status
router.get("/instances/:instanceId/status", async (req: Request, res: Response) => {
  try {
    const verified = await getVerifiedInstance(req.userId, req.params.instanceId);
    if (!verified) {
      res.status(404).json({ success: false, message: "Instancia nao encontrada" });
      return;
    }

    const result = await evolutionFetch(req.userId, "/instance/status", "GET", undefined, verified.token);
    const data = result.data as Record<string, unknown>;
    const nested = (data?.data as Record<string, unknown>) || data;

    const connected = nested?.Connected ?? nested?.connected;
    const state = connected === true ? "open" : connected === false ? "close" : "unknown";
    const name = nested?.Name || nested?.name || instance?.name || "";

    res.json({ success: true, data: { state, name, connected: !!connected } });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_CONFIG") {
      res.json({ success: true, data: { state: "not_configured" } });
      return;
    }
    logger.error("WHATSAPP", "Get status failed", error);
    res.status(500).json({ success: false, message: "Erro ao verificar status" });
  }
});

// GET /api/whatsapp/instances/:instanceId/qr — get QR code
router.get("/instances/:instanceId/qr", async (req: Request, res: Response) => {
  try {
    const verified = await getVerifiedInstance(req.userId, req.params.instanceId);
    if (!verified) {
      res.status(404).json({ success: false, message: "Instancia nao encontrada" });
      return;
    }

    const result = await evolutionFetch(req.userId, "/instance/qr", "GET", undefined, verified.token);
    const data = result.data as Record<string, unknown>;
    const nested = (data?.data as Record<string, unknown>) || data;
    const qrcode = nested?.Qrcode || nested?.qrcode || nested?.base64 || "";

    res.json({ success: true, data: { qrcode } });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_CONFIG") {
      res.status(400).json({ success: false, message: "Configure suas credenciais primeiro" });
      return;
    }
    logger.error("WHATSAPP", "Get QR failed", error);
    res.status(500).json({ success: false, message: "Erro ao gerar QR Code" });
  }
});

// POST /api/whatsapp/instances/:instanceId/connect
router.post("/instances/:instanceId/connect", async (req: Request, res: Response) => {
  try {
    const verified = await getVerifiedInstance(req.userId, req.params.instanceId);
    if (!verified) {
      res.status(404).json({ success: false, message: "Instancia nao encontrada" });
      return;
    }

    const result = await evolutionFetch(req.userId, "/instance/connect", "POST", undefined, verified.token);
    res.json({ success: true, data: result.data });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_CONFIG") {
      res.status(400).json({ success: false, message: "Configure suas credenciais primeiro" });
      return;
    }
    logger.error("WHATSAPP", "Connect failed", error);
    res.status(500).json({ success: false, message: "Erro ao conectar" });
  }
});

// POST /api/whatsapp/instances/:instanceId/disconnect
router.post("/instances/:instanceId/disconnect", async (req: Request, res: Response) => {
  try {
    const verified = await getVerifiedInstance(req.userId, req.params.instanceId);
    if (!verified) {
      res.status(404).json({ success: false, message: "Instancia nao encontrada" });
      return;
    }

    const result = await evolutionFetch(req.userId, "/instance/disconnect", "POST", undefined, verified.token);
    logger.info("WHATSAPP", "Instance disconnected", { instanceId: req.params.instanceId });
    res.json({ success: true, data: result.data });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_CONFIG") {
      res.status(400).json({ success: false, message: "Configure suas credenciais primeiro" });
      return;
    }
    logger.error("WHATSAPP", "Disconnect failed", error);
    res.status(500).json({ success: false, message: "Erro ao desconectar" });
  }
});

// GET /api/whatsapp/instances/:instanceId/webhook — check webhook config
router.get("/instances/:instanceId/webhook", async (req: Request, res: Response) => {
  try {
    const verified = await getVerifiedInstance(req.userId, req.params.instanceId);
    if (!verified) {
      res.status(404).json({ success: false, message: "Instancia nao encontrada" });
      return;
    }

    const result = await evolutionFetch(req.userId, "/webhook/find", "GET", undefined, verified.token);
    const data = result.data as Record<string, unknown>;
    logger.info("WHATSAPP", "Webhook find response", { data: JSON.stringify(data).substring(0, 500) });

    // Evolution Go may nest data differently
    const nested = (data?.data as Record<string, unknown>) || data;
    // Try multiple field names — Evolution Go varies between versions
    const webhookUrl = (
      nested?.Url || nested?.url || nested?.webhook ||
      nested?.webhookUrl || nested?.webhook_url ||
      (nested?.webhook as Record<string, unknown>)?.url ||
      ""
    ) as string;
    const enabled = !!(nested?.Enabled ?? nested?.enabled ?? nested?.active ?? !!webhookUrl);

    res.json({ success: true, data: { url: webhookUrl, enabled, raw: nested } });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_CONFIG") {
      res.json({ success: true, data: { url: "", enabled: false } });
      return;
    }
    logger.error("WHATSAPP", "Get webhook failed", error);
    res.status(500).json({ success: false, message: "Erro ao verificar webhook" });
  }
});

// POST /api/whatsapp/instances/:instanceId/webhook — set webhook URL
router.post("/instances/:instanceId/webhook", async (req: Request, res: Response) => {
  try {
    const verified = await getVerifiedInstance(req.userId, req.params.instanceId);
    if (!verified) {
      res.status(404).json({ success: false, message: "Instancia nao encontrada" });
      return;
    }

    const { url } = req.body;
    if (!url?.trim()) {
      res.status(400).json({ success: false, message: "URL do webhook e obrigatoria" });
      return;
    }

    const result = await evolutionFetch(req.userId, "/webhook/set", "POST", {
      url: url.trim(),
      enabled: true,
      events: ["MESSAGES_UPSERT"],
    }, verified.token);

    const data = result.data as Record<string, unknown>;
    if (data?.error) {
      res.status(400).json({ success: false, message: String(data.error) });
      return;
    }

    logger.info("WHATSAPP", "Webhook configured", { instanceId: req.params.instanceId, url: url.trim() });
    res.json({ success: true, message: "Webhook configurado" });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_CONFIG") {
      res.status(400).json({ success: false, message: "Configure suas credenciais primeiro" });
      return;
    }
    logger.error("WHATSAPP", "Set webhook failed", error);
    res.status(500).json({ success: false, message: "Erro ao configurar webhook" });
  }
});

export default router;
