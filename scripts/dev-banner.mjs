#!/usr/bin/env node

/**
 * Mostra banner com endpoints e chaves ao iniciar npm run dev:all
 * Le configuracoes dos .env files do projeto
 */

import { readFileSync } from "node:fs";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
};

function parseEnv(filePath) {
  try {
    const content = readFileSync(filePath, "utf-8");
    const env = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

const root = parseEnv(".env");
const server = parseEnv("server/.env");
const agent = parseEnv("agent/.env");

// Extract values with defaults
const apiUrl = root.VITE_API_URL || "http://localhost:3333";
const frontendPort = (root.VITE_API_URL || "").includes(":")
  ? "5173"
  : "5173";
const backendPort = apiUrl.match(/:(\d+)/)?.[1] || "3333";
const agentPort = agent.PORT || "3335";
const evolutionUrl = server.EVOLUTION_SERVER_URL || "http://localhost:8080";
const evolutionPort = evolutionUrl.match(/:(\d+)/)?.[1] || "8080";
const evolutionKey = server.EVOLUTION_API_KEY || "nao configurado";
const dbUrl = server.DATABASE_URL || "";
const dbPort = dbUrl.match(/:(\d+)\//)?.[1] || "5433";

const line = "─".repeat(52);

console.log("");
console.log(
  `  ${c.magenta}${c.bold}╔═══════════════════════════════════════════╗${c.reset}`
);
console.log(
  `  ${c.magenta}${c.bold}║          PIPELY AI — DEV MODE             ║${c.reset}`
);
console.log(
  `  ${c.magenta}${c.bold}╚═══════════════════════════════════════════╝${c.reset}`
);
console.log("");
console.log(`  ${c.bold}Endpoints:${c.reset}`);
console.log(
  `    Frontend:        ${c.cyan}http://localhost:${frontendPort}${c.reset}`
);
console.log(
  `    Backend API:     ${c.cyan}http://localhost:${backendPort}${c.reset}`
);
console.log(
  `    Agent Webhook:   ${c.cyan}http://localhost:${agentPort}${c.reset}`
);
console.log(
  `    Evolution Go:    ${c.cyan}${evolutionUrl}${c.reset}`
);
console.log(
  `    Evolution Mgr:   ${c.cyan}${evolutionUrl}/manager${c.reset}`
);
console.log(
  `    PostgreSQL:      ${c.cyan}localhost:${dbPort}${c.reset}`
);
console.log("");
console.log(`  ${c.bold}Chaves:${c.reset}`);
console.log(
  `    Evolution Key:   ${c.yellow}${evolutionKey}${c.reset}`
);
console.log("");
console.log(`  ${c.dim}${line}${c.reset}`);
console.log(
  `  ${c.dim}Setup Key aparece nos logs do servidor ao iniciar${c.reset}`
);
console.log(`  ${c.dim}${line}${c.reset}`);
console.log("");
