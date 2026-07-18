#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$BENCH_DIR/../.." && pwd)"

cd "$BENCH_DIR"

AKAN_APP_NAME="${BENCH_AKAN_APP:-minimal}"
AKAN_PUBLIC_REPO_NAME="${AKAN_PUBLIC_REPO_NAME:-Ieading-flight-guidance}"
AKAN_PUBLIC_SERVE_DOMAIN="${AKAN_PUBLIC_SERVE_DOMAIN:-akanjs.com}"
AKAN_PUBLIC_ENV="${AKAN_PUBLIC_ENV:-local}"
AKAN_PUBLIC_OPERATION_MODE="${AKAN_PUBLIC_OPERATION_MODE:-local}"
PORT_OFFSET="${PORT_OFFSET:-100}"
BENCH_AKAN_PORT="${BENCH_AKAN_PORT:-$((8283 + PORT_OFFSET))}"
RUN_ID="${RUN_ID:-$(date -u +%Y-%m-%dT%H-%M-%S-prod-compare)}"
DURATION="${DURATION:-30m}"
WARMUP="${WARMUP:-10s}"
VUS="${VUS:-50}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-5000}"
SOAK_WARMUP_WINDOW="${SOAK_WARMUP_WINDOW:-5m}"
COLDSTART_ITERATIONS="${COLDSTART_ITERATIONS:-10}"
COLDSTART_SETTLE="${COLDSTART_SETTLE:-60000}"
SUITE="${SUITE:-pure_http}"
SCENARIO="${SCENARIO:-pure_http_no_db}"
TARGETS="${TARGETS:-akan-built-single raw-bun-built elysia-built hono-built fastify-built raw-sqlite-built}"
SKIP_BUILD="${SKIP_BUILD:-0}"
DRY_RUN="${DRY_RUN:-0}"

export PORT_OFFSET
export BENCH_AKAN_PORT

run_cmd() {
  echo "+ $*"
  if [[ "$DRY_RUN" != "1" ]]; then
    "$@"
  fi
}

echo "Production comparison benchmark"
echo "  app:                 $AKAN_APP_NAME"
echo "  repo/domain/env:     $AKAN_PUBLIC_REPO_NAME / $AKAN_PUBLIC_SERVE_DOMAIN / $AKAN_PUBLIC_ENV"
echo "  akan port/offset:    $BENCH_AKAN_PORT / $PORT_OFFSET"
echo "  run id:              $RUN_ID"
echo "  targets:             $TARGETS"
echo "  suite/scenario:      $SUITE / $SCENARIO"
echo "  duration:            $DURATION"
echo "  warmup:              $WARMUP"
echo "  vus:                 $VUS"
echo "  sample interval ms:  $SAMPLE_INTERVAL"
echo "  soak warmup window:  $SOAK_WARMUP_WINDOW"
echo "  coldstart:           ${COLDSTART_ITERATIONS} iterations, settle ${COLDSTART_SETTLE}ms"
echo

if [[ "$SKIP_BUILD" != "1" ]]; then
  (
    cd "$REPO_ROOT"
    run_cmd env \
      AKAN_PUBLIC_APP_NAME="$AKAN_APP_NAME" \
      AKAN_PUBLIC_REPO_NAME="$AKAN_PUBLIC_REPO_NAME" \
      AKAN_PUBLIC_SERVE_DOMAIN="$AKAN_PUBLIC_SERVE_DOMAIN" \
      AKAN_PUBLIC_ENV="$AKAN_PUBLIC_ENV" \
      AKAN_PUBLIC_OPERATION_MODE="$AKAN_PUBLIC_OPERATION_MODE" \
      PORT_OFFSET="$PORT_OFFSET" \
      BENCH_AKAN_PORT="$BENCH_AKAN_PORT" \
      bun run akan build "$AKAN_APP_NAME"
  )
  run_cmd bun run build:competitors
else
  echo "Skipping build because SKIP_BUILD=1"
fi

for target in $TARGETS; do
  echo
  echo "=== coldstart: $target ==="
  run_cmd bun harness/coldstart.ts \
    --target "$target" \
    --iterations "$COLDSTART_ITERATIONS" \
    --settle "$COLDSTART_SETTLE" \
    --run-id "$RUN_ID"

  echo
  echo "=== soak: $target ==="
  run_cmd bun harness/run.ts \
    --target "$target" \
    --suite "$SUITE" \
    --scenario "$SCENARIO" \
    --vus "$VUS" \
    --duration "$DURATION" \
    --warmup "$WARMUP" \
    --soak \
    --sample-interval "$SAMPLE_INTERVAL" \
    --soak-warmup-window "$SOAK_WARMUP_WINDOW" \
    --run-id "$RUN_ID"
done

echo
run_cmd bun report/generate.ts "$RUN_ID"

echo
echo "Done."
echo "  results: $BENCH_DIR/results/$RUN_ID"
echo "  report:  $BENCH_DIR/results/$RUN_ID/report.md"
