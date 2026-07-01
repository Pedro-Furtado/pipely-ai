#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { createServer as createNetServer } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import { execSync, fork } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync, rmSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { platform, release, arch } from "node:os";
import http from "node:http";
import https from "node:https";

// ── ANSI Colors ──────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
};

// ── Helpers ──────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function detectOS() {
  const p = platform();
  const r = release();
  const a = arch();
  const labels = {
    win32: `Windows (${r})`,
    darwin: `macOS (${r})`,
    linux: `Linux (${r})`,
    freebsd: `FreeBSD (${r})`,
  };
  return { platform: p, label: labels[p] || `${p} (${r})`, arch: a };
}

function checkDocker() {
  try {
    const version = execSync("docker --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const match = version.match(/Docker version ([^\s,]+)/);
    return { ok: true, version: match ? match[1] : version };
  } catch {
    return { ok: false, version: null };
  }
}

function getComposeCmd() {
  try {
    execSync("docker compose version", { stdio: "pipe" });
    return "docker compose";
  } catch {
    try {
      execSync("docker-compose version", { stdio: "pipe" });
      return "docker-compose";
    } catch {
      return null;
    }
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => {
        try {
          const out = execSync("docker ps --format '{{.Ports}}' 2>/dev/null", {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
          resolve(!out.includes(`:${port}->`));
        } catch {
          resolve(true);
        }
      });
    });
    server.listen(port, "0.0.0.0");
  });
}

function generateKey(length = 32) {
  return randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}

function httpGet(url) {
  return new Promise((resolve) => {
    http
      .get(url, (res) => resolve(res.statusCode === 200))
      .on("error", () => resolve(false));
  });
}

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function getServerIP() {
  try {
    return execSync(
      "hostname -I 2>/dev/null || curl -s ifconfig.me 2>/dev/null",
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    )
      .trim()
      .split(/\s+/)[0] || null;
  } catch {
    return null;
  }
}

function isRoot() {
  try {
    execSync("test $(id -u) -eq 0", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function findProjectDir() {
  // Look for docker-compose.yml with pipely containers
  const candidates = [process.cwd(), join(process.env.HOME || "/root", "pipely")];
  for (const dir of candidates) {
    const composePath = join(dir, "docker-compose.yml");
    if (existsSync(composePath)) {
      try {
        const content = readFileSync(composePath, "utf-8");
        if (content.includes("pipely")) return dir;
      } catch {}
    }
  }
  return null;
}

function readEnvFile(dir) {
  try {
    const content = readFileSync(join(dir, ".env"), "utf-8");
    const env = {};
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) env[match[1]] = match[2];
    }
    return env;
  } catch {
    return {};
  }
}

function requireProject() {
  const dir = findProjectDir();
  if (!dir) {
    console.log(`\n  ${c.red}✗ Projeto Pipely nao encontrado${c.reset}`);
    console.log(`  Execute na pasta onde rodou ${c.cyan}npx pipely-ai${c.reset} ou instale primeiro.\n`);
    process.exit(1);
  }
  const composeCmd = getComposeCmd();
  if (!composeCmd) {
    console.log(`\n  ${c.red}✗ Docker Compose nao encontrado${c.reset}\n`);
    process.exit(1);
  }
  return { dir, composeCmd };
}

// ── Port prompt ─────────────────────────────────────

async function askPort(rl, label, defaultPort, takenPorts) {
  while (true) {
    const raw = await rl.question(`  ${label} ${c.dim}[${defaultPort}]${c.reset}: `);
    const port = parseInt(raw.trim() || String(defaultPort), 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.log(`  ${c.red}✗ Porta invalida (1-65535)${c.reset}\n`);
      continue;
    }
    if (takenPorts.includes(port)) {
      console.log(`  ${c.red}✗ Porta ${port} ja escolhida para outro servico${c.reset}\n`);
      continue;
    }
    process.stdout.write(`  ${c.dim}→ Testando porta ${port}...${c.reset} `);
    if (await isPortFree(port)) {
      console.log(`${c.green}✓ Livre${c.reset}\n`);
      return port;
    }
    console.log(`${c.red}✗ Em uso!${c.reset}\n`);
  }
}

async function askYesNo(rl, question, defaultNo = true) {
  const hint = defaultNo ? "s/N" : "S/n";
  const raw = await rl.question(`  ${question} ${c.dim}[${hint}]${c.reset}: `);
  const answer = raw.trim().toLowerCase();
  if (defaultNo) return answer === "s" || answer === "y";
  return answer !== "n";
}

// ── Docker Compose template ─────────────────────────

function generateCompose(ports, domain) {
  const frontendUrl = domain
    ? `https://${domain}`
    : `http://localhost:\${FRONTEND_PORT:-${ports.frontend}}`;

  return `# Pipely AI — gerado por npx pipely-ai
# Docs: https://github.com/Pedro-Furtado/pipely-ai

services:
  db:
    image: postgres:17-alpine
    container_name: pipely-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: pipely
      POSTGRES_PASSWORD: \${DB_PASSWORD}
      POSTGRES_DB: pipely_ai
    ports:
      - "\${DB_PORT:-${ports.db}}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init-db.sh:/docker-entrypoint-initdb.d/init-db.sh
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pipely -d pipely_ai"]
      interval: 5s
      timeout: 3s
      retries: 10

  evolution:
    image: evoapicloud/evolution-go:latest
    container_name: pipely-evolution
    restart: unless-stopped
    environment:
      - GLOBAL_API_KEY=\${EVOLUTION_API_KEY}
      - CLIENT_NAME=pipely
      - SERVER_PORT=8080
      - DATABASE_SAVE_MESSAGES=true
      - POSTGRES_AUTH_DB=postgresql://pipely:\${DB_PASSWORD}@db:5432/evolution_go?sslmode=disable
      - POSTGRES_USERS_DB=postgresql://pipely:\${DB_PASSWORD}@db:5432/evolution_go?sslmode=disable
      - LOGTYPE=text
      - WA_DEBUG=false
    ports:
      - "\${EVOLUTION_PORT:-${ports.evolution}}:8080"
    depends_on:
      db:
        condition: service_healthy

  app:
    image: ghcr.io/pedro-furtado/pipely-ai:latest
    container_name: pipely-app
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql://pipely:\${DB_PASSWORD}@db:5432/pipely_ai
      - JWT_SECRET=\${JWT_SECRET}
      - FRONTEND_URL=${frontendUrl}
      - BACKEND_URL=http://127.0.0.1:3333
      - POLL_INTERVAL_MS=\${POLL_INTERVAL_MS:-60000}
      - EVOLUTION_SERVER_URL=http://evolution:8080
      - EVOLUTION_API_KEY=\${EVOLUTION_API_KEY}
      - EVOLUTION_PORT=\${EVOLUTION_PORT:-${ports.evolution}}
      - NODE_ENV=production
    ports:
      - "\${FRONTEND_PORT:-${ports.frontend}}:80"
      - "\${BACKEND_PORT:-${ports.backend}}:3333"
      - "\${AGENT_PORT:-${ports.agent}}:3335"
    depends_on:
      db:
        condition: service_healthy
      evolution:
        condition: service_started

volumes:
  pgdata:
`;
}

// ── .env template ───────────────────────────────────

function generateEnv(ports, keys, domain) {
  const now = new Date().toISOString().split("T")[0];
  let env = `# Pipely AI — gerado por npx pipely-ai em ${now}
# Docs: https://github.com/Pedro-Furtado/pipely-ai

# ── Portas ────────────────────────────────
FRONTEND_PORT=${ports.frontend}
BACKEND_PORT=${ports.backend}
AGENT_PORT=${ports.agent}
EVOLUTION_PORT=${ports.evolution}
DB_PORT=${ports.db}

# ── Seguranca (auto-gerado — NAO compartilhe) ──
DB_PASSWORD=${keys.dbPassword}
JWT_SECRET=${keys.jwtSecret}
EVOLUTION_API_KEY=${keys.evolutionApiKey}

# ── App ───────────────────────────────────
POLL_INTERVAL_MS=60000
`;
  if (domain) {
    env += `\n# ── Dominio ───────────────────────────────\nAPP_DOMAIN=${domain}\n`;
  }
  return env;
}

const INIT_DB_SH = `#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE evolution_go' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution_go')\\gexec
EOSQL
`;

// ── Wait for health ─────────────────────────────────

async function waitForHealth(port, maxWaitMs = 120000) {
  const start = Date.now();
  let dots = 0;
  while (Date.now() - start < maxWaitMs) {
    if (await httpGet(`http://localhost:${port}/health`)) return true;
    await sleep(2000);
    if (++dots % 3 === 0) process.stdout.write(".");
  }
  return false;
}

// ── Extract setup key from logs ─────────────────────

function getSetupKey(composeCmd, cwd) {
  try {
    const logs = execSync(`${composeCmd} logs app 2>&1`, {
      cwd,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    const match = logs.match(
      /SETUP KEY[\s\S]*?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ── Domain + SSL ────────────────────────────────────

function setupDomainSSL(domain, port) {
  if (!commandExists("nginx")) {
    process.stdout.write(`  Instalando Nginx... `);
    try {
      execSync("apt-get update -qq && apt-get install -y -qq nginx > /dev/null 2>&1", { stdio: "pipe" });
      execSync("systemctl enable nginx && systemctl start nginx", { stdio: "pipe" });
      console.log(`${c.green}✓${c.reset}`);
    } catch {
      console.log(`${c.red}✗${c.reset}`);
      console.log(`  ${c.red}Erro ao instalar Nginx${c.reset}\n`);
      return false;
    }
  } else {
    console.log(`  ${c.green}✓${c.reset} Nginx instalado`);
  }

  if (!commandExists("certbot")) {
    process.stdout.write(`  Instalando Certbot... `);
    try {
      execSync("apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx > /dev/null 2>&1", { stdio: "pipe" });
      console.log(`${c.green}✓${c.reset}`);
    } catch {
      console.log(`${c.red}✗${c.reset}`);
      console.log(`  ${c.red}Erro ao instalar Certbot${c.reset}\n`);
      return false;
    }
  } else {
    console.log(`  ${c.green}✓${c.reset} Certbot instalado`);
  }

  try { execSync("rm -f /etc/nginx/sites-enabled/default", { stdio: "pipe" }); } catch {}

  process.stdout.write(`  Configurando Nginx... `);
  const nginxConfig = `server {
    listen 80;
    server_name ${domain};
    large_client_header_buffers 4 32k;
    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
`;
  try {
    writeFileSync("/etc/nginx/sites-available/pipely", nginxConfig);
    execSync("ln -sf /etc/nginx/sites-available/pipely /etc/nginx/sites-enabled/", { stdio: "pipe" });
    execSync("nginx -t", { stdio: "pipe" });
    execSync("systemctl reload nginx", { stdio: "pipe" });
    console.log(`${c.green}✓${c.reset}`);
  } catch {
    console.log(`${c.red}✗${c.reset}`);
    console.log(`  ${c.yellow}⚠ Nginx falhou (porta 80 pode estar em uso por outro proxy)${c.reset}`);
    console.log(`  ${c.dim}Se usa Caddy/Traefik, configure o proxy para ${domain} → localhost:${port}${c.reset}`);
    return false;
  }

  process.stdout.write(`  Configurando SSL... `);
  try {
    execSync(`certbot --nginx -d ${domain} --non-interactive --agree-tos --register-unsafely-without-email 2>&1`, { stdio: "pipe" });
    console.log(`${c.green}✓${c.reset}`);
    return true;
  } catch {
    console.log(`${c.yellow}✗${c.reset}`);
    console.log(`  ${c.yellow}⚠ SSL falhou. Verifique DNS A record.${c.reset}`);
    console.log(`  ${c.dim}Tente depois: certbot --nginx -d ${domain}${c.reset}`);
    return false;
  }
}

// ── Docker install help ─────────────────────────────

function printDockerHelp(os) {
  console.log(`\n  ${c.red}✗ Docker nao encontrado${c.reset}\n`);
  if (os.platform === "win32") {
    console.log(`  Windows: https://docs.docker.com/desktop/install/windows-install/\n`);
  } else if (os.platform === "darwin") {
    console.log(`  macOS: https://docs.docker.com/desktop/install/mac-install/\n`);
  } else {
    console.log(`  Linux: curl -fsSL https://get.docker.com | sh\n`);
  }
}

// ── Local Mode ──────────────────────────────────────

const BUNDLE_REPO = "Pedro-Furtado/pipely-ai";
const BUNDLE_NAME = "pipely-local.tar.gz";

function getLocalDir() {
  return process.cwd();
}

function getBundleDir() {
  return join(getLocalDir(), ".pipely");
}

async function getLatestReleaseUrl() {
  return new Promise((resolve) => {
    const url = `https://api.github.com/repos/${BUNDLE_REPO}/releases/latest`;
    https.get(url, { headers: { "User-Agent": "pipely-cli" } }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const release = JSON.parse(body);
          const asset = (release.assets || []).find((a) => a.name === BUNDLE_NAME);
          resolve(asset?.browser_download_url || null);
        } catch {
          resolve(null);
        }
      });
    }).on("error", () => resolve(null));
  });
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    function follow(url) {
      https.get(url, { headers: { "User-Agent": "pipely-cli" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const file = createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
      }).on("error", reject);
    }

    follow(url);
  });
}

function extractTarGz(file, dest) {
  mkdirSync(dest, { recursive: true });
  execSync(`tar -xzf "${file}" -C "${dest}"`, { stdio: "pipe" });
}

function getLocalEnvPath() {
  return join(getLocalDir(), ".env");
}

function isLocalInstalled() {
  const bd = getBundleDir();
  return existsSync(join(bd, "package.json")) && existsSync(join(bd, "server"));
}

function generateLocalEnv() {
  const jwtSecret = generateKey(64);
  const setupKey = randomUUID();
  const dir = getLocalDir();

  const dbPath = join(dir, "data", "pipely.db").replace(/\\/g, "/");
  const frontendPath = join(getBundleDir(), "frontend").replace(/\\/g, "/");
  const env = `# Pipely AI — Local Mode
DATABASE_URL=file:${dbPath}
JWT_SECRET=${jwtSecret}
OWNER_SETUP_KEY=${setupKey}
FRONTEND_URL=http://localhost:3333
BACKEND_URL=http://localhost:3333
SERVE_FRONTEND=${frontendPath}
POLL_INTERVAL_MS=60000
PORT=3333
`;
  return { env, setupKey };
}

async function installLocal() {
  const os = detectOS();
  const dir = getLocalDir();
  const bundleDir = getBundleDir();

  // Check if already installed
  if (isLocalInstalled()) {
    console.log(`  ${c.green}✓${c.reset} Pipely AI ja instalado em ${c.dim}${dir}${c.reset}\n`);
    console.log(`  Iniciando...\n`);
    return runLocal();
  }

  // Download bundle
  console.log(`  ${c.magenta}── Baixando Pipely AI ─────────────────────${c.reset}\n`);

  process.stdout.write(`  Buscando ultima versao... `);
  const bundleUrl = await getLatestReleaseUrl();

  if (!bundleUrl) {
    console.log(`${c.red}✗${c.reset}`);
    console.log(`\n  ${c.red}Bundle nao encontrado no GitHub Releases.${c.reset}`);
    console.log(`  ${c.dim}Verifique: https://github.com/${BUNDLE_REPO}/releases${c.reset}\n`);
    process.exit(1);
  }
  console.log(`${c.green}✓${c.reset}`);

  const tmpFile = join(dir, BUNDLE_NAME);
  mkdirSync(bundleDir, { recursive: true });

  process.stdout.write(`  Baixando bundle... `);
  try {
    await downloadFile(bundleUrl, tmpFile);
    console.log(`${c.green}✓${c.reset}`);
  } catch (err) {
    console.log(`${c.red}✗${c.reset}`);
    console.log(`  ${c.red}Erro: ${err.message}${c.reset}\n`);
    process.exit(1);
  }

  // Extract
  process.stdout.write(`  Extraindo... `);
  try {
    extractTarGz(tmpFile, bundleDir);
    console.log(`${c.green}✓${c.reset}`);
  } catch (err) {
    console.log(`${c.red}✗${c.reset}`);
    console.log(`  ${c.red}Erro: ${err.message}${c.reset}\n`);
    process.exit(1);
  }

  // Clean up tar
  try { unlinkSync(tmpFile); } catch {}

  // Install deps
  console.log(`\n  ${c.magenta}── Instalando dependencias ────────────────${c.reset}\n`);
  try {
    execSync("npm install --production --no-fund --no-audit", {
      cwd: bundleDir,
      stdio: "inherit",
    });
    console.log(`\n  ${c.green}✓${c.reset} Dependencias instaladas`);
  } catch {
    console.log(`\n  ${c.red}✗ Erro ao instalar dependencias${c.reset}\n`);
    process.exit(1);
  }

  // Generate .env
  console.log(`\n  ${c.magenta}── Configurando ───────────────────────────${c.reset}\n`);
  const { env: envContent, setupKey } = generateLocalEnv();
  writeFileSync(getLocalEnvPath(), envContent);
  console.log(`  ${c.green}✓${c.reset} .env gerado`);

  // Create data directory
  mkdirSync(join(dir, "data"), { recursive: true });

  // Setup database
  const dbPath = join(dir, "data", "pipely.db").replace(/\\/g, "/");
  process.stdout.write(`  Criando banco de dados... `);
  try {
    execSync("npx prisma db push", {
      cwd: join(bundleDir, "server"),
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    });
    console.log(`${c.green}✓${c.reset}`);
  } catch (err) {
    console.log(`${c.red}✗${c.reset}`);
    console.log(`  ${c.dim}${err.message}${c.reset}`);
  }

  console.log(`\n  ${c.green}✓${c.reset} Instalacao concluida\n`);

  printLocalSummary(setupKey, dir);
  return runLocal();
}

function printLocalSummary(setupKey, dir) {
  const line = "═".repeat(56);
  console.log(`  ${c.green}${line}${c.reset}`);
  console.log(`  ${c.green}${c.bold}  PIPELY AI — PRONTO! (Local Mode)${c.reset}`);
  console.log(`  ${c.green}${line}${c.reset}`);
  console.log("");
  console.log(`  ${c.bold}Endpoints:${c.reset}`);
  console.log(`    Frontend + API:  ${c.cyan}http://localhost:3333${c.reset}`);
  console.log(`    Setup:           ${c.cyan}http://localhost:3333/setup${c.reset}`);
  console.log(`    Agent Webhook:   ${c.cyan}http://localhost:3335/webhook${c.reset}`);
  console.log(`    Health:          ${c.cyan}http://localhost:3333/health${c.reset}`);
  console.log("");
  console.log(`  ${c.bold}Chaves:${c.reset}`);
  console.log(`    Setup Key:       ${c.yellow}${setupKey}${c.reset}`);
  console.log("");
  console.log(`  ${c.bold}Arquivos:${c.reset}`);
  console.log(`    Diretorio:       ${c.dim}${dir}${c.reset}`);
  console.log(`    Banco de dados:  ${c.dim}${join(dir, "data/pipely.db")}${c.reset}`);
  console.log(`    Configuracao:    ${c.dim}${join(dir, ".env")}${c.reset}`);
  console.log("");
  console.log(`  ${c.bold}Proximo passo:${c.reset}`);
  console.log(`    1. Acesse ${c.cyan}http://localhost:3333/setup${c.reset}`);
  console.log(`    2. Use a Setup Key acima para criar sua conta`);
  console.log(`    3. Configure WhatsApp e OpenAI nas paginas do app`);
  console.log("");
  console.log(`  ${c.bold}Comandos:${c.reset}`);
  console.log(`    npx pipely-ai start     ${c.dim}# Iniciar${c.reset}`);
  console.log(`    npx pipely-ai keys      ${c.dim}# Ver chaves${c.reset}`);
  console.log(`    npx pipely-ai update    ${c.dim}# Atualizar${c.reset}`);
  console.log(`    npx pipely-ai --local   ${c.dim}# Forcar modo local${c.reset}`);
  console.log("");
  console.log(`  ${c.green}${line}${c.reset}`);
  console.log("");
}

async function runLocal() {
  if (!isLocalInstalled()) {
    console.log(`  ${c.red}✗ Pipely AI nao instalado. Execute: npx pipely-ai${c.reset}\n`);
    process.exit(1);
  }

  const bundleDir = getBundleDir();

  const line = "═".repeat(56);
  console.log(`  ${c.magenta}${line}${c.reset}`);
  console.log(`  ${c.magenta}${c.bold}  PIPELY AI — Iniciando...${c.reset}`);
  console.log(`  ${c.magenta}${line}${c.reset}`);
  console.log("");

  const envPath = getLocalEnvPath();
  const envContent = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const envVars = {};
  for (const envLine of envContent.split("\n")) {
    const match = envLine.match(/^([A-Z_]+)=(.*)$/);
    if (match) envVars[match[1]] = match[2];
  }

  const childEnv = { ...process.env, ...envVars };

  // Start server (serves frontend via SERVE_FRONTEND env)
  const server = fork(join(bundleDir, "server/dist/index.js"), [], {
    cwd: join(bundleDir, "server"),
    env: { ...childEnv, PORT: "3333" },
    stdio: "inherit",
  });

  // Start agent
  const agent = fork(join(bundleDir, "agent/dist/index.js"), [], {
    cwd: join(bundleDir, "agent"),
    env: { ...childEnv, PORT: "3335" },
    stdio: "inherit",
  });

  // Wait for server to start then print endpoints
  await sleep(2000);
  console.log("");
  console.log(`  ${c.green}${line}${c.reset}`);
  console.log(`  ${c.green}${c.bold}  PIPELY AI — Rodando${c.reset}`);
  console.log(`  ${c.green}${line}${c.reset}`);
  console.log("");
  console.log(`  ${c.bold}Endpoints:${c.reset}`);
  console.log(`    Frontend + API:  ${c.cyan}http://localhost:3333${c.reset}`);
  console.log(`    Agent Webhook:   ${c.cyan}http://localhost:3335/webhook${c.reset}`);
  console.log("");
  console.log(`  ${c.bold}Setup Key:${c.reset}       ${c.yellow}${envVars.OWNER_SETUP_KEY || "ver .env"}${c.reset}`);
  console.log("");
  console.log(`  Pressione ${c.bold}Ctrl+C${c.reset} para parar.`);
  console.log(`  ${c.green}${line}${c.reset}`);
  console.log("");

  function shutdown() {
    console.log(`\n  Parando...\n`);
    server.kill();
    agent.kill();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  server.on("exit", (code) => { if (code) { agent.kill(); process.exit(1); } });
  agent.on("exit", (code) => { if (code) { server.kill(); process.exit(1); } });

  // Keep process alive
  await new Promise(() => {});
}

// ── Banner ──────────────────────────────────────────

function printBanner() {
  console.log("");
  console.log(`  ${c.magenta}${c.bold}╔═══════════════════════════════════════════╗${c.reset}`);
  console.log(`  ${c.magenta}${c.bold}║             PIPELY AI                     ║${c.reset}`);
  console.log(`  ${c.magenta}${c.bold}║     Automacao de tarefas + WhatsApp       ║${c.reset}`);
  console.log(`  ${c.magenta}${c.bold}╚═══════════════════════════════════════════╝${c.reset}`);
  console.log("");
}

// ── Summary (after install) ─────────────────────────

function printInstallSummary(ports, keys, setupKey, domain, sslOk) {
  const line = "═".repeat(56);
  const baseUrl = domain && sslOk ? `https://${domain}` : domain ? `http://${domain}` : `http://localhost:${ports.frontend}`;
  const ip = getServerIP();
  const evolutionUrl = domain ? `http://${ip || "SEU_IP"}:${ports.evolution}` : `http://localhost:${ports.evolution}`;

  console.log("");
  console.log(`  ${c.green}${line}${c.reset}`);
  console.log(`  ${c.green}${c.bold}  PIPELY AI — PRONTO!${c.reset}`);
  console.log(`  ${c.green}${line}${c.reset}`);
  console.log("");
  console.log(`  ${c.bold}Endpoints:${c.reset}`);
  console.log(`    Frontend:        ${c.cyan}${baseUrl}${c.reset}`);
  console.log(`    Backend API:     ${c.cyan}${baseUrl}/api${c.reset}`);
  if (!domain) {
    console.log(`    Backend direto:  ${c.cyan}http://localhost:${ports.backend}${c.reset}`);
    console.log(`    Agent Webhook:   ${c.cyan}http://localhost:${ports.agent}/webhook${c.reset}`);
  }
  console.log(`    Evolution Go:    ${c.cyan}${evolutionUrl}${c.reset}`);
  console.log(`    Evolution Mgr:   ${c.cyan}${evolutionUrl}/manager${c.reset}`);
  console.log("");
  console.log(`  ${c.bold}Chaves:${c.reset}`);
  console.log(`    Evolution Key:   ${c.yellow}${keys.evolutionApiKey}${c.reset}`);
  if (setupKey) {
    console.log(`    Setup Key:       ${c.yellow}${setupKey}${c.reset}`);
  }
  console.log("");
  console.log(`  ${c.bold}Proximo passo:${c.reset}`);
  console.log(`    1. Acesse ${c.cyan}${baseUrl}/setup${c.reset}`);
  if (setupKey) {
    console.log(`    2. Use a Setup Key acima para criar sua conta`);
    console.log(`    3. Configure WhatsApp e OpenAI nas paginas do app`);
  } else {
    console.log(`    2. Veja a Setup Key: ${c.dim}npx pipely-ai keys${c.reset}`);
    console.log(`    3. Configure WhatsApp e OpenAI nas paginas do app`);
  }
  console.log("");
  console.log(`  ${c.bold}Comandos:${c.reset}`);
  console.log(`    npx pipely-ai status    ${c.dim}# Ver status e URLs${c.reset}`);
  console.log(`    npx pipely-ai keys      ${c.dim}# Ver chaves${c.reset}`);
  console.log(`    npx pipely-ai logs      ${c.dim}# Ver logs${c.reset}`);
  console.log(`    npx pipely-ai stop      ${c.dim}# Parar${c.reset}`);
  console.log(`    npx pipely-ai start     ${c.dim}# Iniciar${c.reset}`);
  console.log(`    npx pipely-ai update    ${c.dim}# Atualizar${c.reset}`);
  console.log("");
  console.log(`  ${c.green}${line}${c.reset}`);
  console.log("");
}

// ══════════════════════════════════════════════════════
// ── COMMANDS ─────────────────────────────────────────
// ══════════════════════════════════════════════════════

// ── status ──────────────────────────────────────────

function cmdStatus() {
  const { dir, composeCmd } = requireProject();
  const env = readEnvFile(dir);
  const domain = env.APP_DOMAIN || null;
  const ip = getServerIP();
  const frontendPort = env.FRONTEND_PORT || "3000";
  const evolutionPort = env.EVOLUTION_PORT || "8080";
  const baseUrl = domain ? `https://${domain}` : `http://${ip || "localhost"}:${frontendPort}`;
  const evolutionUrl = `http://${ip || "localhost"}:${evolutionPort}`;

  console.log("");
  console.log(`  ${c.bold}PIPELY AI — Status${c.reset}\n`);

  // Container status
  try {
    const ps = execSync(`${composeCmd} ps --format "table {{.Name}}\t{{.State}}\t{{.Ports}}"`, {
      cwd: dir,
      encoding: "utf-8",
    });
    console.log(`  ${c.bold}Containers:${c.reset}`);
    for (const line of ps.trim().split("\n")) {
      const state = line.includes("running") ? c.green : line.includes("exited") ? c.red : c.dim;
      console.log(`    ${state}${line}${c.reset}`);
    }
  } catch {
    console.log(`  ${c.red}Nenhum container rodando${c.reset}`);
  }

  console.log("");
  console.log(`  ${c.bold}Endpoints:${c.reset}`);
  console.log(`    Frontend:        ${c.cyan}${baseUrl}${c.reset}`);
  console.log(`    Backend API:     ${c.cyan}${baseUrl}/api${c.reset}`);
  console.log(`    Evolution Go:    ${c.cyan}${evolutionUrl}${c.reset}`);
  console.log(`    Evolution Mgr:   ${c.cyan}${evolutionUrl}/manager${c.reset}`);

  if (domain) {
    console.log(`\n  ${c.bold}Dominio:${c.reset} ${c.cyan}${domain}${c.reset}`);
  }

  console.log(`\n  ${c.bold}Diretorio:${c.reset} ${c.dim}${dir}${c.reset}`);
  console.log("");
}

// ── keys ────────────────────────────────────────────

function cmdKeys() {
  const { dir, composeCmd } = requireProject();
  const env = readEnvFile(dir);

  console.log("");
  console.log(`  ${c.bold}PIPELY AI — Chaves${c.reset}\n`);

  if (env.EVOLUTION_API_KEY) {
    console.log(`  Evolution Key:   ${c.yellow}${env.EVOLUTION_API_KEY}${c.reset}`);
  }
  if (env.JWT_SECRET) {
    console.log(`  JWT Secret:      ${c.yellow}${env.JWT_SECRET.slice(0, 16)}...${c.reset}`);
  }

  // Setup key from logs
  const setupKey = getSetupKey(composeCmd, dir);
  if (setupKey) {
    console.log(`  Setup Key:       ${c.yellow}${setupKey}${c.reset}`);
  } else {
    console.log(`  Setup Key:       ${c.dim}(nao encontrada nos logs — conta ja pode ter sido criada)${c.reset}`);
  }

  console.log("");
}

// ── logs ────────────────────────────────────────────

function cmdLogs(service) {
  const { dir, composeCmd } = requireProject();
  const target = service || "app";
  try {
    execSync(`${composeCmd} logs -f --tail 100 ${target}`, {
      cwd: dir,
      stdio: "inherit",
    });
  } catch {
    // User pressed Ctrl+C
  }
}

// ── stop ────────────────────────────────────────────

function cmdStop() {
  const { dir, composeCmd } = requireProject();
  console.log(`\n  Parando containers...`);
  try {
    execSync(`${composeCmd} down`, { cwd: dir, stdio: "inherit" });
    console.log(`\n  ${c.green}✓${c.reset} Containers parados\n`);
  } catch {
    console.log(`\n  ${c.red}✗ Erro ao parar containers${c.reset}\n`);
  }
}

// ── start ───────────────────────────────────────────

function cmdStart() {
  const { dir, composeCmd } = requireProject();
  console.log(`\n  Iniciando containers...`);
  try {
    execSync(`${composeCmd} up -d`, { cwd: dir, stdio: "inherit" });
    console.log(`\n  ${c.green}✓${c.reset} Containers iniciados\n`);
  } catch {
    console.log(`\n  ${c.red}✗ Erro ao iniciar containers${c.reset}\n`);
  }
}

// ── restart ─────────────────────────────────────────

function cmdRestart() {
  const { dir, composeCmd } = requireProject();
  console.log(`\n  Reiniciando containers...`);
  try {
    execSync(`${composeCmd} restart`, { cwd: dir, stdio: "inherit" });
    console.log(`\n  ${c.green}✓${c.reset} Containers reiniciados\n`);
  } catch {
    console.log(`\n  ${c.red}✗ Erro ao reiniciar containers${c.reset}\n`);
  }
}

// ── update ──────────────────────────────────────────

function cmdUpdate() {
  const { dir, composeCmd } = requireProject();
  console.log(`\n  ${c.bold}Atualizando Pipely AI...${c.reset}\n`);

  process.stdout.write(`  Baixando imagem nova... `);
  try {
    execSync(`${composeCmd} pull app`, { cwd: dir, stdio: "pipe" });
    console.log(`${c.green}✓${c.reset}`);
  } catch {
    console.log(`${c.red}✗${c.reset}`);
    console.log(`  ${c.red}Erro ao baixar imagem${c.reset}\n`);
    return;
  }

  process.stdout.write(`  Recriando container... `);
  try {
    execSync(`${composeCmd} up -d --no-deps app`, { cwd: dir, stdio: "pipe" });
    console.log(`${c.green}✓${c.reset}`);
  } catch {
    console.log(`${c.red}✗${c.reset}`);
    console.log(`  ${c.red}Erro ao recriar container${c.reset}\n`);
    return;
  }

  console.log(`\n  ${c.green}✓${c.reset} Atualizado com sucesso!\n`);
}

// ── help ────────────────────────────────────────────

function cmdHelp() {
  printBanner();
  console.log(`  ${c.bold}Comandos:${c.reset}\n`);
  console.log(`    ${c.cyan}npx pipely-ai${c.reset}              Instalar Pipely AI`);
  console.log(`    ${c.cyan}npx pipely-ai status${c.reset}       Ver status, endpoints e dominio`);
  console.log(`    ${c.cyan}npx pipely-ai keys${c.reset}         Ver chaves (Evolution, Setup Key)`);
  console.log(`    ${c.cyan}npx pipely-ai logs${c.reset}         Ver logs do app (Ctrl+C para sair)`);
  console.log(`    ${c.cyan}npx pipely-ai logs db${c.reset}      Ver logs do banco de dados`);
  console.log(`    ${c.cyan}npx pipely-ai stop${c.reset}         Parar todos os containers`);
  console.log(`    ${c.cyan}npx pipely-ai start${c.reset}        Iniciar containers`);
  console.log(`    ${c.cyan}npx pipely-ai restart${c.reset}      Reiniciar containers`);
  console.log(`    ${c.cyan}npx pipely-ai update${c.reset}       Atualizar para ultima versao`);
  console.log(`    ${c.cyan}npx pipely-ai help${c.reset}         Mostrar esta ajuda`);
  console.log("");
}

// ══════════════════════════════════════════════════════
// ── INSTALL (main) ───────────────────────────────────
// ══════════════════════════════════════════════════════

async function install() {
  printBanner();

  const os = detectOS();
  console.log(`  Sistema: ${c.bold}${os.label}${c.reset} (${os.arch})\n`);

  if (forceLocal) {
    console.log(`  Modo: ${c.cyan}Local (--local)${c.reset}\n`);
    return installLocal();
  }

  process.stdout.write(`  Verificando Docker... `);
  const docker = checkDocker();

  if (!docker.ok) {
    console.log(`${c.yellow}✗ Nao encontrado${c.reset}`);
    console.log(`\n  Docker nao detectado. Iniciando em ${c.cyan}modo local${c.reset} (SQLite, sem containers).\n`);
    return installLocal();
  }
  console.log(`${c.green}✓${c.reset} v${docker.version}`);

  const composeCmd = getComposeCmd();
  if (!composeCmd) {
    console.log(`\n  ${c.yellow}✗ Docker Compose nao encontrado${c.reset}`);
    console.log(`  Iniciando em ${c.cyan}modo local${c.reset}.\n`);
    return installLocal();
  }

  try {
    execSync("docker info", { stdio: "pipe" });
  } catch {
    console.log(`\n  ${c.yellow}✗ Docker nao esta rodando${c.reset}`);
    console.log(`  Iniciando em ${c.cyan}modo local${c.reset}.\n`);
    return installLocal();
  }

  console.log("");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let done = false;
  rl.on("close", () => {
    if (!done) {
      console.log(`\n\n  ${c.yellow}Instalacao cancelada.${c.reset}\n`);
      process.exit(0);
    }
  });

  // ── Ports ──
  console.log(`  ${c.magenta}── Configuracao de Portas ──────────────────${c.reset}\n`);
  console.log(`  Pressione ${c.bold}Enter${c.reset} para usar o valor recomendado.\n`);

  const takenPorts = [];
  const frontendPort = await askPort(rl, "Aplicacao (Frontend + API)", 3000, takenPorts);
  takenPorts.push(frontendPort);
  const backendPort = await askPort(rl, "Backend API (acesso direto)", 3333, takenPorts);
  takenPorts.push(backendPort);
  const agentPort = await askPort(rl, "Agent Webhook", 3335, takenPorts);
  takenPorts.push(agentPort);
  const evolutionPort = await askPort(rl, "Evolution Go (WhatsApp)", 8080, takenPorts);
  takenPorts.push(evolutionPort);
  const dbPort = await askPort(rl, "PostgreSQL", 5433, takenPorts);
  takenPorts.push(dbPort);

  const ports = { frontend: frontendPort, backend: backendPort, agent: agentPort, evolution: evolutionPort, db: dbPort };

  // ── Keys ──
  console.log(`  ${c.magenta}── Seguranca ──────────────────────────────${c.reset}\n`);
  const keys = { dbPassword: generateKey(32), jwtSecret: generateKey(64), evolutionApiKey: generateKey(32) };
  console.log(`  ${c.green}✓${c.reset} DB_PASSWORD gerado`);
  console.log(`  ${c.green}✓${c.reset} JWT_SECRET gerado`);
  console.log(`  ${c.green}✓${c.reset} EVOLUTION_API_KEY gerado`);
  console.log("");

  // ── Domain (optional) ──
  let domain = null;
  let sslOk = false;
  const isLinux = os.platform === "linux";
  const hasRoot = isLinux && isRoot();

  console.log(`  ${c.magenta}── Dominio (opcional) ─────────────────────${c.reset}\n`);

  if (!isLinux) {
    console.log(`  ${c.dim}Dominio + SSL disponivel apenas em servidores Linux (VPS)${c.reset}\n`);
  } else if (!hasRoot) {
    console.log(`  ${c.dim}Dominio + SSL requer root. Execute com sudo para habilitar.${c.reset}\n`);
  } else {
    const wantsDomain = await askYesNo(rl, "Configurar dominio + SSL?");
    if (wantsDomain) {
      const ip = getServerIP();
      if (ip) {
        console.log("");
        console.log(`  IP do servidor: ${c.cyan}${ip}${c.reset}`);
        console.log(`  ${c.dim}Aponte o DNS A record do dominio para este IP${c.reset}\n`);
      }
      const rawDomain = await rl.question(`  Dominio (ex: pipely.seusite.com): `);
      domain = rawDomain.trim();
      if (!domain) {
        console.log(`  ${c.yellow}⚠ Dominio vazio — continuando sem SSL${c.reset}\n`);
        domain = null;
      } else if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}$/.test(domain)) {
        console.log(`  ${c.yellow}⚠ Formato invalido — continuando sem SSL${c.reset}\n`);
        domain = null;
      }
    } else {
      console.log("");
    }
  }

  done = true;
  rl.close();

  // ── Generate Files ──
  const targetDir = process.cwd();
  console.log(`  ${c.magenta}── Gerando configuracao ────────────────────${c.reset}\n`);

  writeFileSync(join(targetDir, "docker-compose.yml"), generateCompose(ports, domain));
  writeFileSync(join(targetDir, ".env"), generateEnv(ports, keys, domain));
  writeFileSync(join(targetDir, "init-db.sh"), INIT_DB_SH);

  if (os.platform !== "win32") {
    try { execSync(`chmod +x "${join(targetDir, "init-db.sh")}"`, { stdio: "pipe" }); } catch {}
  }

  console.log(`  ${c.green}✓${c.reset} docker-compose.yml`);
  console.log(`  ${c.green}✓${c.reset} .env`);
  console.log(`  ${c.green}✓${c.reset} init-db.sh`);

  // ── Pull & Start ──
  console.log(`\n  ${c.magenta}── Iniciando ──────────────────────────────${c.reset}\n`);
  console.log(`  Baixando imagens Docker ${c.dim}(pode demorar na primeira vez)${c.reset}...\n`);

  try {
    execSync(`${composeCmd} pull`, { cwd: targetDir, stdio: "inherit" });
  } catch {
    console.log(`\n  ${c.red}✗ Erro ao baixar imagens${c.reset}\n`);
    process.exit(1);
  }

  console.log(`\n  Iniciando containers...`);
  try {
    execSync(`${composeCmd} up -d`, { cwd: targetDir, stdio: "pipe" });
    console.log(`  ${c.green}✓${c.reset} Containers iniciados`);
  } catch (err) {
    const stderr = err.stderr?.toString() || "";
    const portMatch = stderr.match(/Bind for .+:(\d+) failed: port is already allocated/);
    if (portMatch) {
      console.log(`  ${c.red}✗ Porta ${portMatch[1]} esta ocupada${c.reset}`);
      console.log(`  ${c.dim}docker ps  # para ver containers rodando${c.reset}`);
    } else {
      console.log(`  ${c.red}✗ Erro ao iniciar containers${c.reset}`);
      if (stderr) console.log(`  ${c.dim}${stderr.trim()}${c.reset}`);
    }
    process.exit(1);
  }

  // ── Wait for Health ──
  console.log(`\n  Aguardando servicos ficarem prontos...`);
  process.stdout.write("  ");
  const healthy = await waitForHealth(ports.frontend, 120000);
  if (healthy) {
    console.log(`\n  ${c.green}✓${c.reset} Aplicacao pronta`);
  } else {
    console.log(`\n  ${c.yellow}⚠ Timeout — verifique: ${composeCmd} logs -f app${c.reset}`);
  }

  // ── Domain + SSL ──
  if (domain && hasRoot) {
    console.log("");
    console.log(`  ${c.magenta}── Configurando dominio + SSL ─────────────${c.reset}\n`);
    sslOk = setupDomainSSL(domain, ports.frontend);
  }

  // ── Setup Key ──
  let setupKey = null;
  if (healthy) {
    await sleep(3000);
    setupKey = getSetupKey(composeCmd, targetDir);
    if (!setupKey) {
      for (let i = 0; i < 5; i++) {
        await sleep(2000);
        setupKey = getSetupKey(composeCmd, targetDir);
        if (setupKey) break;
      }
    }
  }

  printInstallSummary(ports, keys, setupKey, domain, sslOk);
}

// ══════════════════════════════════════════════════════
// ── ROUTER ───────────────────────────────────────────
// ══════════════════════════════════════════════════════

// ── Local-mode commands ─────────────────────────────

function cmdLocalKeys() {
  if (!isLocalInstalled()) {
    console.log(`\n  ${c.red}✗ Pipely AI nao instalado nesta pasta${c.reset}\n`);
    process.exit(1);
  }
  const env = readEnvFile(getLocalDir());
  console.log("");
  console.log(`  ${c.bold}PIPELY AI — Chaves (Local)${c.reset}\n`);
  if (env.OWNER_SETUP_KEY) {
    console.log(`  Setup Key:   ${c.yellow}${env.OWNER_SETUP_KEY}${c.reset}`);
  }
  if (env.JWT_SECRET) {
    console.log(`  JWT Secret:  ${c.yellow}${env.JWT_SECRET.slice(0, 16)}...${c.reset}`);
  }
  console.log(`\n  Diretorio:   ${c.dim}${getLocalDir()}${c.reset}`);
  console.log("");
}

function cmdLocalStart() {
  if (!isLocalInstalled()) {
    console.log(`\n  ${c.red}✗ Pipely AI nao instalado. Execute: npx pipely-ai${c.reset}\n`);
    process.exit(1);
  }
  runLocal().catch((err) => {
    console.error(`\n  ${c.red}Erro: ${err.message}${c.reset}\n`);
    process.exit(1);
  });
}

function isLocalMode() {
  // Local mode if: local install exists AND no Docker project found
  return isLocalInstalled() && !findProjectDir();
}

// ══════════════════════════════════════════════════════
// ── ROUTER ───────────────────────────────────────────
// ══════════════════════════════════════════════════════

const args = process.argv.slice(2);
const forceLocal = args.includes("--local");
const command = args.filter((a) => a !== "--local")[0];
const local = forceLocal || isLocalMode();

switch (command) {
  case "status":
    if (local) { cmdLocalKeys(); } else { cmdStatus(); }
    break;
  case "keys":
    if (local) { cmdLocalKeys(); } else { cmdKeys(); }
    break;
  case "logs":
    if (local) { console.log(`\n  ${c.dim}Logs aparecem no terminal ao iniciar com: npx pipely-ai start${c.reset}\n`); }
    else { cmdLogs(args[1]); }
    break;
  case "stop":
    if (local) { console.log(`\n  ${c.dim}Pressione Ctrl+C no terminal onde esta rodando${c.reset}\n`); }
    else { cmdStop(); }
    break;
  case "start":
    if (local) { cmdLocalStart(); } else { cmdStart(); }
    break;
  case "restart":
    if (local) { console.log(`\n  ${c.dim}Pressione Ctrl+C e rode novamente: npx pipely-ai start${c.reset}\n`); }
    else { cmdRestart(); }
    break;
  case "update":
    if (local) {
      // Delete and re-download bundle
      try { rmSync(getBundleDir(), { recursive: true }); } catch {}
      console.log(`\n  ${c.dim}Reinstalando...${c.reset}\n`);
      installLocal().catch((err) => {
        console.error(`\n  ${c.red}Erro: ${err.message}${c.reset}\n`);
        process.exit(1);
      });
    } else {
      cmdUpdate();
    }
    break;
  case "help":
  case "--help":
  case "-h":
    cmdHelp();
    break;
  default:
    install().catch((err) => {
      console.error(`\n  ${c.red}Erro: ${err.message}${c.reset}\n`);
      process.exit(1);
    });
}
