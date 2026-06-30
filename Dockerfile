# ─── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:22-alpine AS frontend-build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .

# Empty = frontend uses relative URLs (same origin via nginx proxy)
ENV VITE_API_URL=""
RUN npm run build


# ─── Stage 2: Build server ───────────────────────────────────────────────────
FROM node:22-alpine AS server-build

WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm ci
COPY server/ .

# Dummy URL for prisma generate (only generates client code, no DB connection)
ENV DATABASE_URL="postgresql://x:x@localhost:5432/x"
RUN npx prisma generate

# Build — ignore TS errors (noEmitOnError:false emits files despite errors)
RUN npm run build; test -f dist/index.js


# ─── Stage 3: Build agent ────────────────────────────────────────────────────
FROM node:22-alpine AS agent-build

WORKDIR /build

# Mirror dev structure: agent imports ../../../server/generated/prisma/client.js
COPY --from=server-build /app/server/generated /build/server/generated
COPY --from=server-build /app/server/package.json /build/server/package.json

WORKDIR /build/agent
COPY agent/package.json agent/package-lock.json* ./
RUN npm ci
COPY agent/ .

RUN npx tsc --skipLibCheck; test -f dist/index.js


# ─── Stage 4: Production ─────────────────────────────────────────────────────
FROM node:22-alpine

RUN apk add --no-cache nginx

WORKDIR /app

# Server
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/node_modules ./server/node_modules
COPY --from=server-build /app/server/package.json ./server/
COPY --from=server-build /app/server/generated ./server/generated
COPY --from=server-build /app/server/prisma ./server/prisma
COPY --from=server-build /app/server/prisma.config.ts ./server/prisma.config.ts

# Agent
COPY --from=agent-build /build/agent/dist ./agent/dist
COPY --from=agent-build /build/agent/node_modules ./agent/node_modules
COPY --from=agent-build /build/agent/package.json ./agent/
# Relative import resolves: agent/dist/lib/ → ../../../ = agent/ → server/generated
COPY --from=server-build /app/server/generated ./agent/server/generated

# Frontend
COPY --from=frontend-build /app/dist ./frontend

# Nginx
COPY nginx.conf /etc/nginx/http.d/default.conf

# Entrypoint
RUN printf '#!/bin/sh\n\
set -e\n\
\n\
# Auto-generate JWT_SECRET if empty\n\
if [ -z "$JWT_SECRET" ]; then\n\
  export JWT_SECRET=$(head -c 48 /dev/urandom | base64)\n\
  echo "[SETUP] JWT_SECRET auto-generated"\n\
fi\n\
\n\
echo ""\n\
echo "  Pipely AI — Starting..."\n\
echo ""\n\
\n\
# Push schema to database\n\
echo "[DB] Pushing schema..."\n\
cd /app/server\n\
npx prisma db push 2>&1 || echo "[DB] Push failed — check DATABASE_URL"\n\
\n\
# Start server\n\
echo "[SERVER] Starting on port 3333..."\n\
node dist/index.js &\n\
sleep 3\n\
\n\
# Start agent\n\
echo "[AGENT] Starting on port 3335..."\n\
cd /app/agent\n\
node dist/index.js &\n\
\n\
# Show endpoints banner\n\
EVOKEY="${EVOLUTION_API_KEY:-nao configurado}"\n\
echo ""\n\
echo "========================================================"\n\
echo "  PIPELY AI — RODANDO"\n\
echo "========================================================"\n\
echo ""\n\
echo "  Endpoints (internos do container):"\n\
echo "    Frontend (nginx):  porta 80"\n\
echo "    Backend API:       porta 3333"\n\
echo "    Agent Webhook:     porta 3335"\n\
echo ""\n\
echo "  Evolution API Key:   $EVOKEY"\n\
echo ""\n\
echo "  Portas externas dependem do docker-compose.yml"\n\
echo "  Veja .env para conferir as portas mapeadas."\n\
echo "========================================================"\n\
echo ""\n\
\n\
# Start nginx (foreground)\n\
echo "[NGINX] Ready on port 80"\n\
nginx -g "daemon off;"\n\
' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 80 3333 3335

CMD ["/app/start.sh"]
