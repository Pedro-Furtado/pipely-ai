#!/usr/bin/env node

/**
 * Build script for local bundle (no Docker).
 * Creates a self-contained package in dist-local/ that can be:
 * - Downloaded from GitHub Releases
 * - Extracted to ~/.pipely/
 * - Run with: node start.mjs
 */

import { execSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "dist-local");

function run(cmd, cwd = ROOT) {
  console.log(`  → ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function step(msg) {
  console.log(`\n  ── ${msg} ──`);
}

console.log("\n  Build Local Bundle\n");

// Clean
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

// 1. Build frontend
step("Frontend (vite build)");
run("npx vite build", ROOT);
cpSync(join(ROOT, "dist"), join(OUT, "frontend"), { recursive: true });

// 2. Compile server
step("Server (tsc)");
mkdirSync(join(OUT, "server"), { recursive: true });
try {
  run("npx tsc --outDir ../dist-local/server/dist", join(ROOT, "server"));
} catch {
  // tsc may have errors but still emits files
  console.log("  ⚠ tsc had errors (continuing)");
}
// Copy prisma schema (SQLite version)
mkdirSync(join(OUT, "server/prisma"), { recursive: true });
copyFileSync(
  join(ROOT, "server/prisma/schema.sqlite.prisma"),
  join(OUT, "server/prisma/schema.prisma")
);

// 3. Compile agent
step("Agent (tsc)");
mkdirSync(join(OUT, "agent"), { recursive: true });
try {
  run("npx tsc --outDir ../dist-local/agent/dist", join(ROOT, "agent"));
} catch {
  console.log("  ⚠ tsc had errors (continuing)");
}

// 4. Generate package.json for the bundle
step("Package config");
writeFileSync(
  join(OUT, "package.json"),
  JSON.stringify(
    {
      name: "pipely-local",
      version: "1.0.0",
      type: "module",
      private: true,
      dependencies: {
        "@prisma/client": "^7.0.0",
        "prisma": "^7.0.0",
        bcryptjs: "^3.0.2",
        cors: "^2.8.5",
        "cookie-parser": "^1.4.7",
        dotenv: "^16.4.7",
        express: "^5.1.0",
        "express-rate-limit": "^7.5.0",
        helmet: "^8.1.0",
        jsonwebtoken: "^9.0.2",
        openai: "^5.8.2",
      },
    },
    null,
    2
  )
);

// 5. Create start script
step("Start script");
writeFileSync(
  join(OUT, "start.mjs"),
  `#!/usr/bin/env node
import { fork } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import express from "express";
import http from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.FRONTEND_PORT || 3000;

// Serve frontend static files
const app = express();
app.use(express.static(join(__dirname, "frontend")));
app.get(/^\\/(?!api|health).*/, (_req, res) => {
  res.sendFile(join(__dirname, "frontend/index.html"));
});

// Proxy API requests to backend
const { createProxyMiddleware } = await import("http-proxy-middleware").catch(() => ({ default: null }));
if (createProxyMiddleware) {
  app.use("/api", createProxyMiddleware({ target: "http://localhost:3333", changeOrigin: true }));
} else {
  // Fallback: frontend connects directly to backend port
  console.log("  Note: http-proxy-middleware not installed, frontend uses direct backend connection");
}

const frontendServer = http.createServer(app);
frontendServer.listen(PORT, () => {
  console.log(\`  Frontend: http://localhost:\${PORT}\`);
});

// Start server
const server = fork(join(__dirname, "server/dist/index.js"), [], {
  cwd: join(__dirname, "server"),
  env: { ...process.env, PORT: "3333" },
  stdio: "inherit",
});

// Start agent
const agent = fork(join(__dirname, "agent/dist/index.js"), [], {
  cwd: join(__dirname, "agent"),
  env: { ...process.env, PORT: "3335" },
  stdio: "inherit",
});

function shutdown() {
  server.kill();
  agent.kill();
  frontendServer.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
server.on("exit", () => { agent.kill(); process.exit(1); });
agent.on("exit", () => { server.kill(); process.exit(1); });
`
);

// 6. Create .env template
writeFileSync(
  join(OUT, ".env.template"),
  `# Pipely AI — Local Mode
DATABASE_URL=file:./data/pipely.db
JWT_SECRET=__JWT_SECRET__
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:3333
POLL_INTERVAL_MS=60000
PORT=3333
`
);

step("Done");
console.log(`\n  Bundle: ${OUT}`);
console.log("  Next: tar -czf pipely-local.tar.gz -C dist-local .\n");
