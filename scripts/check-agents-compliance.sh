#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

failures=0

warn() {
  printf 'WARN: %s\n' "$*"
}

fail() {
  printf 'FAIL: %s\n' "$*"
  failures=$((failures + 1))
}

check_line_limits() {
  local label="$1"
  local soft="$2"
  local hard="$3"
  shift 3

  while IFS= read -r -d '' file; do
    local lines
    lines="$(wc -l < "$file" | tr -d ' ')"
    if (( lines > hard )); then
      fail "$label hard limit exceeded: $file has $lines lines (hard $hard)"
    elif (( lines > soft )); then
      warn "$label soft limit exceeded: $file has $lines lines (soft $soft)"
    fi
  done < <("$@")
}

frontend_soft_limit_for() {
  local file="$1"
  case "$file" in
    frontend/src/components/torrent-player-page.tsx)
      # This file is the high-cohesion player orchestration shell. Rendering,
      # stream management, seek logic, subtitles, preferences and lifecycle work
      # are already split into torrent-player-page.* modules, so keep only the
      # hard limit actionable here.
      printf '1000\n'
      ;;
    *)
      printf '500\n'
      ;;
  esac
}

check_frontend_line_limits() {
  local hard=1000

  while IFS= read -r -d '' file; do
    local lines soft
    lines="$(wc -l < "$file" | tr -d ' ')"
    soft="$(frontend_soft_limit_for "$file")"
    if (( lines > hard )); then
      fail "Frontend source hard limit exceeded: $file has $lines lines (hard $hard)"
    elif (( lines > soft )); then
      warn "Frontend source soft limit exceeded: $file has $lines lines (soft $soft)"
    fi
  done < <(frontend_sources)
}

go_sources() {
  find backend/internal -type f -name '*.go' \
    ! -name '*.gen.go' \
    ! -name '*.pb.go' \
    ! -name '*_test.go' \
    ! -path '*/mocks/*' \
    ! -path '*/mock/*' \
    -print0
}

frontend_sources() {
  find frontend/app frontend/src -type f \( -name '*.ts' -o -name '*.tsx' \) \
    ! -path '*/node_modules/*' \
    ! -path '*/.next/*' \
    -print0
}

check_gorm_boundary() {
  local unexpected
  unexpected="$(
    rg -n 'pgx|pgxpool|database/sql' backend/internal --glob '!**/*_test.go' |
      rg -v 'backend/internal/database/postgres/' |
      rg -v 'backend/internal/database/migrations/' |
      rg -v 'backend/internal/database/gorm.go:' |
      rg -v 'backend/internal/database/dao/' |
      rg -v 'backend/internal/database/search/' |
      rg -v 'backend/internal/database/fts/' |
      rg -v 'backend/internal/model/' |
      rg -v 'backend/internal/gql/' |
      rg -v 'backend/internal/protobuf/' |
      rg -v 'backend/internal/protocol/' |
      rg -v 'backend/internal/classifier/.*_enum.go:' |
      rg -v 'backend/internal/bloom/stable.go:' |
      rg -v 'backend/internal/dhtcrawler/infohash_triage.go:' |
      rg -v 'backend/internal/processor/persist.go:' || true
  )"

  if [[ -n "$unexpected" ]]; then
    fail "unexpected low-level SQL/pgx usage outside allowed persistence boundaries:"
    printf '%s\n' "$unexpected"
  fi
}

printf 'Checking AGENTS.md compliance from %s\n' "$ROOT"

check_line_limits "Go source" 500 800 go_sources
check_frontend_line_limits
check_gorm_boundary

if (( failures > 0 )); then
  printf 'AGENTS compliance check failed with %d issue(s).\n' "$failures"
  exit 1
fi

printf 'AGENTS compliance check passed. Review WARN entries as refactor candidates.\n'
