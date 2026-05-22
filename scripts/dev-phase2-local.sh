#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOCAL_API_URL="http://localhost:4000"
LOCAL_API_WEB_URL="http://localhost:4101"
LOCAL_REALTIME_URL="http://localhost:4102"
LOCAL_QUIZ_URL="http://localhost:3000"
LOCAL_ADMIN_URL="http://localhost:3001"
LOG_DIR="${TMPDIR:-/tmp}/mini-quiz-phase2-local-$$"
mkdir -p "$LOG_DIR"

PIDS=()

cleanup() {
  echo
  echo "Stopping Mini Quiz Phase 2 local processes..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT INT TERM

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local seconds="${3:-60}"
  local started
  started="$(date +%s)"
  printf "Waiting for %s at %s" "$name" "$url"
  while true; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo " ok"
      return 0
    fi
    if (( "$(date +%s)" - started >= seconds )); then
      echo
      echo "Timed out waiting for $name."
      echo "Recent logs:"
      tail -n 80 "$LOG_DIR"/*.log 2>/dev/null || true
      exit 1
    fi
    printf "."
    sleep 1
  done
}

wait_for_postgres() {
  printf "Waiting for local Postgres"
  for _ in {1..60}; do
    if docker compose exec -T postgres pg_isready -U miniquiz -d miniquiz >/dev/null 2>&1; then
      echo " ok"
      return 0
    fi
    printf "."
    sleep 1
  done
  echo
  echo "Postgres did not become ready. Try: docker compose logs postgres"
  exit 1
}

wait_for_redis() {
  printf "Waiting for local Redis"
  for _ in {1..60}; do
    if docker compose exec -T redis redis-cli ping >/dev/null 2>&1; then
      echo " ok"
      return 0
    fi
    printf "."
    sleep 1
  done
  echo
  echo "Redis did not become ready. Try: docker compose logs redis"
  exit 1
}

wait_for_nats() {
  wait_for_url "local NATS" "http://localhost:8222/healthz" 60
}

echo "Mini Quiz Phase 2 local dev"
echo

need_cmd node
need_cmd pnpm
need_cmd docker
need_cmd curl

if [ ! -f .env ]; then
  echo "No .env found; copying .env.example to .env."
  cp .env.example .env
fi

for app in api quiz admin; do
  if [ ! -e "apps/$app/.env" ]; then
    ln -s ../../.env "apps/$app/.env"
  fi
done

set -a
# shellcheck disable=SC1091
. ./.env
set +a

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  pnpm install
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://miniquiz:miniquiz@localhost:5432/miniquiz?schema=public}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export NATS_URL="${NATS_URL:-nats://localhost:4222}"
export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-local-dev-secret-change-me-please-32}"
export INITIAL_ADMIN_EMAIL="${INITIAL_ADMIN_EMAIL:-you@example.com}"
if [ -z "${INITIAL_ADMIN_PASSWORD:-}" ] || [[ "${INITIAL_ADMIN_PASSWORD:-}" == replace-* ]]; then
  export INITIAL_ADMIN_PASSWORD="LocalAdmin123"
fi
export NEXTAUTH_URL="$LOCAL_ADMIN_URL"
export NEXT_PUBLIC_API_BASE_URL="$LOCAL_API_URL"
export NEXT_PUBLIC_QUIZ_BASE_URL="$LOCAL_QUIZ_URL"
export CORS_ORIGIN="$LOCAL_QUIZ_URL,$LOCAL_ADMIN_URL,$LOCAL_API_URL,$LOCAL_API_WEB_URL,$LOCAL_REALTIME_URL"
export LOG_LEVEL="${LOG_LEVEL:-info}"

if [ -z "${TREASURY_PRIVATE_KEY:-}" ]; then
  export TREASURY_PRIVATE_KEY="0x59c6995e998f97a5a0044966f0945387d5c18e8822e6f07445d0e13e8e3b23d"
fi

echo "Starting Postgres, Redis, and NATS..."
docker compose up -d postgres redis nats
wait_for_postgres
wait_for_redis
wait_for_nats

echo "Building shared package..."
pnpm --filter @mini-quiz/shared build

echo "Applying Prisma migrations..."
pnpm --filter @mini-quiz/api prisma migrate deploy
pnpm --filter @mini-quiz/api prisma generate

echo "Seeding local admin if needed..."
pnpm --filter @mini-quiz/api seed-admin

echo "Starting Phase 2 backend split..."
PORT=4101 APP_ROLE=web ENABLE_EMBEDDED_SSE=false pnpm --filter @mini-quiz/api exec tsx src/server.ts >"$LOG_DIR/api-web.log" 2>&1 &
PIDS+=("$!")
PORT=4102 APP_ROLE=realtime pnpm --filter @mini-quiz/api exec tsx src/realtime-gateway.ts >"$LOG_DIR/realtime.log" 2>&1 &
PIDS+=("$!")
APP_ROLE=score-worker pnpm --filter @mini-quiz/api exec tsx src/score-worker.ts >"$LOG_DIR/score-worker.log" 2>&1 &
PIDS+=("$!")
APP_ROLE=scheduler-worker pnpm --filter @mini-quiz/api exec tsx src/worker.ts >"$LOG_DIR/scheduler-worker.log" 2>&1 &
PIDS+=("$!")
APP_ROLE=payout-worker pnpm --filter @mini-quiz/api exec tsx src/payout-worker.ts >"$LOG_DIR/payout-worker.log" 2>&1 &
PIDS+=("$!")

echo "Starting local API path proxy..."
node scripts/phase2-local-proxy.mjs >"$LOG_DIR/proxy.log" 2>&1 &
PIDS+=("$!")

echo "Starting frontend apps..."
pnpm --filter @mini-quiz/quiz dev >"$LOG_DIR/quiz.log" 2>&1 &
PIDS+=("$!")
pnpm --filter @mini-quiz/admin dev >"$LOG_DIR/admin.log" 2>&1 &
PIDS+=("$!")

wait_for_url "API web" "$LOCAL_API_WEB_URL/health" 90
wait_for_url "Realtime gateway" "$LOCAL_REALTIME_URL/health" 90
wait_for_url "API proxy" "$LOCAL_API_URL/health" 90
wait_for_url "Quiz app" "$LOCAL_QUIZ_URL" 90
wait_for_url "Admin app" "$LOCAL_ADMIN_URL/signin" 90

cat <<MSG

Mini Quiz Phase 2 local stack is running.

Player app:
  $LOCAL_QUIZ_URL

Admin app:
  $LOCAL_ADMIN_URL/signin
  Login: $INITIAL_ADMIN_EMAIL / $INITIAL_ADMIN_PASSWORD

API:
  Browser/API URL: $LOCAL_API_URL
  REST web pod simulation: $LOCAL_API_WEB_URL
  Realtime gateway simulation: $LOCAL_REALTIME_URL

Local infra:
  Postgres: localhost:5432
  Redis:    localhost:6379
  NATS:     localhost:4222
  NATS UI:  http://localhost:8222

Logs:
  $LOG_DIR

Production-like routing:
  /rooms/{code}/events -> realtime gateway
  everything else      -> REST API

Press Ctrl-C here to stop Node processes. Docker services keep running.
MSG

tail -n +1 -f "$LOG_DIR"/*.log
