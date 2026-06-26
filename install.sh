#!/bin/sh
set -e

REPO="https://raw.githubusercontent.com/Pedro-Furtado/pipely-ai/main"
DIR="pipely-ai"

echo ""
echo "  ══════════════════════════════════════════"
echo "  Pipely AI — Installer"
echo "  ══════════════════════════════════════════"
echo ""

# ─── Check Docker ────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "  Docker not found. Installing..."
  curl -fsSL https://get.docker.com | sh
  echo ""
fi

# ─── Create directory ────────────────────────────────────────────────────────
if [ -d "$DIR" ]; then
  echo "  Directory '$DIR' already exists."
  printf "  Reinstall? (y/N): "
  read -r CONFIRM < /dev/tty
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "  Cancelled."
    exit 0
  fi
  echo ""
fi

mkdir -p "$DIR"
cd "$DIR"

# ─── Download files ──────────────────────────────────────────────────────────
echo "  Downloading files..."
curl -fsSL "$REPO/docker-compose.prod.yml" -o docker-compose.yml
curl -fsSL "$REPO/setup.sh" -o setup.sh
curl -fsSL "$REPO/domain.sh" -o domain.sh
chmod +x setup.sh domain.sh

# ─── Run setup ───────────────────────────────────────────────────────────────
./setup.sh

APP_URL=$(grep APP_URL .env | cut -d= -f2)
APP_PORT=$(grep APP_PORT .env | cut -d= -f2)

# ─── Domain + SSL ────────────────────────────────────────────────────────────
echo ""
printf "  Configure domain with SSL? (y/N): "
read -r SETUP_DOMAIN < /dev/tty

if [ "$SETUP_DOMAIN" = "y" ] || [ "$SETUP_DOMAIN" = "Y" ]; then
  printf "  Enter your domain (e.g. pipely.yourdomain.com): "
  read -r DOMAIN < /dev/tty

  if [ -n "$DOMAIN" ]; then
    ./domain.sh "$DOMAIN" "$APP_PORT"
    APP_URL="https://$DOMAIN"
  fi
fi

# ─── Start ───────────────────────────────────────────────────────────────────
echo ""
echo "  Starting Pipely AI..."
docker compose up -d
echo ""

# ─── Wait for app ────────────────────────────────────────────────────────────
echo "  Waiting for services..."
sleep 10

# ─── Show setup key ─────────────────────────────────────────────────────────
SETUP_KEY=$(docker compose logs app 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -A2 "SETUP KEY" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')

echo ""
echo "  ══════════════════════════════════════════"
echo "  Pipely AI is running!"
echo "  ══════════════════════════════════════════"
echo ""
if echo "$APP_URL" | grep -q "://.*\."; then
  echo "  URL:        ${APP_URL}"
  echo "  Setup:      ${APP_URL}/setup"
else
  echo "  URL:        ${APP_URL}:${APP_PORT}"
  echo "  Setup:      ${APP_URL}:${APP_PORT}/setup"
fi
if [ -n "$SETUP_KEY" ]; then
  echo "  Setup Key:  $SETUP_KEY"
fi
echo ""
echo "  Commands:"
echo "    cd $DIR"
echo "    docker compose logs app        # View logs"
echo "    docker compose down            # Stop"
echo "    docker compose up -d           # Start"
echo "    cat .env                       # View config"
echo ""
