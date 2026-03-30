#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_SCRIPT="$ROOT_DIR/backend/startup.sh"
FRONTEND_SCRIPT="$ROOT_DIR/frontend/startup.sh"
START_FRONTEND="${START_FRONTEND:-0}"
BACKEND_ARGS=()

usage() {
  cat <<'USAGE'
Usage: ./startup.sh [service|debug] [--frontend]

Options:
  --frontend  Also start frontend dev server
  --webui     Compatibility alias of --frontend
USAGE
}

cleanup() {
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
}

main() {
  if [[ ! -x "$BACKEND_SCRIPT" ]]; then
    echo "Backend startup script not found: $BACKEND_SCRIPT" >&2
    exit 1
  fi

  local arg
  for arg in "$@"; do
    case "$arg" in
      --frontend|--webui)
        START_FRONTEND=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        BACKEND_ARGS+=("$arg")
        ;;
    esac
  done

  if [[ "$START_FRONTEND" == "1" ]]; then
    if [[ ! -x "$FRONTEND_SCRIPT" ]]; then
      echo "Frontend startup script not found: $FRONTEND_SCRIPT" >&2
      exit 1
    fi

    trap cleanup EXIT INT TERM
    "$FRONTEND_SCRIPT" dev &
    FRONTEND_PID=$!
    echo "Frontend started with PID $FRONTEND_PID"
  fi

  exec "$BACKEND_SCRIPT" "${BACKEND_ARGS[@]}"
}

main "$@"
