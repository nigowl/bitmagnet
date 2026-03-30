#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_DIR="${ROOT_DIR}/tmp"
BIN_DIR="${ROOT_DIR}/.bin"

POSTGRES_CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-bitmagnet-postgres-dev}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
POSTGRES_HOST="${POSTGRES_HOST:-192.168.31.201}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-bitmagnet}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-jaQ1BezHeQZ741wvjVRCLbGD4X5xK5lA}"
POSTGRES_DATA_DIR="${POSTGRES_DATA_DIR:-$ROOT_DIR/data/postgres}"
BITMAGNET_CONFIG_DIR="${BITMAGNET_CONFIG_DIR:-$ROOT_DIR/config}"
POSTGRES_AUTO_START="${POSTGRES_AUTO_START:-0}"

BITMAGNET_WORKER_KEYS="${BITMAGNET_WORKER_KEYS:-all}"
BITMAGNET_MODE="${BITMAGNET_MODE:-service}"
BITMAGNET_WEBUI_DEV="${BITMAGNET_WEBUI_DEV:-0}"
BITMAGNET_WEBUI_HOST="${BITMAGNET_WEBUI_HOST:-0.0.0.0}"
BITMAGNET_WEBUI_PORT="${BITMAGNET_WEBUI_PORT:-3334}"
BITMAGNET_BINARY_PATH="${BITMAGNET_BINARY_PATH:-$TMP_DIR/bitmagnet-dev}"

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
  cat <<'EOF'
Usage: ./startup.sh [service|debug] [--webui]

Modes:
  service  Start bitmagnet with the configured worker set
  debug    Start in debug mode with Go hot reload via Air

Options:
  --webui   Also start the Angular dev server on BITMAGNET_WEBUI_PORT

Environment:
  POSTGRES_AUTO_START=1     Start a local postgres container before launch
  BITMAGNET_WORKER_KEYS     Worker keys, e.g. "http_server" or "http_server,queue_server"
  BITMAGNET_MODE            Default mode when no positional mode is passed
  BITMAGNET_WEBUI_DEV=1     Start Angular dev server alongside the backend
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

docker_container_exists() {
  docker ps -a --format '{{.Names}}' | grep -Fxq "$1"
}

docker_container_running() {
  docker ps --format '{{.Names}}' | grep -Fxq "$1"
}

wait_for_postgres() {
  local attempt

  for attempt in $(seq 1 30); do
    if docker exec "$POSTGRES_CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      return 0
    fi

    echo "Waiting for PostgreSQL to become ready... ($attempt/30)"
    sleep 2
  done

  echo "PostgreSQL did not become ready in time." >&2
  exit 1
}

start_postgres_container() {
  mkdir -p "$POSTGRES_DATA_DIR" "$BITMAGNET_CONFIG_DIR"

  if docker_container_running "$POSTGRES_CONTAINER_NAME"; then
    echo "PostgreSQL container is already running: $POSTGRES_CONTAINER_NAME"
    return 0
  fi

  if docker_container_exists "$POSTGRES_CONTAINER_NAME"; then
    echo "Starting existing PostgreSQL container: $POSTGRES_CONTAINER_NAME"
    docker start "$POSTGRES_CONTAINER_NAME" >/dev/null
  else
    echo "Creating PostgreSQL container: $POSTGRES_CONTAINER_NAME"
    docker run -d \
      --name "$POSTGRES_CONTAINER_NAME" \
      -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
      -e POSTGRES_DB="$POSTGRES_DB" \
      -e POSTGRES_USER="$POSTGRES_USER" \
      -p "$POSTGRES_PORT:5432" \
      -v "$POSTGRES_DATA_DIR:/var/lib/postgresql/data" \
      --shm-size=1g \
      "$POSTGRES_IMAGE" >/dev/null
  fi

  wait_for_postgres
}

set_runtime_env() {
  export POSTGRES_HOST
  export POSTGRES_PORT
  export POSTGRES_NAME="$POSTGRES_DB"
  export POSTGRES_USER
  export POSTGRES_PASSWORD
}

set_debug_env() {
  export LOG_LEVEL="${LOG_LEVEL:-debug}"
  export LOG_DEVELOPMENT="${LOG_DEVELOPMENT:-true}"
  export HTTP_SERVER_GIN_MODE="${HTTP_SERVER_GIN_MODE:-debug}"
}

build_run_args() {
  if [[ "$BITMAGNET_WORKER_KEYS" == "all" ]]; then
    printf '%s' "worker run --all"
    return 0
  fi

  printf '%s' "worker run --keys=$BITMAGNET_WORKER_KEYS"
}

ensure_air() {
  if command -v air >/dev/null 2>&1; then
    command -v air
    return 0
  fi

  mkdir -p "$BIN_DIR"
  if [[ -x "$BIN_DIR/air" ]]; then
    printf '%s\n' "$BIN_DIR/air"
    return 0
  fi

  echo "Installing Air for hot reload..."
  GOBIN="$BIN_DIR" go install github.com/air-verse/air@latest
  printf '%s\n' "$BIN_DIR/air"
}

write_air_config() {
  local run_args="$1"
  local config_path="$TMP_DIR/startup.air.toml"
  local runner_path="$TMP_DIR/startup.air.run.sh"

  mkdir -p "$TMP_DIR"

  cat >"$runner_path" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$BITMAGNET_BINARY_PATH" $run_args
EOF
  chmod +x "$runner_path"

  cat >"$config_path" <<EOF
root = "$ROOT_DIR"
tmp_dir = "$TMP_DIR/air"

[build]
cmd = "go build -o $BITMAGNET_BINARY_PATH ."
entrypoint = "$runner_path"
delay = 800
exclude_dir = ["config", "data", "tmp", ".git", "webui/dist", "webui/node_modules"]
exclude_file = []
exclude_regex = ["_test\\\\.go"]
include_ext = ["go", "graphql", "graphqls", "json", "yaml", "yml"]
kill_delay = "500ms"
send_interrupt = true
stop_on_error = true

[log]
time = true

[screen]
clear_on_rebuild = false
keep_scroll = true
EOF

  printf '%s\n' "$config_path"
}

start_webui_dev_server() {
  require_command npm

  echo "Starting Angular dev server on http://${BITMAGNET_WEBUI_HOST}:${BITMAGNET_WEBUI_PORT}"
  (
    cd "$ROOT_DIR/webui"
    exec npm start -- --host "$BITMAGNET_WEBUI_HOST" --port "$BITMAGNET_WEBUI_PORT"
  ) &

  WEBUI_DEV_PID=$!
}

cleanup() {
  if [[ -n "${WEBUI_DEV_PID:-}" ]] && kill -0 "$WEBUI_DEV_PID" >/dev/null 2>&1; then
    kill "$WEBUI_DEV_PID" >/dev/null 2>&1 || true
  fi
}

parse_args() {
  local arg

  for arg in "$@"; do
    case "$arg" in
      service|debug)
        BITMAGNET_MODE="$arg"
        ;;
      start)
        BITMAGNET_MODE="service"
        ;;
      hot)
        BITMAGNET_MODE="debug"
        ;;
      --webui)
        BITMAGNET_WEBUI_DEV=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $arg" >&2
        usage
        exit 1
        ;;
    esac
  done
}

run_backend() {
  local run_args

  run_args="$(build_run_args)"

  echo "Starting bitmagnet on http://localhost:3333"
  echo "Using PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
  echo "Worker args: ${run_args}"

  if [[ "$BITMAGNET_MODE" == "debug" ]]; then
    local air_bin air_config
    air_bin="$(ensure_air)"
    air_config="$(write_air_config "$run_args")"
    if [[ "$BITMAGNET_WEBUI_DEV" == "1" ]]; then
      "$air_bin" -c "$air_config"
      return $?
    fi
    exec "$air_bin" -c "$air_config"
  fi

  if [[ "$BITMAGNET_WEBUI_DEV" == "1" ]]; then
    go run . $run_args
    return $?
  fi

  exec go run . $run_args
}

normalize_mode() {
  case "$BITMAGNET_MODE" in
    service|debug)
      ;;
    start)
      BITMAGNET_MODE="service"
      ;;
    hot)
      BITMAGNET_MODE="debug"
      ;;
    *)
      echo "Unknown mode: $BITMAGNET_MODE" >&2
      usage
      exit 1
      ;;
  esac
}

main() {
  load_optional_env
  parse_args "$@"
  normalize_mode

  require_command go

  cd "$ROOT_DIR"

  if [[ "$POSTGRES_AUTO_START" == "1" ]]; then
    require_command docker
    start_postgres_container
  fi

  if [[ "$BITMAGNET_MODE" == "debug" ]]; then
    set_debug_env
  fi

  set_runtime_env

  if [[ "$BITMAGNET_WEBUI_DEV" == "1" ]]; then
    trap cleanup EXIT INT TERM
    start_webui_dev_server
  fi

  run_backend
}

main "$@"
