#!/usr/bin/env bash
# Run INSIDE the palette container, after `cloudflared tunnel login`.
# Creates the tunnel, points the domain at it, installs the service.
# Locally managed, the same way walkmyhaus and pipeline are.

set -euo pipefail
DOMAIN="${DOMAIN:-hauspalette.com}"
NAME="${TUNNEL_NAME:-palette}"

[ -f /root/.cloudflared/cert.pem ] || { echo "Run 'cloudflared tunnel login' first."; exit 1; }

cloudflared tunnel list | awk '{print $2}' | grep -qx "$NAME" || cloudflared tunnel create "$NAME"
ID="$(cloudflared tunnel list | awk -v n="$NAME" '$2==n {print $1}')"

mkdir -p /etc/cloudflared
cat > /etc/cloudflared/config.yml <<EOF
tunnel: $ID
credentials-file: /root/.cloudflared/$ID.json
ingress:
  - hostname: $DOMAIN
    service: http://localhost:3200
  - hostname: www.$DOMAIN
    service: http://localhost:3200
  - service: http_status:404
EOF

cloudflared tunnel route dns --overwrite-dns "$NAME" "$DOMAIN"
cloudflared tunnel route dns --overwrite-dns "$NAME" "www.$DOMAIN"

systemctl is-enabled cloudflared >/dev/null 2>&1 || cloudflared service install
systemctl restart cloudflared
sleep 5
systemctl --no-pager --lines 5 status cloudflared | head -12

echo
echo "Check: curl -s https://$DOMAIN/api/healthz"
