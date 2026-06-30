#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { createServer as createNetServer } from "node:net";
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { platform, release, arch, hostname } from "node:os";
import http from "node:http";

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

  return {
    platform: p,
    label: labels[p] || `${p} (${r})`,
    arch: a,
  };
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
      server.close(() => resolve(true));
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

// ── Port prompt with availability check ─────────────

async function askPort(rl, label, defaultPort, takenPorts) {
  while (true) {
    const raw = await rl.question(
      `  ${label} ${c.dim}[${defaultPort}]${c.reset}: `
    );
    const port = parseInt(raw.trim() || String(defaultPort), 10);

    if (isNaN(port) || port < 1 || port > 65535) {
      console.log(`  ${c.red}✗ Porta invalida (1-65535)${c.reset}\n`);
      continue;
    }

    if (takenPorts.includes(port)) {
      console.log(
        `  ${c.red}✗ Porta ${port} ja escolhida para outro servico${c.reset}\n`
      );
      continue;
    }

    process.stdout.write(`  ${c.dim}→ Testando porta ${port}...${c.reset} `);
    const free = await isPortFree(port);

    if (free) {
      console.log(`${c.green}✓ Livre${c.reset}\n`);
      return port;
    }

    console.log(`${c.red}✗ Em uso!${c.reset}\n`);
  }
}

// ── Docker Compose template ─────────────────────────

function generateCompose(ports) {
  return `# Pipely AI — gerado por create-pipely
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
      - FRONTEND_URL=http://localhost:\${FRONTEND_PORT:-${ports.frontend}}
      - BACKEND_URL=http://127.0.0.1:3333
      - POLL_INTERVAL_MS=\${POLL_INTERVAL_MS:-60000}
      - EVOLUTION_SERVER_URL=http://evolution:8080
      - EVOLUTION_API_KEY=\${EVOLUTION_API_KEY}
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

function generateEnv(ports, keys) {
  const now = new Date().toISOString().split("T")[0];
  return `# Pipely AI — gerado por create-pipely em ${now}
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
}

// ── init-db.sh content ──────────────────────────────

const INIT_DB_SH = `#!/bin/bash
set -e

# Cria banco separado para Evolution Go
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE evolution_go' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution_go')\\gexec
EOSQL
`;

// ── Wait for app health ─────────────────────────────

async function waitForHealth(port, maxWaitMs = 120000) {
  const start = Date.now();
  let dots = 0;
  while (Date.now() - start < maxWaitMs) {
    const ok = await httpGet(`http://localhost:${port}/health`);
    if (ok) return true;
    await sleep(2000);
    dots++;
    if (dots % 3 === 0) process.stdout.write(".");
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

// ── Docker install instructions ─────────────────────

function printDockerHelp(os) {
  console.log(`\n  ${c.red}✗ Docker nao encontrado${c.reset}\n`);
  console.log(`  Instale o Docker antes de continuar:\n`);

  if (os.platform === "win32") {
    console.log(`  Windows:`);
    console.log(`    https://docs.docker.com/desktop/install/windows-install/`);
    console.log(`    Ou via winget: winget install Docker.DockerDesktop\n`);
  } else if (os.platform === "darwin") {
    console.log(`  macOS:`);
    console.log(`    https://docs.docker.com/desktop/install/mac-install/`);
    console.log(`    Ou via brew: brew install --cask docker\n`);
  } else {
    console.log(`  Linux:`);
    console.log(`    curl -fsSL https://get.docker.com | sh`);
    console.log(`    sudo usermod -aG docker $USER`);
    console.log(`    (relogar apos adicionar ao grupo)\n`);
  }
}

// ── Banner ───────────────────────────────────────────

function printBanner() {
  console.log("");
  console.log(
    `  ${c.magenta}${c.bold}╔═══════════════════════════════════════════╗${c.reset}`
  );
  console.log(
    `  ${c.magenta}${c.bold}║           PIPELY AI  INSTALLER            ║${c.reset}`
  );
  console.log(
    `  ${c.magenta}${c.bold}║     Automacao de tarefas + WhatsApp       ║${c.reset}`
  );
  console.log(
    `  ${c.magenta}${c.bold}╚═══════════════════════════════════════════╝${c.reset}`
  );
  console.log("");
}

// ── Summary ──────────────────────────────────────────

function printSummary(ports, keys, setupKey) {
  const line = "═".repeat(56);

  console.log("");
  console.log(`  ${c.green}${line}${c.reset}`);
  console.log(
    `  ${c.green}${c.bold}  PIPELY AI — PRONTO!${c.reset}`
  );
  console.log(`  ${c.green}${line}${c.reset}`);
  console.log("");
  console.log(`  ${c.bold}Endpoints:${c.reset}`);
  console.log(
    `    Frontend:        ${c.cyan}http://localhost:${ports.frontend}${c.reset}`
  );
  console.log(
    `    Backend API:     ${c.cyan}http://localhost:${ports.frontend}/api${c.reset}`
  );
  console.log(
    `    Backend direto:  ${c.cyan}http://localhost:${ports.backend}${c.reset}`
  );
  console.log(
    `    Agent Webhook:   ${c.cyan}http://localhost:${ports.agent}/webhook${c.reset}`
  );
  console.log(
    `    Evolution Go:    ${c.cyan}http://localhost:${ports.evolution}${c.reset}`
  );
  console.log(
    `    Evolution Mgr:   ${c.cyan}http://localhost:${ports.evolution}/manager${c.reset}`
  );
  console.log("");
  console.log(`  ${c.bold}Chaves:${c.reset}`);
  console.log(
    `    Evolution Key:   ${c.yellow}${keys.evolutionApiKey}${c.reset}`
  );
  if (setupKey) {
    console.log(
      `    Setup Key:       ${c.yellow}${setupKey}${c.reset}`
    );
  }
  console.log("");
  console.log(`  ${c.bold}Proximo passo:${c.reset}`);
  console.log(
    `    1. Acesse ${c.cyan}http://localhost:${ports.frontend}/setup${c.reset}`
  );
  if (setupKey) {
    console.log(`    2. Use a Setup Key acima para criar sua conta`);
    console.log(`    3. Configure WhatsApp e OpenAI nas paginas do app`);
  } else {
    console.log(`    2. Veja a Setup Key nos logs: ${c.dim}docker compose logs app | grep "SETUP KEY" -A3${c.reset}`);
    console.log(`    3. Configure WhatsApp e OpenAI nas paginas do app`);
  }
  console.log("");
  console.log(`  ${c.bold}Comandos uteis:${c.reset}`);
  console.log(
    `    docker compose logs -f app    ${c.dim}# Ver logs${c.reset}`
  );
  console.log(
    `    docker compose down            ${c.dim}# Parar${c.reset}`
  );
  console.log(
    `    docker compose up -d           ${c.dim}# Iniciar${c.reset}`
  );
  console.log("");
  console.log(`  ${c.green}${line}${c.reset}`);
  console.log("");
}

// ── Main ─────────────────────────────────────────────

async function main() {
  printBanner();

  // ── Detect OS ──
  const os = detectOS();
  console.log(
    `  Sistema: ${c.bold}${os.label}${c.reset} (${os.arch})\n`
  );

  // ── Check Docker ──
  process.stdout.write(`  Verificando Docker... `);
  const docker = checkDocker();
  if (!docker.ok) {
    printDockerHelp(os);
    process.exit(1);
  }
  console.log(`${c.green}✓${c.reset} v${docker.version}`);

  // ── Check Docker Compose ──
  const composeCmd = getComposeCmd();
  if (!composeCmd) {
    console.log(
      `\n  ${c.red}✗ Docker Compose nao encontrado${c.reset}`
    );
    console.log(
      `  Atualize o Docker ou instale docker-compose separadamente.\n`
    );
    process.exit(1);
  }

  // ── Check Docker is running ──
  try {
    execSync("docker info", { stdio: "pipe" });
  } catch {
    console.log(`\n  ${c.red}✗ Docker nao esta rodando${c.reset}`);
    if (os.platform === "win32" || os.platform === "darwin") {
      console.log(`  Abra o Docker Desktop e tente novamente.\n`);
    } else {
      console.log(`  Execute: sudo systemctl start docker\n`);
    }
    process.exit(1);
  }

  console.log("");

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // Handle Ctrl+C
  rl.on("close", () => {
    console.log(`\n\n  ${c.yellow}Instalacao cancelada.${c.reset}\n`);
    process.exit(0);
  });

  // ── Port Configuration ──
  console.log(
    `  ${c.magenta}── Configuracao de Portas ──────────────────${c.reset}\n`
  );
  console.log(
    `  Pressione ${c.bold}Enter${c.reset} para usar o valor recomendado.\n`
  );

  const takenPorts = [];

  const frontendPort = await askPort(
    rl,
    "Aplicacao (Frontend + API)",
    3000,
    takenPorts
  );
  takenPorts.push(frontendPort);

  const backendPort = await askPort(
    rl,
    "Backend API (acesso direto)",
    3333,
    takenPorts
  );
  takenPorts.push(backendPort);

  const agentPort = await askPort(rl, "Agent Webhook", 3335, takenPorts);
  takenPorts.push(agentPort);

  const evolutionPort = await askPort(
    rl,
    "Evolution Go (WhatsApp)",
    8080,
    takenPorts
  );
  takenPorts.push(evolutionPort);

  const dbPort = await askPort(rl, "PostgreSQL", 5433, takenPorts);
  takenPorts.push(dbPort);

  const ports = {
    frontend: frontendPort,
    backend: backendPort,
    agent: agentPort,
    evolution: evolutionPort,
    db: dbPort,
  };

  // ── Generate Keys ──
  console.log(
    `  ${c.magenta}── Seguranca ──────────────────────────────${c.reset}\n`
  );

  const keys = {
    dbPassword: generateKey(32),
    jwtSecret: generateKey(64),
    evolutionApiKey: generateKey(32),
  };

  console.log(`  ${c.green}✓${c.reset} DB_PASSWORD gerado`);
  console.log(`  ${c.green}✓${c.reset} JWT_SECRET gerado`);
  console.log(`  ${c.green}✓${c.reset} EVOLUTION_API_KEY gerado`);
  console.log("");

  rl.close();

  // Grava arquivos no diretorio atual
  const targetDir = process.cwd();

  // ── Generate Files ──
  console.log(
    `\n  ${c.magenta}── Gerando configuracao ────────────────────${c.reset}\n`
  );

  const composeContent = generateCompose(ports);
  const envContent = generateEnv(ports, keys);

  writeFileSync(join(targetDir, "docker-compose.yml"), composeContent);
  writeFileSync(join(targetDir, ".env"), envContent);
  writeFileSync(join(targetDir, "init-db.sh"), INIT_DB_SH);

  // Make init-db.sh executable on Unix
  if (os.platform !== "win32") {
    try {
      execSync(`chmod +x "${join(targetDir, "init-db.sh")}"`, {
        stdio: "pipe",
      });
    } catch {
      // non-critical
    }
  }

  console.log(`  ${c.green}✓${c.reset} docker-compose.yml`);
  console.log(`  ${c.green}✓${c.reset} .env`);
  console.log(`  ${c.green}✓${c.reset} init-db.sh`);

  // ── Pull Images ──
  console.log(
    `\n  ${c.magenta}── Iniciando ──────────────────────────────${c.reset}\n`
  );
  console.log(
    `  Baixando imagens Docker ${c.dim}(pode demorar na primeira vez)${c.reset}...\n`
  );

  try {
    execSync(`${composeCmd} pull`, {
      cwd: targetDir,
      stdio: "inherit",
    });
  } catch (err) {
    console.log(
      `\n  ${c.red}✗ Erro ao baixar imagens${c.reset}`
    );
    console.log(
      `  Verifique sua conexao e tente: cd ${dirInput} && ${composeCmd} pull\n`
    );
    process.exit(1);
  }

  // ── Start Containers ──
  console.log(`\n  Iniciando containers...`);

  try {
    execSync(`${composeCmd} up -d`, {
      cwd: targetDir,
      stdio: "pipe",
    });
    console.log(`  ${c.green}✓${c.reset} Containers iniciados`);
  } catch (err) {
    console.log(`  ${c.red}✗ Erro ao iniciar containers${c.reset}`);
    const stderr = err.stderr?.toString() || "";
    if (stderr) console.log(`  ${c.dim}${stderr.trim()}${c.reset}`);
    console.log(
      `\n  Tente manualmente: cd ${dirInput} && ${composeCmd} up -d\n`
    );
    process.exit(1);
  }

  // ── Wait for Health ──
  console.log(`\n  Aguardando servicos ficarem prontos...`);
  process.stdout.write("  ");

  const healthy = await waitForHealth(ports.frontend, 120000);

  if (healthy) {
    console.log(`\n  ${c.green}✓${c.reset} Aplicacao pronta`);
  } else {
    console.log(
      `\n  ${c.yellow}⚠ Timeout aguardando aplicacao${c.reset}`
    );
    console.log(
      `  ${c.dim}Os containers estao rodando. Verifique os logs: ${composeCmd} logs -f app${c.reset}`
    );
  }

  // ── Get Setup Key ──
  let setupKey = null;
  if (healthy) {
    // Wait a bit more for key generation
    await sleep(3000);
    setupKey = getSetupKey(composeCmd, targetDir);

    if (!setupKey) {
      // Try a few more times
      for (let i = 0; i < 5; i++) {
        await sleep(2000);
        setupKey = getSetupKey(composeCmd, targetDir);
        if (setupKey) break;
      }
    }
  }

  // ── Summary ──
  printSummary(ports, keys, setupKey);
}

// ── Run ──────────────────────────────────────────────

main().catch((err) => {
  console.error(`\n  ${c.red}Erro inesperado: ${err.message}${c.reset}\n`);
  process.exit(1);
});
