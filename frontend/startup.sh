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
  FRONTEND_KILL_PORT_CONFLICTS  Kill processes already listening on FRONTEND_PORT (default: 1)
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

validate_frontend_port() {
  if [[ ! "$FRONTEND_PORT" =~ ^[0-9]+$ ]] || (( FRONTEND_PORT < 1 || FRONTEND_PORT > 65535 )); then
    echo "Invalid FRONTEND_PORT: $FRONTEND_PORT" >&2
    exit 1
  fi
}

port_listener_pids() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -tiTCP:"$port" 2>/dev/null | sort -u
    return 0
  fi

  if command -v fuser >/dev/null 2>&1; then
    fuser "${port}/tcp" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' | sort -u
    return 0
  fi

  echo "Cannot inspect port $port: missing lsof or fuser." >&2
  return 1
}

wait_for_pids_to_exit() {
  local deadline=$((SECONDS + 3))
  local pid

  while (( SECONDS < deadline )); do
    local still_running=0
    for pid in "$@"; do
      if kill -0 "$pid" >/dev/null 2>&1; then
        still_running=1
        break
      fi
    done
    if (( still_running == 0 )); then
      return 0
    fi
    sleep 0.2
  done
  return 1
}

kill_port_conflicts() {
  local port="$1"
  local pids=()
  local pid

  if ! command -v lsof >/dev/null 2>&1 && ! command -v fuser >/dev/null 2>&1; then
    echo "Cannot inspect frontend port $port: missing lsof or fuser." >&2
    exit 1
  fi

  while IFS= read -r pid; do
    [[ -n "$pid" ]] && pids+=("$pid")
  done < <(port_listener_pids "$port")
  if [[ "${#pids[@]}" -eq 0 ]]; then
    echo "Frontend port $port is free."
    return 0
  fi

  local targets=()
  for pid in "${pids[@]}"; do
    if [[ -z "$pid" || "$pid" == "$$" || "$pid" == "${BASHPID:-}" ]]; then
      continue
    fi
    targets+=("$pid")
  done

  if [[ "${#targets[@]}" -eq 0 ]]; then
    echo "Frontend port $port is only used by the current startup process."
    return 0
  fi

  echo "Frontend port $port is in use by PID(s): ${targets[*]}"
  ps -o pid=,ppid=,stat=,command= -p "$(IFS=,; echo "${targets[*]}")" 2>/dev/null || true
  echo "Stopping conflicting frontend port process(es)..."
  kill "${targets[@]}" >/dev/null 2>&1 || true
  if ! wait_for_pids_to_exit "${targets[@]}"; then
    echo "Some process(es) did not exit after SIGTERM; forcing stop..."
    kill -9 "${targets[@]}" >/dev/null 2>&1 || true
    sleep 0.5
  fi
  echo "Frontend port $port is ready."
}

prepare_frontend_port() {
  case "${FRONTEND_KILL_PORT_CONFLICTS:-1}" in
    1|true|TRUE|yes|YES|on|ON)
      validate_frontend_port
      kill_port_conflicts "$FRONTEND_PORT"
      ;;
    *)
      validate_frontend_port
      ;;
  esac
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
      prepare_frontend_port
      echo "Starting frontend dev server on http://${FRONTEND_HOST}:${FRONTEND_PORT}"
      exec npm run dev -- --hostname "$FRONTEND_HOST" --port "$FRONTEND_PORT"
      ;;
    build)
      exec npm run build
      ;;
    start)
      prepare_frontend_port
      exec npm run start -- --hostname "$FRONTEND_HOST" --port "$FRONTEND_PORT"
      ;;
  esac
}

main "$@"
