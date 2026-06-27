#!/bin/sh
set -e

ENV_FILE=".env"

echo ""
echo "  ══════════════════════════════════════════"
echo "  Pipely AI — Setup"
echo "  ══════════════════════════════════════════"
echo ""

# ─── Check if .env already exists ────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  echo "  .env already exists."
  echo ""
  printf "  Overwrite? (y/N): "
  read -r CONFIRM < /dev/tty
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo ""
    echo "  Cancelled. To view current config: cat .env"
    echo ""
    exit 0
  fi
  echo ""
fi

# ─── Generate secrets ────────────────────────────────────────────────────────
DB_PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
JWT_SECRET=$(head -c 48 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 64)
EVOLUTION_API_KEY=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)

# ─── Detect public IP ────────────────────────────────────────────────────────
echo "  Detecting public IP..."
PUBLIC_IP=$(curl -s4 --max-time 5 ifconfig.me 2>/dev/null || echo "")

if [ -z "$PUBLIC_IP" ]; then
  echo "  Could not detect IP automatically."
  printf "  Enter your VPS IP or domain: "
  read -r PUBLIC_IP < /dev/tty
  if [ -z "$PUBLIC_IP" ]; then
    PUBLIC_IP="localhost"
  fi
else
  echo "  Detected: $PUBLIC_IP"
  printf "  Use this IP? (Y/n): "
  read -r USE_IP < /dev/tty
  if [ "$USE_IP" = "n" ] || [ "$USE_IP" = "N" ]; then
    printf "  Enter your VPS IP or domain: "
    read -r PUBLIC_IP < /dev/tty
  fi
fi

# ─── Ask port ────────────────────────────────────────────────────────────────
printf "  Port (default 80): "
read -r APP_PORT < /dev/tty
if [ -z "$APP_PORT" ]; then
  APP_PORT="80"
fi

# ─── Write .env ──────────────────────────────────────────────────────────────
cat > "$ENV_FILE" <<EOF
# Pipely AI — Generated $(date -u +"%Y-%m-%d %H:%M:%S UTC")

DB_USER=pipely
DB_PASSWORD=$DB_PASSWORD
DB_NAME=pipely_ai

JWT_SECRET=$JWT_SECRET

APP_URL=http://$PUBLIC_IP
APP_PORT=$APP_PORT
POLL_INTERVAL_MS=60000

EVOLUTION_API_KEY=$EVOLUTION_API_KEY
EOF

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "  ══════════════════════════════════════════"
echo "  Setup complete!"
echo "  ══════════════════════════════════════════"
echo ""
echo "  DB_USER:      pipely"
echo "  DB_PASSWORD:  $DB_PASSWORD"
echo "  DB_NAME:      pipely_ai"
echo "  JWT_SECRET:   $JWT_SECRET"
echo "  APP_URL:      http://$PUBLIC_IP"
echo "  APP_PORT:     $APP_PORT"
echo ""
echo "  Config saved to .env"
echo "  To view later:  cat .env"
echo "  To regenerate:  ./setup.sh"
echo ""
echo "  Next step:  docker compose up -d"
echo ""
