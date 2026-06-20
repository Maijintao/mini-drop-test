#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${1:-${DEMO_HOST:-localhost}}"

export API_BASE_URL="${API_BASE_URL:-http://${HOST}:8191/api/v1}"
export WEB_URL="${WEB_URL:-http://${HOST}}"
export DEMO_USER="${DEMO_USER:-demo}"
export DEMO_PASS="${DEMO_PASS:-demo1234}"
export DEMO_DURATION="${DEMO_DURATION:-10}"
export DEMO_HZ="${DEMO_HZ:-99}"
export DEMO_CONTINUOUS_WINDOW="${DEMO_CONTINUOUS_WINDOW:-15}"

DOCKER="${DOCKER:-docker}"
if ! $DOCKER ps >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
  if [[ -n "${DEMO_SUDO_PASSWORD:-}" ]]; then
    ASKPASS_FILE="$(mktemp)"
    chmod 700 "$ASKPASS_FILE"
    printf '#!/usr/bin/env bash\nprintf %%s "$DEMO_SUDO_PASSWORD"\n' >"$ASKPASS_FILE"
    export SUDO_ASKPASS="$ASKPASS_FILE"
    DOCKER="sudo -A docker"
  else
    DOCKER="sudo docker"
  fi
fi
export DOCKER

echo "[all] API=$API_BASE_URL"
echo "[all] WEB=$WEB_URL"
echo "[all] checking release containers"
$DOCKER compose -f "$ROOT_DIR/docker-compose.release.yml" ps

rm -f /tmp/mini_drop_* 2>/dev/null || {
  if command -v sudo >/dev/null 2>&1; then
    sudo rm -f /tmp/mini_drop_* 2>/dev/null || true
  fi
}

exec "$ROOT_DIR/scripts/demo_full_matrix.sh"
