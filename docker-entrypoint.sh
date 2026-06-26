#!/bin/sh
set -e

echo "═══════════════════════════════════════════════"
echo "  Pipely AI — Starting..."
echo "═══════════════════════════════════════════════"

# Run Prisma migrations
echo "[DB] Pushing schema..."
cd /app/server
npx prisma db push 2>&1 || echo "[DB] Schema push failed — check DATABASE_URL"

# Start server
echo "[SERVER] Starting on port 3333..."
cd /app/server
node dist/index.js &

# Wait for server to be ready
sleep 2

# Start agent
echo "[AGENT] Starting on port 3335..."
cd /app/agent
node dist/index.js &

# Start nginx
echo "[NGINX] Starting on port 80..."
nginx -g "daemon off;"
