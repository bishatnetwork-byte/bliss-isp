#!/usr/bin/env bash
# =============================================================================
# HotspotPro — One-paste VPS Bootstrap
# =============================================================================
# Installs Node 20, Nginx, PM2, Certbot, clones the repo, builds the
# TanStack Start SSR server, registers it with PM2 and configures Nginx
# as a reverse proxy.  Designed to run on the same DigitalOcean droplet
# that already hosts bliss-isp — it does NOT touch any existing
# bliss-isp nginx sites.
#
# Usage (paste as root):
#   curl -fsSL https://raw.githubusercontent.com/<OWNER>/<REPO>/main/scripts/vps-bootstrap.sh \
#     | sudo DOMAIN=app.bliss-isp.com \
#            GITHUB_REPO=https://github.com/<OWNER>/<REPO>.git \
#            ADMIN_EMAIL=admin@bliss-isp.com \
#            bash
#
# Or from a checked-out repo:
#   sudo DOMAIN=app.bliss-isp.com bash scripts/vps-bootstrap.sh
# =============================================================================
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/var/www/hotspotpro}"
APP_NAME="${APP_NAME:-hotspotpro}"
APP_PORT="${APP_PORT:-3001}"            # bliss-isp serves on 80/443 static; we use 3001 upstream
DOMAIN="${DOMAIN:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@bliss-isp.com}"
GITHUB_REPO="${GITHUB_REPO:-}"
NODE_MAJOR="${NODE_MAJOR:-22}"   # Node 22+ required: supabase-js Realtime needs native WebSocket

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[hotspotpro]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
die()  { echo -e "${RED}[error]${NC} $*"; exit 1; }

[ "$EUID" -eq 0 ] || die "Run as root: sudo bash $0"

# ---------------------------------------------------------------- packages
log "Installing system packages…"
apt-get update -y
apt-get install -y curl git nginx certbot python3-certbot-nginx dnsutils ca-certificates gnupg build-essential

if ! command -v node >/dev/null || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt "$NODE_MAJOR" ]; then
  log "Installing Node.js ${NODE_MAJOR}.x…"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
command -v pm2 >/dev/null || npm install -g pm2

log "node $(node -v)   npm $(npm -v)   pm2 $(pm2 -v)"

# ---------------------------------------------------------------- source
mkdir -p "$DEPLOY_PATH"
if [ ! -d "$DEPLOY_PATH/.git" ]; then
  [ -n "$GITHUB_REPO" ] || die "Set GITHUB_REPO=https://github.com/owner/repo.git"
  log "Cloning $GITHUB_REPO → $DEPLOY_PATH"
  git clone --depth 1 "$GITHUB_REPO" "$DEPLOY_PATH"
else
  log "Refreshing $DEPLOY_PATH"
  git -C "$DEPLOY_PATH" pull --ff-only
fi

# ---------------------------------------------------------------- env
ENV_FILE="$DEPLOY_PATH/.env"
if [ ! -f "$ENV_FILE" ]; then
  log "Creating placeholder .env — EDIT this with your Supabase + provider secrets!"
  cat > "$ENV_FILE" <<EOF
# HotspotPro production env — fill in real values, then run scripts/vps-deploy.sh
NODE_ENV=production
PORT=${APP_PORT}
HOST=127.0.0.1

# Lovable Cloud backend credentials. Use the same URL/key for VITE_* and non-VITE_*.
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=

# Stable local encryption key for saved router/payment/SMS secrets.
# Generate with: openssl rand -hex 32
ROUTER_SECRET_KEY=

# Lovable AI
LOVABLE_API_KEY=

# Platform-wide payment / SMS gateways (set in Admin Panel UI as well)
MARZPAY_API_KEY=
MARZPAY_API_SECRET=
WIZASMS_API_KEY=
EOF
  chmod 600 "$ENV_FILE"
fi

# ---------------------------------------------------------------- build
log "Installing dependencies…"
cd "$DEPLOY_PATH"
npm install --legacy-peer-deps

log "Building TanStack Start for Node SSR (NITRO_PRESET=node-server)…"
export NITRO_PRESET=node-server
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build

SERVER_ENTRY="scripts/vps-node-adapter.mjs"
[ -f "$DEPLOY_PATH/dist/server/server.js" ] || die "Build did not produce dist/server/server.js"
[ -f "$DEPLOY_PATH/$SERVER_ENTRY" ] || die "Missing $SERVER_ENTRY in repo"
log "Server entry: $SERVER_ENTRY (wrapping dist/server/server.js)"

# ---------------------------------------------------------------- pm2
cat > "$DEPLOY_PATH/ecosystem.config.cjs" <<EOF
module.exports = {
  apps: [{
    name: "${APP_NAME}",
    script: "${SERVER_ENTRY}",
    cwd: "${DEPLOY_PATH}",
    exec_mode: "fork",
    instances: 1,
    env_file: "${DEPLOY_PATH}/.env",
    env: { NODE_ENV: "production", PORT: "${APP_PORT}", HOST: "127.0.0.1" },
    max_memory_restart: "800M",
    out_file: "/var/log/${APP_NAME}.out.log",
    error_file: "/var/log/${APP_NAME}.err.log",
    merge_logs: true,
    time: true,
  }]
};
EOF

log "Starting / reloading PM2 app…"
pm2 startOrReload "$DEPLOY_PATH/ecosystem.config.cjs" --update-env
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

# ---------------------------------------------------------------- nginx
NGINX_SITE="/etc/nginx/sites-available/${APP_NAME}.conf"
log "Writing nginx site → ${NGINX_SITE}"
SERVER_NAME="${DOMAIN:-_}"
cat > "$NGINX_SITE" <<EOF
# HotspotPro — reverse proxy to Node SSR (PM2 → 127.0.0.1:${APP_PORT})
upstream ${APP_NAME}_upstream { server 127.0.0.1:${APP_PORT}; keepalive 32; }

server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    client_max_body_size 25m;

    # WebSocket / SSE friendly
    location / {
        proxy_pass         http://${APP_NAME}_upstream;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Long cache for hashed static assets
    location ~* ^/(assets|_build)/ { proxy_pass http://${APP_NAME}_upstream; expires 1y; add_header Cache-Control "public, immutable"; }
}
EOF

ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${APP_NAME}.conf"
nginx -t && systemctl reload nginx
log "Nginx reloaded."

# ---------------------------------------------------------------- ssl
if [ -n "$DOMAIN" ]; then
  VPS_IP=$(curl -fsSL ifconfig.me || true)
  DNS_IP=$(dig +short "$DOMAIN" A | head -1)
  if [ -n "$DNS_IP" ] && { [ "$DNS_IP" = "$VPS_IP" ] || [ -n "$(dig +short "$DOMAIN" CNAME | head -1)" ]; }; then
    log "Issuing/renewing SSL cert for ${DOMAIN}…"
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --email "$ADMIN_EMAIL" || warn "certbot failed — re-run after DNS settles."
  else
    warn "DNS for ${DOMAIN} not pointing at this VPS yet ($VPS_IP). Skipping SSL — re-run later: certbot --nginx -d ${DOMAIN}"
  fi
fi

# ---------------------------------------------------------------- done
log "✅ HotspotPro is live."
log "  • Upstream:   http://127.0.0.1:${APP_PORT}"
log "  • Public:     http${DOMAIN:+s}://${DOMAIN:-$(curl -fsSL ifconfig.me)}"
log "  • Logs:       pm2 logs ${APP_NAME}"
log "  • Redeploy:   sudo bash ${DEPLOY_PATH}/scripts/vps-deploy.sh"
log ""
log "⚠️  Edit ${ENV_FILE} with real Supabase + MarzPay + WizaSMS keys, then:"
log "     pm2 restart ${APP_NAME} --update-env"
