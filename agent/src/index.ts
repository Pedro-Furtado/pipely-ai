import http from "http";
import { env } from "./lib/env.js";
import { log } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { scanPipelines } from "./processor/pipeline-scanner.js";
import { processBlock } from "./processor/block-processor.js";
import { processReply } from "./processor/reply-processor.js";

const TAG = "AGENT";

// ─── CRON: Pipeline scanner ──────────────────────────────────────────────────

let isProcessing = false;

async function tick() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const owners = await scanPipelines();
    for (const owner of owners) {
      for (const blockCtx of owner.dynamicBlocks) {
        try {
          await processBlock(blockCtx, owner);
        } catch (err) {
          log.error(TAG, `Error processing block "${blockCtx.block.name}"`, err);
        }
      }
    }
  } catch (err) {
    log.error(TAG, "Tick failed", err);
  } finally {
    isProcessing = false;
  }
}

// ─── HTTP: Webhook receiver ──────────────────────────────────────────────────

async function handleWebhook(body: Record<string, unknown>): Promise<void> {
  const event = body.event as string;
  const data = body.data as Record<string, unknown> | undefined;

  if (!data) return;

  // Extract message info — support both Evolution API v2 and Evolution Go formats
  const info = data.Info as Record<string, unknown> | undefined;
  const msgData = data.Message as Record<string, unknown> | undefined;
  const key = data.key as Record<string, unknown> | undefined;
  const msg = data.message as Record<string, unknown> | undefined;

  // Evolution Go format: data.Info.Chat, data.Info.IsFromMe, data.Message.Conversation
  if (info) {
    if (info.IsFromMe) return;
    if (info.IsGroup) return;

    const remoteJid = info.Chat as string;
    if (!remoteJid || !remoteJid.includes("@s.whatsapp.net")) return;

    const text =
      (msgData?.conversation as string) ||
      (msgData?.Conversation as string) ||
      ((msgData?.extendedTextMessage as Record<string, unknown>)?.text as string) ||
      ((msgData?.ExtendedTextMessage as Record<string, unknown>)?.Text as string) ||
      "";

    if (!text.trim()) return;

    const instanceName = (body.instance as string) || (body.instanceName as string) || (data.instanceName as string) || "";
    await resolveAndProcess(remoteJid, text, instanceName);
    return;
  }

  // Evolution API v2 format: data.key.remoteJid, data.message.conversation
  if (event !== "messages.upsert" && event !== "MESSAGES_UPSERT") return;

  if (!key || !msg) return;
  if (key.fromMe) return;

  const remoteJid = key.remoteJid as string;
  if (!remoteJid || remoteJid.includes("@g.us") || remoteJid.includes("@newsletter")) return;

  const text =
    (msg.conversation as string) ||
    ((msg.extendedTextMessage as Record<string, unknown>)?.text as string) ||
    "";

  if (!text.trim()) return;

  const instanceName = (body.instance as string) || (data.instance as string) || "";
  await resolveAndProcess(remoteJid, text, instanceName);
}

async function resolveAndProcess(remoteJid: string, text: string, instanceName: string): Promise<void> {
  log.info(TAG, `Message from ${remoteJid.substring(0, 8)}...: "${text.substring(0, 80)}"`);

  const configs = await prisma.whatsAppConfig.findMany();
  let ownerServerUrl = "";
  let ownerInstanceToken = "";

  for (const config of configs) {
    try {
      const res = await fetch(`${config.serverUrl}/instance/all`, {
        headers: { apikey: config.globalApiKey },
      });
      const json = (await res.json()) as Record<string, unknown>;
      const instances = (json.data as Array<Record<string, unknown>>) || [];

      // Match by instance name/id, or if no instanceName, use first connected instance
      const match = instanceName
        ? instances.find((i) => i.name === instanceName || i.id === instanceName)
        : instances.find((i) => i.connected) || instances[0];

      if (match) {
        // Check if message is from the instance's own number (owner sending from phone)
        const ownerJid = String(match.ownerJid || match.owner || "");
        if (ownerJid && remoteJid === ownerJid) {
          log.info(TAG, `Ignoring message from instance owner (${remoteJid.substring(0, 8)}...)`);
          return;
        }

        ownerServerUrl = config.serverUrl;
        ownerInstanceToken = String(match.token || config.globalApiKey);
        break;
      }
    } catch { /* skip */ }
  }

  if (!ownerServerUrl) {
    log.warn(TAG, `No owner for instance "${instanceName || "unknown"}"`);
    return;
  }

  processReply({
    remoteJid,
    message: text,
    ownerServerUrl,
    ownerInstanceToken,
  }).catch((err) => log.error(TAG, "Reply processing failed", err));
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST") {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ received: true }));

      try {
        const parsed = JSON.parse(body);
        const d = parsed.data || {};
        const inf = d.Info || {};
        const msgD = d.Message || {};
        log.info(TAG, `Webhook: event=${parsed.event} instance=${parsed.instance || parsed.instanceName || d.instanceName} chat=${inf.Chat} fromMe=${inf.IsFromMe}`);
        log.info(TAG, `Message keys: ${JSON.stringify(Object.keys(msgD))} | Message: ${JSON.stringify(msgD).substring(0, 400)}`);
        handleWebhook(parsed).catch((err) => log.error(TAG, "Webhook error", err));
      } catch (err) {
        log.error(TAG, "Webhook parse error", err);
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

// ─── START ───────────────────────────────────────────────────────────────────

async function main() {
  log.info(TAG, "Pipely Agent v1.0");
  log.info(TAG, `Poll: ${env.POLL_INTERVAL_MS / 1000}s | Webhook: port ${env.PORT}`);

  server.listen(env.PORT, () => {
    log.info(TAG, `Webhook ready at http://localhost:${env.PORT}/webhook`);
  });

  await tick();
  setInterval(tick, env.POLL_INTERVAL_MS);
}

main().catch((err) => {
  log.error(TAG, "Fatal error", err);
  process.exit(1);
});

async function shutdown() {
  log.info(TAG, "Shutting down...");
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
