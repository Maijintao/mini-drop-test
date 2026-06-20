#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/dist/mini-drop-release"
IMAGE_DIR="$PACKAGE_DIR/images"
PLATFORM="${PLATFORM:-linux/amd64}"
IMAGE_NAMESPACE="${IMAGE_NAMESPACE:-maijintao}"
DROP_IMAGE="${DROP_IMAGE:-$IMAGE_NAMESPACE/mini-drop-drop:latest}"
APISERVER_IMAGE="${APISERVER_IMAGE:-$IMAGE_NAMESPACE/mini-drop-apiserver:latest}"
ANALYSIS_IMAGE="${ANALYSIS_IMAGE:-$IMAGE_NAMESPACE/mini-drop-analysis:latest}"
WEB_IMAGE="${WEB_IMAGE:-$IMAGE_NAMESPACE/mini-drop-web:latest}"

rm -rf "$PACKAGE_DIR"
mkdir -p "$IMAGE_DIR"

echo "[package] building app images for $PLATFORM"
docker buildx build --platform "$PLATFORM" --load -t "$DROP_IMAGE" "$ROOT_DIR/drop"
docker buildx build --platform "$PLATFORM" --load -f "$ROOT_DIR/apiserver/Dockerfile" -t "$APISERVER_IMAGE" "$ROOT_DIR"
docker buildx build --platform "$PLATFORM" --load -t "$ANALYSIS_IMAGE" "$ROOT_DIR/analysis"
docker buildx build --platform "$PLATFORM" --load -t "$WEB_IMAGE" "$ROOT_DIR/web"

echo "[package] assembling package files"
mkdir -p "$PACKAGE_DIR/apiserver" "$PACKAGE_DIR/drop"
cp "$ROOT_DIR/docker-compose.release.yml" "$PACKAGE_DIR/docker-compose.release.yml"
cat >"$PACKAGE_DIR/.env" <<EOF
DROP_IMAGE=$DROP_IMAGE
APISERVER_IMAGE=$APISERVER_IMAGE
ANALYSIS_IMAGE=$ANALYSIS_IMAGE
WEB_IMAGE=$WEB_IMAGE
EOF
cp "$ROOT_DIR/README.md" "$PACKAGE_DIR/README.md"
cp -R "$ROOT_DIR/apiserver/config" "$PACKAGE_DIR/apiserver/config"
cp -R "$ROOT_DIR/drop/etc" "$PACKAGE_DIR/drop/etc"
cp -R "$ROOT_DIR/scripts" "$PACKAGE_DIR/scripts"
find "$PACKAGE_DIR" -name '.DS_Store' -delete
find "$PACKAGE_DIR" -name '._*' -delete
find "$PACKAGE_DIR" -name '__pycache__' -type d -prune -exec rm -rf {} +
find "$PACKAGE_DIR" -name '.pytest_cache' -type d -prune -exec rm -rf {} +
chmod +x "$PACKAGE_DIR/scripts/demo.sh" "$PACKAGE_DIR/scripts/demo_full_matrix.sh" "$PACKAGE_DIR/scripts/run_all_features.sh"

echo "[package] saving images"
docker save \
  "$DROP_IMAGE" \
  "$APISERVER_IMAGE" \
  "$ANALYSIS_IMAGE" \
  "$WEB_IMAGE" \
  -o "$IMAGE_DIR/mini-drop-release-images-amd64.tar"

echo "[package] creating archive"
COPYFILE_DISABLE=1 tar -C "$ROOT_DIR/dist" -czf "$ROOT_DIR/dist/mini-drop-release-amd64.tar.gz" mini-drop-release

echo "[package] done"
echo "$ROOT_DIR/dist/mini-drop-release-amd64.tar.gz"
