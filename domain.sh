#!/bin/sh
set -e

DOMAIN="$1"
PORT="${2:-3002}"

if [ -z "$DOMAIN" ]; then
  echo ""
  echo "  Usage: ./domain.sh your.domain.com [port]"
  echo "  Example: ./domain.sh pipely.mydomain.com 3002"
  echo ""
  exit 1
fi

echo ""
echo "  ══════════════════════════════════════════"
echo "  Pipely AI — Domain Setup"
echo "  ══════════════════════════════════════════"
echo ""
echo "  Domain: $DOMAIN"
echo "  App port: $PORT"
echo ""

# ─── Install certbot if needed ───────────────────────────────────────────────
if ! command -v certbot >/dev/null 2>&1; then
  echo "  Installing certbot..."
  apt-get update -qq
  apt-get install -y -qq certbot python3-certbot-nginx > /dev/null 2>&1
fi

# ─── Create Nginx config ────────────────────────────────────────────────────
echo "  Configuring Nginx..."

cat > /etc/nginx/sites-available/pipely <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

# ─── Enable site ─────────────────────────────────────────────────────────────
ln -sf /etc/nginx/sites-available/pipely /etc/nginx/sites-enabled/

nginx -t 2>&1 || { echo "  Nginx config error!"; exit 1; }
systemctl reload nginx

echo "  Nginx configured."

# ─── SSL ─────────────────────────────────────────────────────────────────────
echo "  Setting up SSL..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email 2>&1 || {
  echo ""
  echo "  SSL failed. Make sure DNS A record points to this server."
  echo "  You can retry later: certbot --nginx -d $DOMAIN"
  echo ""
  echo "  App is live at http://$DOMAIN (without SSL)"
  exit 0
}

# ─── Update .env ─────────────────────────────────────────────────────────────
ENV_FILE=""
if [ -f ".env" ]; then
  ENV_FILE=".env"
elif [ -f "pipely-ai/.env" ]; then
  ENV_FILE="pipely-ai/.env"
elif [ -f "$HOME/pipely-ai/pipely-ai/.env" ]; then
  ENV_FILE="$HOME/pipely-ai/pipely-ai/.env"
fi

if [ -n "$ENV_FILE" ]; then
  sed -i "s|APP_URL=.*|APP_URL=https://$DOMAIN|" "$ENV_FILE"
  echo "  Updated APP_URL in $ENV_FILE"

  # Restart app if compose file exists
  COMPOSE_DIR=$(dirname "$ENV_FILE")
  if [ -f "$COMPOSE_DIR/docker-compose.prod.yml" ]; then
    cd "$COMPOSE_DIR"
    docker compose -f docker-compose.prod.yml restart app 2>/dev/null || true
  elif [ -f "$COMPOSE_DIR/docker-compose.yml" ]; then
    cd "$COMPOSE_DIR"
    docker compose restart app 2>/dev/null || true
  fi
fi

echo ""
echo "  ══════════════════════════════════════════"
echo "  Domain configured!"
echo "  ══════════════════════════════════════════"
echo ""
echo "  https://$DOMAIN"
echo ""
