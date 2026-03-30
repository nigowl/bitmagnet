#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_MODE="${FRONTEND_MODE:-dev}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-3334}"

load_optional_env() {
  local env_file

  for env_file in \
    "$ROOT_DIR/.env.startup" \
    "$ROOT_DIR/.env.startup.local" \
    "$ROOT_DIR/.env"; do
    if [[ -f "$env_file" ]]; then
      # shellcheck disable=SC1090
      source "$env_file"
    fi
  done
}

usage() {
  cat <<'USAGE'
Usage: ./startup.sh [dev|build|start]

Environment:
  FRONTEND_HOST  Host for dev/start mode (default: 0.0.0.0)
  FRONTEND_PORT  Port for dev/start mode (default: 3334)
USAGE
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

ensure_dependencies() {
  if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
    echo "Installing frontend dependencies..."
    npm install
  fi
}

main() {
  load_optional_env

  if [[ $# -gt 0 ]]; then
    case "$1" in
      dev|build|start)
        FRONTEND_MODE="$1"
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown mode: $1" >&2
        usage
        exit 1
        ;;
    esac
  fi

  require_command npm
  cd "$ROOT_DIR"
  ensure_dependencies

  case "$FRONTEND_MODE" in
    dev)
      echo "Starting frontend dev server on http://${FRONTEND_HOST}:${FRONTEND_PORT}"
      exec npm run dev -- --hostname "$FRONTEND_HOST" --port "$FRONTEND_PORT"
      ;;
    build)
      exec npm run build
      ;;
    start)
      exec npm run start -- --hostname "$FRONTEND_HOST" --port "$FRONTEND_PORT"
      ;;
  esac
}

main "$@"
