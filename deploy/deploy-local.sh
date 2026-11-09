#!/bin/sh
# Deploys from this machine using credentials in deploy/private/vps.env (git-ignored).
# Same steps as the GitHub "Deploy to VPS" workflow: git pull main on the VPS, then deploy/up.sh.
set -eu

cd "$(dirname "$0")/.."
CONF=deploy/private/vps.env
if [ ! -f "$CONF" ]; then
  echo "error: $CONF not found - copy deploy/vps.env.example and fill it in" >&2
  exit 1
fi
. "./$CONF"

: "${VPS_HOST:?VPS_HOST missing in $CONF}"
: "${VPS_USER:?VPS_USER missing in $CONF}"
KEY="${VPS_SSH_KEY_FILE:-deploy/private/autoemail_deploy}"
[ -f "$KEY" ] || { echo "error: SSH key $KEY not found" >&2; exit 1; }
chmod 600 "$KEY"

ssh -i "$KEY" -p "${VPS_PORT:-22}" -o BatchMode=yes -o ServerAliveInterval=30 \
  "$VPS_USER@$VPS_HOST" \
  "set -e; cd '${VPS_APP_DIR:-/opt/autoemail}' && git pull --ff-only origin main && sh deploy/up.sh"
