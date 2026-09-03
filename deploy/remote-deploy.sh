#!/usr/bin/env bash
# Runs on the server, fed to `bash -s` over SSH by .github/workflows/deploy.yml.
# The workflow prepends GHCR_USER / GHCR_TOKEN to this script on stdin, so the
# registry credential never appears in the server's process list.
set -euo pipefail

: "${GHCR_USER:?GHCR_USER not set}"
: "${GHCR_TOKEN:?GHCR_TOKEN not set}"

cd /opt/growly

printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT

docker compose pull
docker compose up -d --remove-orphans
docker image prune -f

# The image declares a HEALTHCHECK; wait for it rather than assuming success.
for _ in $(seq 1 45); do
  state=$(docker inspect -f '{{.State.Health.Status}}' growly 2>/dev/null || echo missing)
  case "$state" in
    healthy)   echo "growly is healthy"; exit 0 ;;
    unhealthy) break ;;
  esac
  sleep 2
done

echo "growly did not come up healthy" >&2
docker compose ps >&2
docker compose logs --tail=60 growly >&2
exit 1
