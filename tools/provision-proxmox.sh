#!/usr/bin/env bash
# Palette on Proxmox, in one run. Same shape as walkmyhaus (CT 103) and
# pipeline (CT 105): a dedicated unprivileged LXC, Cloudflare Tunnel out.
#
# Run on the PROXMOX HOST as root:
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/HAUS-Custom-Homes/Palette/main/tools/provision-proxmox.sh)
#
# It is safe to run again: every step checks before it acts. Secrets are
# generated inside the container and written straight to .env.production;
# nothing secret is printed.
#
# Overrides:  CTID=106 CT_IP=dhcp STORAGE=local-lvm DISK_GB=200 bash provision-proxmox.sh

set -euo pipefail

CTID="${CTID:-$(pvesh get /cluster/nextid)}"
CT_NAME="${CT_NAME:-palette}"
STORAGE="${STORAGE:-local-lvm}"
DISK_GB="${DISK_GB:-200}"
CT_IP="${CT_IP:-dhcp}"
BRIDGE="${BRIDGE:-vmbr0}"
DOMAIN="${DOMAIN:-hauspalette.com}"
REPO="https://github.com/HAUS-Custom-Homes/Palette.git"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# An existing container named palette wins over a new id.
EXISTING="$(pct list | awk -v n="$CT_NAME" '$NF==n {print $1}' | head -1)"
if [ -n "$EXISTING" ]; then
  CTID="$EXISTING"
  say "Container $CTID ($CT_NAME) already exists, reusing it"
else
  say "Creating container $CTID ($CT_NAME): 2 cores, 4GB RAM, ${DISK_GB}GB on $STORAGE"
  pveam update >/dev/null
  TEMPLATE="$(pveam available --section system | awk '/debian-13-standard/ {print $2}' | sort -V | tail -1)"
  [ -n "$TEMPLATE" ] || { echo "No debian-13 template available"; exit 1; }
  pveam list local | grep -q "$TEMPLATE" || pveam download local "$TEMPLATE"
  NET="name=eth0,bridge=$BRIDGE,ip=$CT_IP"
  [ "$CT_IP" = "dhcp" ] || NET="$NET,gw=${CT_GW:?set CT_GW with a static CT_IP}"
  pct create "$CTID" "local:vztmpl/$TEMPLATE" \
    --hostname "$CT_NAME" --unprivileged 1 --features nesting=1,keyctl=1 \
    --cores 2 --memory 4096 --swap 1024 \
    --rootfs "$STORAGE:$DISK_GB" --net0 "$NET" --onboot 1
fi

pct status "$CTID" | grep -q running || pct start "$CTID"
sleep 5

run() { pct exec "$CTID" -- bash -lc "$1"; }

say "Docker, git, cloudflared"
run 'export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git openssl >/dev/null
  command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh >/dev/null
  if ! command -v cloudflared >/dev/null; then
    mkdir -p --mode=0755 /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list
    apt-get update -qq && apt-get install -y -qq cloudflared >/dev/null
  fi
  docker --version; cloudflared --version'

say "Code"
run "if [ -d /opt/palette/.git ]; then git -C /opt/palette pull --ff-only; else git clone $REPO /opt/palette; fi
  mkdir -p /srv/palette/library /srv/palette/backups"

say "Settings file (secrets generated here, never shown)"
run 'cd /opt/palette
  if [ ! -f .env.production ]; then
    umask 077
    {
      echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
      echo "AUTH_SECRET=$(openssl rand -base64 32)"
      echo "PALETTE_LIBRARY_DIR=/srv/palette/library"
      echo "PALETTE_ALLOWED_DOMAIN=hauscustomhomes.com"
      echo "AUTH_URL=https://'"$DOMAIN"'"
      echo "AUTH_TRUST_HOST=true"
      echo "AUTH_GOOGLE_ID="
      echo "AUTH_GOOGLE_SECRET="
      echo "ANTHROPIC_API_KEY="
    } > .env.production
    echo "written"
  else
    echo "kept existing .env.production"
  fi'

say "Build and start (first build takes several minutes)"
run 'cd /opt/palette && docker compose --env-file .env.production up -d --build'

say "Waiting for the app"
run 'for i in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3200/api/healthz || true)
    [ "$code" = "200" ] && { echo "healthz 200"; exit 0; }
    sleep 5
  done
  echo "app did not come up; last logs:"; cd /opt/palette && docker compose logs --tail 40 app; exit 1'

IP="$(pct exec "$CTID" -- hostname -I | awk '{print $1}')"

cat <<EOF

== Palette is running in CT $CTID at http://$IP:3200 (office LAN)

Two things left, both yours because each involves signing in:

1. The tunnel. Same as pipeline, no token to copy:

     pct enter $CTID
     cloudflared tunnel login            # open the link, pick $DOMAIN
     bash /opt/palette/tools/tunnel-setup.sh

2. Google sign-in. Create the OAuth client with redirect URI
     https://$DOMAIN/api/auth/callback/google
   then:
     nano /opt/palette/.env.production   # fill AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET
     cd /opt/palette && docker compose --env-file .env.production up -d

EOF
