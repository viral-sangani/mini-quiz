#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOCAL_API_URL="http://localhost:4000"
LOCAL_QUIZ_URL="http://localhost:3000"
LOCAL_ADMIN_URL="http://localhost:3001"
LOG_DIR="${TMPDIR:-/tmp}/mini-quiz-dev-ngrok-$$"
mkdir -p "$LOG_DIR"

PIDS=()

cleanup() {
  echo
  echo "Stopping Mini Quiz dev servers..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT INT TERM

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    echo "Install it, then run this script again."
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
    if curl -fsS -H "ngrok-skip-browser-warning: 1" "$url" >/dev/null 2>&1; then
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

ngrok_url_for_port() {
  local port="$1"
  local tunnels_json="$2"
  NGROK_TUNNELS_JSON="$tunnels_json" PORT="$port" node <<'NODE'
const data = JSON.parse(process.env.NGROK_TUNNELS_JSON || "{}");
const port = process.env.PORT;
const tunnels = Array.isArray(data.tunnels) ? data.tunnels : [];
const match = tunnels.find((t) => {
  const publicUrl = String(t.public_url || "");
  const addr = String(t.config?.addr || "");
  return publicUrl.startsWith("https://") && (
    addr === `http://localhost:${port}` ||
    addr === `https://localhost:${port}` ||
    addr === `localhost:${port}` ||
    addr === `http://127.0.0.1:${port}` ||
    addr === `https://127.0.0.1:${port}` ||
    addr === `127.0.0.1:${port}` ||
    addr.endsWith(`:${port}`)
  );
});
if (!match) process.exit(1);
process.stdout.write(match.public_url);
NODE
}

discover_ngrok_url_for_port() {
  local port="$1"
  local api_urls=()

  if [ -n "${NGROK_API_URL:-}" ]; then
    api_urls+=("$NGROK_API_URL")
  else
    for api_port in 4040 4041 4042 4043 4044 4045; do
      api_urls+=("http://127.0.0.1:$api_port/api/tunnels")
    done
  fi

  local api_url tunnels_json found_url
  for api_url in "${api_urls[@]}"; do
    if tunnels_json="$(curl -fsS "$api_url" 2>/dev/null)"; then
      if found_url="$(ngrok_url_for_port "$port" "$tunnels_json")"; then
        echo "$found_url"
        return 0
      fi
    fi
  done
  return 1
}

echo "Mini Quiz local + ngrok dev"
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

echo "Checking optional ngrok tunnels on local APIs 4040-4045..."
if PUBLIC_QUIZ_URL="$(discover_ngrok_url_for_port 3000)"; then
  echo "Found quiz ngrok tunnel: $PUBLIC_QUIZ_URL"
else
  PUBLIC_QUIZ_URL="$LOCAL_QUIZ_URL"
  echo "No ngrok tunnel found for localhost:3000; using local quiz URL."
fi

if PUBLIC_API_URL="$(discover_ngrok_url_for_port 4000)"; then
  echo "Found API ngrok tunnel: $PUBLIC_API_URL"
else
  PUBLIC_API_URL="$LOCAL_API_URL"
  echo "No ngrok tunnel found for localhost:4000; using local API URL."
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://miniquiz:miniquiz@localhost:5432/miniquiz?schema=public}"
export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-local-dev-secret-change-me-please-32}"
export INITIAL_ADMIN_EMAIL="${INITIAL_ADMIN_EMAIL:-you@example.com}"
if [ -z "${INITIAL_ADMIN_PASSWORD:-}" ] || [[ "${INITIAL_ADMIN_PASSWORD:-}" == replace-* ]]; then
  export INITIAL_ADMIN_PASSWORD="LocalAdmin123"
fi
export NEXTAUTH_URL="$LOCAL_ADMIN_URL"
export NEXT_PUBLIC_API_BASE_URL="$PUBLIC_API_URL"
export NEXT_PUBLIC_QUIZ_BASE_URL="$PUBLIC_QUIZ_URL"
export CORS_ORIGIN="$PUBLIC_QUIZ_URL,$PUBLIC_API_URL,$LOCAL_QUIZ_URL,$LOCAL_ADMIN_URL"
export PORT="${PORT:-4000}"
export LOG_LEVEL="${LOG_LEVEL:-info}"

# Public dev key used only so treasury address derivation works locally. It has
# no funds and must never be used for production.
if [ -z "${TREASURY_PRIVATE_KEY:-}" ]; then
  export TREASURY_PRIVATE_KEY="0x59c6995e998f97a5a0044966f0945387d5c18e8822e6f07445d0e13e8e3b23d"
fi

echo "Starting Postgres..."
docker compose up -d postgres
wait_for_postgres

echo "Building shared package..."
pnpm --filter @mini-quiz/shared build

echo "Applying Prisma migrations..."
pnpm --filter @mini-quiz/api prisma migrate deploy
pnpm --filter @mini-quiz/api prisma generate

echo "Seeding local admin if needed..."
pnpm --filter @mini-quiz/api seed-admin

echo "Starting dev servers..."
pnpm --filter @mini-quiz/api dev >"$LOG_DIR/api.log" 2>&1 &
PIDS+=("$!")
pnpm --filter @mini-quiz/quiz dev >"$LOG_DIR/quiz.log" 2>&1 &
PIDS+=("$!")
pnpm --filter @mini-quiz/admin dev >"$LOG_DIR/admin.log" 2>&1 &
PIDS+=("$!")

wait_for_url "API" "$LOCAL_API_URL/health" 90
wait_for_url "Quiz app" "$LOCAL_QUIZ_URL" 90
wait_for_url "Admin app" "$LOCAL_ADMIN_URL/signin" 90
if [[ "$PUBLIC_API_URL" != "$LOCAL_API_URL" ]]; then
  wait_for_url "public API tunnel" "$PUBLIC_API_URL/health" 30
fi
if [[ "$PUBLIC_QUIZ_URL" != "$LOCAL_QUIZ_URL" ]]; then
  wait_for_url "public quiz tunnel" "$PUBLIC_QUIZ_URL" 30
fi

cat <<MSG

Mini Quiz is running.

Player app:
  Local:  $LOCAL_QUIZ_URL
  Public: $PUBLIC_QUIZ_URL

Admin app:
  Local:  $LOCAL_ADMIN_URL
  Login:  $INITIAL_ADMIN_EMAIL / $INITIAL_ADMIN_PASSWORD

API:
  Local:  $LOCAL_API_URL/health
  Public: $PUBLIC_API_URL/health

Environment used by dev servers:
  NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
  NEXT_PUBLIC_QUIZ_BASE_URL=$NEXT_PUBLIC_QUIZ_BASE_URL
  CORS_ORIGIN=$CORS_ORIGIN

Logs are in:
  $LOG_DIR

Press Ctrl-C here to stop the dev servers. Postgres and ngrok keep running.
MSG

tail -n +1 -f "$LOG_DIR/api.log" "$LOG_DIR/quiz.log" "$LOG_DIR/admin.log"
