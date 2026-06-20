#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/dist/mini-drop-vm"
IMAGE_DIR="$PACKAGE_DIR/images"
PLATFORM="${PLATFORM:-linux/amd64}"

mkdir -p "$IMAGE_DIR"

echo "[package] building app images for $PLATFORM"
docker buildx build --platform "$PLATFORM" --load -t mini-drop-vm/drop:verify "$ROOT_DIR/drop"
docker buildx build --platform "$PLATFORM" --load -t mini-drop-vm/apiserver:verify "$ROOT_DIR/apiserver"
docker buildx build --platform "$PLATFORM" --load -t mini-drop-vm/web-frontend:verify "$ROOT_DIR/web"

echo "[package] building pinned service images for $PLATFORM"
docker buildx build --platform "$PLATFORM" --load -t mini-drop-vm/postgres:14-amd64 "$ROOT_DIR/deploy/vm/service-images/postgres"
docker buildx build --platform "$PLATFORM" --load -t mini-drop-vm/minio:latest-amd64 "$ROOT_DIR/deploy/vm/service-images/minio"

echo "[package] assembling package files"
rm -rf "$PACKAGE_DIR/apiserver" "$PACKAGE_DIR/analysis" "$PACKAGE_DIR/drop" "$PACKAGE_DIR/scripts"
mkdir -p "$PACKAGE_DIR/apiserver" "$PACKAGE_DIR/drop"
cp "$ROOT_DIR/deploy/vm/docker-compose.vm.yml" "$PACKAGE_DIR/docker-compose.vm.yml"
cp "$ROOT_DIR/deploy/vm/load-and-run.sh" "$PACKAGE_DIR/load-and-run.sh"
cp "$ROOT_DIR/deploy/vm/README.md" "$PACKAGE_DIR/README.md"
cp "$ROOT_DIR/deploy/vm/demo-existing.sh" "$PACKAGE_DIR/demo-existing.sh"
cp -R "$ROOT_DIR/apiserver/config" "$PACKAGE_DIR/apiserver/config"
cp -R "$ROOT_DIR/drop/etc" "$PACKAGE_DIR/drop/etc"
cp -R "$ROOT_DIR/analysis" "$PACKAGE_DIR/analysis"
cp -R "$ROOT_DIR/scripts" "$PACKAGE_DIR/scripts"
find "$PACKAGE_DIR" -name '.DS_Store' -delete
find "$PACKAGE_DIR" -name '._*' -delete
find "$PACKAGE_DIR" -name '__pycache__' -type d -prune -exec rm -rf {} +
find "$PACKAGE_DIR" -name '.pytest_cache' -type d -prune -exec rm -rf {} +
chmod +x "$PACKAGE_DIR/load-and-run.sh" "$PACKAGE_DIR/demo-existing.sh" "$PACKAGE_DIR/scripts/demo.sh" "$PACKAGE_DIR/scripts/demo_full_matrix.sh"

echo "[package] saving images"
docker save \
  mini-drop-vm/drop:verify \
  mini-drop-vm/apiserver:verify \
  mini-drop-vm/web-frontend:verify \
  mini-drop-vm/postgres:14-amd64 \
  mini-drop-vm/minio:latest-amd64 \
  -o "$IMAGE_DIR/mini-drop-vm-images-amd64.tar"

echo "[package] creating archive"
COPYFILE_DISABLE=1 tar -C "$ROOT_DIR/dist" -czf "$ROOT_DIR/dist/mini-drop-vm-amd64.tar.gz" mini-drop-vm

echo "[package] done"
echo "$ROOT_DIR/dist/mini-drop-vm-amd64.tar.gz"
