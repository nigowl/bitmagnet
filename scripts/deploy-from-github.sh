#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  deploy-from-github.sh --repo <owner/repo> [--ref <git-ref>] [--mode with-db|no-db] [--target-dir <dir>] [--skip-build]

Examples:
  ./scripts/deploy-from-github.sh --repo bitmagnet-io/bitmagnet --ref main --mode with-db
  ./scripts/deploy-from-github.sh --repo bitmagnet-io/bitmagnet --ref v0.0.1 --mode no-db --target-dir /opt/bitmagnet
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

REPO=""
REF="main"
MODE="with-db"
TARGET_DIR="./deployments"
SKIP_BUILD="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --ref)
      REF="${2:-}"
      shift 2
      ;;
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --target-dir)
      TARGET_DIR="${2:-}"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$REPO" ]]; then
  echo "--repo is required" >&2
  usage
  exit 1
fi

if [[ "$MODE" != "with-db" && "$MODE" != "no-db" ]]; then
  echo "--mode must be with-db or no-db" >&2
  exit 1
fi

require_cmd curl
require_cmd tar
require_cmd docker

mkdir -p "$TARGET_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
work_root="$(cd "$TARGET_DIR" && pwd)"
archive_path="${work_root}/bitmagnet-${REF}-${timestamp}.tar.gz"

download_url="https://codeload.github.com/${REPO}/tar.gz/${REF}"
echo "[1/4] Downloading source package from: ${download_url}"
curl -fL "$download_url" -o "$archive_path"

extract_dir="${work_root}/bitmagnet-${REF}-${timestamp}"
mkdir -p "$extract_dir"
echo "[2/4] Extracting package to: ${extract_dir}"
tar -xzf "$archive_path" -C "$extract_dir" --strip-components=1

if [[ ! -f "${extract_dir}/docker-compose.with-db.yml" || ! -f "${extract_dir}/docker-compose.no-db.yml" ]]; then
  echo "Expected compose files not found in downloaded package." >&2
  exit 1
fi

compose_file="docker-compose.with-db.yml"
if [[ "$MODE" == "no-db" ]]; then
  compose_file="docker-compose.no-db.yml"
fi

echo "[3/4] Starting docker compose (${MODE})"
pushd "$extract_dir" >/dev/null
if [[ "$SKIP_BUILD" == "true" ]]; then
  docker compose -f "$compose_file" up -d
else
  docker compose -f "$compose_file" up -d --build
fi
popd >/dev/null

echo "[4/4] Deployment complete"
echo "Project directory: ${extract_dir}"
echo "Compose file: ${compose_file}"
echo "Frontend: http://localhost:3334"
echo "Backend API: http://localhost:3333"
if [[ "$MODE" == "with-db" ]]; then
  echo "PostgreSQL: localhost:5432 (user/postgres, pass/postgres by default)"
else
  echo "External PostgreSQL mode enabled. Adjust POSTGRES_* variables in compose/.env as needed."
fi
