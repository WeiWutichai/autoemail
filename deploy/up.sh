#!/bin/sh
# Rebuilds and restarts the production stack. Run on the VPS from the repo root
# (the GitHub "Deploy to VPS" workflow calls this after `git pull`).
set -eu

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "error: .env not found in $(pwd) - copy .env.example and fill in the secrets first" >&2
  exit 1
fi

# COMPOSE_FILE in .env selects the overlay (e.g. docker-compose.caddy.yml behind a shared proxy);
# otherwise use the nginx + certbot overlay.
if grep -q '^COMPOSE_FILE=' .env; then
  COMPOSE="docker compose"
else
  COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
fi

# Images are built before any container is replaced, so a failed build leaves the running stack untouched.
$COMPOSE up -d --build --remove-orphans
$COMPOSE ps
docker image prune -f >/dev/null
