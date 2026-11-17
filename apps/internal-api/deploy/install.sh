#!/usr/bin/env bash
# Install or update the Jokoding Internal API on an Ubuntu/Debian VPS.
#
# Run it on the VPS, from the repository folder (jokoding-web):
#
#   sudo bash apps/internal-api/deploy/install.sh api.internal.jokoding.id
#
# Re-run the same command after `git pull` to deploy an update. The database,
# its password and /etc/jokoding-internal/env are kept.
#
# Shares the VPS with Hermes and the old invoice app (nginx 127.0.0.1:8080, API 3100):
# this script never touches ports 3100/8080. The API listens on 127.0.0.1:3300 only.
set -euo pipefail

DOMAIN="${1:-}"
PORT=3300
APP_NAME="jokoding-internal"
SVC_USER="jokoding-internal"
APP_DIR="/opt/$APP_NAME"
ENV_DIR="/etc/$APP_NAME"
ENV_FILE="$ENV_DIR/env"
SERVICE_FILE="/etc/systemd/system/$APP_NAME.service"
CLI_BIN="/usr/local/bin/$APP_NAME"
NGINX_SITE="/etc/nginx/sites-available/$APP_NAME"
NGINX_LINK="/etc/nginx/sites-enabled/$APP_NAME"
DB_NAME="internal"
DB_USER="internal"
CORS_ORIGIN="https://internal.jokoding.id"
COOKIE_DOMAIN=".internal.jokoding.id"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$DEPLOY_DIR/../../.." && pwd)"
INSTALL_CMD="sudo bash apps/internal-api/deploy/install.sh${DOMAIN:+ $DOMAIN}"

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nError: %s\n' "$*" >&2; exit 1; }
ask_yes() { local answer; read -rp "$1 [y/N] " answer; [[ $answer =~ ^[Yy]$ ]]; }
# Name of the program listening on a TCP port, or nothing when the port is free.
port_owner() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'users:(("[^"]*' | head -1 | cut -d'"' -f2 || true; }

# ---------- checks ----------

[[ $EUID -eq 0 ]] || die "run with sudo: $INSTALL_CMD"
[[ -n $DOMAIN ]] || die "domain required: sudo bash apps/internal-api/deploy/install.sh api.internal.jokoding.id"
[[ $DOMAIN =~ ^[A-Za-z0-9.-]+$ ]] || die "invalid domain: $DOMAIN"
command -v apt-get >/dev/null || die "this script supports Ubuntu/Debian (apt) only"
[[ -f $REPO_DIR/apps/internal-api/src/main.js && -f $REPO_DIR/packages/invoice-core/package.json && -f $REPO_DIR/pnpm-lock.yaml ]] \
  || die "run from the jokoding-web repository (apps/internal-api/src/main.js not found in $REPO_DIR)"

owner="$(port_owner "$PORT")"
if [[ -n $owner ]] && ! systemctl is-active --quiet "$APP_NAME"; then
  die "port $PORT is already used by '$owner'. Stop it, then re-run."
fi

# Two nginx sites with the same domain: nginx would ignore one of them.
for file in /etc/nginx/sites-enabled/*; do
  [[ -e $file && $(readlink -f "$file") != "$NGINX_SITE" ]] || continue
  if grep -qE "server_name[^;]*[[:space:]]${DOMAIN//./\\.}([[:space:];]|$)" "$file"; then
    die "$file already serves $DOMAIN. Remove that site, then re-run."
  fi
done

# ---------- swap (2 GB RAM shared with Hermes) ----------

if [[ -z $(swapon --show --noheadings 2>/dev/null) ]]; then
  say "No swap found: creating 1 GB /swapfile"
  [[ -e /swapfile ]] || { fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024 status=none; }
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -qE '^/swapfile[[:space:]]' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ---------- packages ----------

say "Installing packages (postgresql, nginx, certbot, ufw)"
apt-get update -qq
PG_PKG=postgresql
if ! ls /etc/postgresql/*/main >/dev/null 2>&1 && apt-cache show postgresql-16 >/dev/null 2>&1; then
  PG_PKG=postgresql-16
fi
apt-get install -y -qq "$PG_PKG" nginx certbot python3-certbot-nginx ufw rsync openssl curl >/dev/null

node_major() { if command -v node >/dev/null; then node -p 'process.versions.node.split(".")[0]'; else echo 0; fi; }
if (( $(node_major) < 20 )); then
  echo "Node.js 20 or newer is required (found: $(command -v node >/dev/null && node --version || echo none))."
  ask_yes "Install Node.js 22 LTS from deb.nodesource.com?" || die "install Node.js 20+ yourself, then re-run"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs >/dev/null
fi
NODE_BIN="$(command -v node)"
# The service cannot see /root or /home (ProtectHome), so a Node from nvm there would fail.
[[ $NODE_BIN == /root/* || $NODE_BIN == /home/* ]] && die "node at $NODE_BIN is in a home folder. Install Node.js system-wide (apt), then re-run."
echo "Node.js $("$NODE_BIN" --version) at $NODE_BIN"

# ---------- postgres ----------

PG_VER="$(find /etc/postgresql -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -V | tail -1)"
[[ -n $PG_VER ]] || die "PostgreSQL config not found in /etc/postgresql"
PG_CONF_D="/etc/postgresql/$PG_VER/main/conf.d"
say "Configuring PostgreSQL $PG_VER (localhost only, small memory)"
install -d -o postgres -g postgres "$PG_CONF_D"
PG_CONF_NEW="$(cat <<'CONF'
# Written by jokoding-internal deploy/install.sh. 2 GB VPS shared with Hermes.
listen_addresses = 'localhost'
shared_buffers = 256MB
max_connections = 30
work_mem = 4MB
CONF
)"
if [[ ! -f $PG_CONF_D/internal.conf || $(cat "$PG_CONF_D/internal.conf") != "$PG_CONF_NEW" ]]; then
  printf '%s\n' "$PG_CONF_NEW" > "$PG_CONF_D/internal.conf"
  chown postgres:postgres "$PG_CONF_D/internal.conf"
  systemctl enable --quiet postgresql
  systemctl restart postgresql
else
  systemctl enable --quiet --now postgresql
fi
for _ in $(seq 1 10); do runuser -u postgres -- pg_isready -q && break; sleep 1; done
runuser -u postgres -- pg_isready -q || die "PostgreSQL is not answering. Check: journalctl -u postgresql -n 50"

# Keep the existing password: read it back from the env file.
DB_PASS=""
if [[ -f $ENV_FILE ]]; then
  DB_PASS="$(sed -n 's|^DATABASE_URL=postgres://[^:]*:\([^@]*\)@.*|\1|p' "$ENV_FILE" | head -1)"
fi
[[ -n $DB_PASS ]] || DB_PASS="$(openssl rand -hex 24)"

# SQL goes through stdin so the password never shows up in `ps`.
runuser -u postgres -- psql -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN;
  END IF;
END \$\$;
ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';
SQL
if [[ -z $(runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'") ]]; then
  runuser -u postgres -- createdb -O "$DB_USER" "$DB_NAME"
fi
echo "Database '$DB_NAME' owned by '$DB_USER' OK"

# ---------- user + env file ----------

id -u "$SVC_USER" >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$SVC_USER"

say "Writing $ENV_FILE (existing values are kept)"
install -d -m 750 -o root -g "$SVC_USER" "$ENV_DIR"
touch "$ENV_FILE"
chown root:"$SVC_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"
set_default() { grep -q "^$1=" "$ENV_FILE" || printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"; }
set_default DATABASE_URL "postgres://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME"
set_default PORT "$PORT"
set_default HOST 127.0.0.1
set_default CORS_ORIGIN "$CORS_ORIGIN"
# COOKIE_DOMAIN also turns on Secure cookies (src/main.js).
set_default COOKIE_DOMAIN "$COOKIE_DOMAIN"
# Invoice "today" uses the server's local time.
set_default TZ Asia/Jakarta
set_default NODE_ENV production
unset DB_PASS
grep -q '^HOST=127\.0\.0\.1$' "$ENV_FILE" || die "$ENV_FILE must keep HOST=127.0.0.1 (the API must not be public)"
grep -q "^PORT=$PORT$" "$ENV_FILE" || die "$ENV_FILE must keep PORT=$PORT"

# ---------- app files ----------

say "Copying the app to $APP_DIR"
install -d -m 755 "$APP_DIR/apps" "$APP_DIR/packages"
install -m 644 "$REPO_DIR/package.json" "$REPO_DIR/pnpm-workspace.yaml" "$REPO_DIR/pnpm-lock.yaml" "$APP_DIR/"
rsync -a --delete --chmod=D755,F644 --exclude node_modules --exclude test --exclude deploy \
  "$REPO_DIR/apps/internal-api" "$APP_DIR/apps/"
rsync -a --delete --chmod=D755,F644 --exclude node_modules --exclude test \
  "$REPO_DIR/packages/invoice-core" "$APP_DIR/packages/"

say "Installing dependencies (pnpm, production only)"
command -v corepack >/dev/null || npm install -g --silent corepack
corepack enable
(cd "$APP_DIR" && CI=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  pnpm install --prod --frozen-lockfile --filter @jokoding/internal-api... >/dev/null)

# ---------- service ----------

say "Starting service $APP_NAME on 127.0.0.1:$PORT"
sed -e "s|__NODE__|$NODE_BIN|" -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__PORT__|$PORT|" \
  "$DEPLOY_DIR/internal-api.service" > "$SERVICE_FILE"
systemctl daemon-reload
systemctl enable --quiet "$APP_NAME"
systemctl restart "$APP_NAME"
for _ in $(seq 1 15); do
  curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 \
  || die "API is not answering. Check the log: journalctl -u $APP_NAME -n 50"
echo "API OK"

# ---------- admin CLI wrapper ----------

cat > "$CLI_BIN" <<WRAP
#!/bin/sh
# Admin CLI for $APP_NAME. Usage: sudo $APP_NAME create-admin <username> "<name>"
set -e
[ "\$(id -u)" -eq 0 ] || { echo "run with sudo: sudo $APP_NAME \$*" >&2; exit 1; }
set -a; . $ENV_FILE; set +a
cd $APP_DIR/apps/internal-api
exec runuser -u $SVC_USER -- $NODE_BIN $APP_DIR/apps/internal-api/src/cli.js "\$@"
WRAP
chmod 755 "$CLI_BIN"

# ---------- nginx ----------

BACKUP=""
if [[ -f $NGINX_SITE ]]; then
  BACKUP="$NGINX_SITE.bak-$(date +%Y%m%d-%H%M%S)"
  cp "$NGINX_SITE" "$BACKUP"
fi
say "Configuring nginx for $DOMAIN"
sed -e "s|api\.internal\.example\.com|$DOMAIN|g" "$DEPLOY_DIR/nginx.conf" > "$NGINX_SITE"
[[ -n $BACKUP ]] && echo "Old config saved as $BACKUP"
ln -sf "$NGINX_SITE" "$NGINX_LINK"
if ! nginx -t 2>/dev/null; then
  nginx -t || true
  if [[ -n $BACKUP ]]; then cp "$BACKUP" "$NGINX_SITE"; else rm -f "$NGINX_LINK"; fi
  die "nginx rejected the new config, so the old one was put back"
fi
systemctl reload nginx

# ---------- HTTPS ----------

# Writing the config above removed certbot's HTTPS lines; put them back when a certificate exists.
if [[ -d /etc/letsencrypt/live/$DOMAIN ]]; then
  say "Re-applying the existing HTTPS certificate"
  certbot --nginx -d "$DOMAIN" --reinstall --redirect --non-interactive
  OPEN_AT="https://$DOMAIN"
elif ask_yes "Set up HTTPS with Let's Encrypt now? (DNS $DOMAIN must already point to this VPS)"; then
  certbot --nginx -d "$DOMAIN" --redirect
  OPEN_AT="https://$DOMAIN"
else
  OPEN_AT="http://$DOMAIN"
  echo "Skipped. Login cookies are Secure, so the app will NOT work until HTTPS is set up. Re-run later."
fi

# ---------- firewall ----------

say "Firewall (ufw): allow SSH, 80, 443. Port $PORT and PostgreSQL stay closed."
ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null
# sshd on a non-standard port: allow that too, so SSH is never cut.
for p in $(ss -ltnpH 2>/dev/null | awk '/"sshd"/ {n=split($4,a,":"); print a[n]}' | sort -u); do
  ufw allow "$p/tcp" >/dev/null
done
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
if ufw status | grep -q '^Status: active'; then
  echo "ufw already active; rules added"
else
  echo "WARNING: enabling ufw blocks every port not allowed above."
  ufw show added 2>/dev/null || true
  if ask_yes "Is your SSH port in the list above? Enable ufw now?"; then
    ufw --force enable
  else
    echo "ufw NOT enabled. Enable it later with: sudo ufw enable"
  fi
fi

# ---------- done ----------

say "Done"
cat <<DONE
API:      $OPEN_AT/api/health
Env:      $ENV_FILE
Logs:     journalctl -u $APP_NAME -f
Memory:   free -h
Update:   git pull && $INSTALL_CMD

Next steps (password is asked without echo):
  sudo $APP_NAME create-admin irfan "Irfan Qobus"
  sudo $APP_NAME set-bank 1 BCA 1234567890 "Nama Pemilik" --default
  sudo $APP_NAME set-bank 2 Mandiri 0987654321 "Nama Pemilik"
  sudo $APP_NAME add-user <username> "<nama>"
DONE
