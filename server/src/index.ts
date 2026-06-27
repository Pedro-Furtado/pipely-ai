import "dotenv/config";
import crypto from "crypto";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.js";
import teamRoutes from "./routes/team.js";
import pipelineRoutes from "./routes/pipeline.js";
import notificationRoutes from "./routes/notifications.js";
import whatsappRoutes from "./routes/whatsapp.js";
import taskRoutes from "./routes/tasks.js";
import aiRoutes from "./routes/ai.js";
import agentLogRoutes from "./routes/agent-logs.js";
import { prisma } from "./lib/prisma.js";
import { logger } from "./lib/logger.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { setupGuard } from "./middleware/setupGuard.js";

const app = express();
const PORT = process.env.PORT || 3333;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(helmet());
app.use(cookieParser());
app.use(express.json());
app.use(requestLogger);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});
app.use(limiter);
app.use(setupGuard);

app.use("/api/auth", authRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/pipeline", pipelineRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/agent-logs", agentLogRoutes);

app.get("/health", (_req, res) => {
  res.json({ success: true, message: "Server is running" });
});

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error("SERVER", "Unhandled error", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
);

const server = http.createServer(app);
server.listen(PORT, async () => {
  logger.info("SERVER", `Running on port ${PORT}`);

  // Auto-generate OWNER_SETUP_KEY if not set and no owner exists
  if (!process.env.OWNER_SETUP_KEY) {
    const owner = await prisma.user.findFirst({ where: { isOwner: true } });
    if (!owner) {
      const key = crypto.randomUUID();
      process.env.OWNER_SETUP_KEY = key;
      console.log("");
      console.log("═══════════════════════════════════════════════════════════");
      console.log("  PIPELY AI — SETUP KEY (auto-generated)");
      console.log("");
      console.log(`  ${key}`);
      console.log("");
      console.log("  Use this key at /setup to create your owner account.");
      console.log("  Or set OWNER_SETUP_KEY in server/.env to persist it.");
      console.log("═══════════════════════════════════════════════════════════");
      console.log("");
    }
  }
});

async function shutdown() {
  logger.info("SERVER", "Shutting down...");
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
