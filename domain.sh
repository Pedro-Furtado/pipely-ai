#!/bin/sh
set -e

DOMAIN="$1"

if [ -z "$DOMAIN" ]; then
  echo ""
  echo "  Usage: ./domain.sh your.domain.com"
  echo "  Example: ./domain.sh pipely.mydomain.com"
  echo ""
  echo "  Before running:"
  echo "    1. Create a DNS A record pointing $DOMAIN to this server's IP"
  echo "    2. Wait for DNS propagation (usually 1-5 minutes)"
  echo ""
  exit 1
fi

# ─── Detect app port from .env ──────────────────────────────────────────────
PORT=3000
if [ -f ".env" ]; then
  ENV_PORT=$(grep -E '^PORT_APP=' .env | cut -d= -f2 | tr -d '[:space:]')
  [ -n "$ENV_PORT" ] && PORT="$ENV_PORT"
fi

echo ""
echo "  ══════════════════════════════════════════"
echo "  Pipely AI — Domain Setup"
echo "  ══════════════════════════════════════════"
echo ""
echo "  Domain:   $DOMAIN"
echo "  App port: $PORT"
echo ""

# ─── Install Nginx if needed ────────────────────────────────────────────────
if ! command -v nginx >/dev/null 2>&1; then
  echo "  Installing Nginx..."
  apt-get update -qq
  apt-get install -y -qq nginx > /dev/null 2>&1
  systemctl enable nginx
  systemctl start nginx
  echo "  ✓ Nginx installed"
fi

# ─── Install certbot if needed ──────────────────────────────────────────────
if ! command -v certbot >/dev/null 2>&1; then
  echo "  Installing Certbot..."
  apt-get update -qq
  apt-get install -y -qq certbot python3-certbot-nginx > /dev/null 2>&1
  echo "  ✓ Certbot installed"
fi

# ─── Remove default site if exists ──────────────────────────────────────────
rm -f /etc/nginx/sites-enabled/default

# ─── Create Nginx config ────────────────────────────────────────────────────
echo "  Configuring Nginx..."

cat > /etc/nginx/sites-available/pipely <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    large_client_header_buffers 4 32k;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
EOF

# ─── Enable site ────────────────────────────────────────────────────────────
ln -sf /etc/nginx/sites-available/pipely /etc/nginx/sites-enabled/

nginx -t 2>&1 || { echo "  ✗ Nginx config error!"; exit 1; }
systemctl reload nginx

echo "  ✓ Nginx configured"

# ─── SSL ─────────────────────────────────────────────────────────────────────
echo "  Setting up SSL..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email 2>&1 || {
  echo ""
  echo "  ✗ SSL failed. Make sure DNS A record points to this server."
  echo "  You can retry later: certbot --nginx -d $DOMAIN"
  echo ""
  echo "  App is live at: http://$DOMAIN (without SSL)"
  exit 0
}

echo "  ✓ SSL configured"

# ─── Restart app container ───────────────────────────────────────────────────
if [ -f "docker-compose.yml" ]; then
  docker compose restart app 2>/dev/null || true
  echo "  ✓ App restarted"
fi

echo ""
echo "  ══════════════════════════════════════════"
echo "  ✓ Domain configured!"
echo "  ══════════════════════════════════════════"
echo ""
echo "  https://$DOMAIN"
echo "  https://$DOMAIN/setup  (first access)"
echo ""
echo "  Useful commands:"
echo "    certbot renew --dry-run     # Test SSL renewal"
echo "    nginx -t && systemctl reload nginx  # Reload config"
echo ""
