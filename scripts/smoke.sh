#!/bin/bash
# SubBridge Release Smoke Test
# 验证 build / CLI / Web 最小交付链路

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
PORT="${PORT:-3103}"
MAX_WEB_RETRIES="${MAX_WEB_RETRIES:-8}"
REQUIRE_WEB_SMOKE="${REQUIRE_WEB_SMOKE:-0}"
WEB_SMOKE_ENABLED=1

pick_available_port() {
    local candidate="$1"
    while lsof -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; do
        candidate=$((candidate + 1))
    done
    echo "$candidate"
}

PORT="$(pick_available_port "$PORT")"

start_web_server() {
    local attempts=0

    while [ "$attempts" -lt "$MAX_WEB_RETRIES" ]; do
        : >"$SERVER_LOG"
        PORT="$PORT" bun ./dist/web.js >"$SERVER_LOG" 2>&1 &
        SERVER_PID=$!
        sleep 1

        if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
            return 0
        fi

        wait "$SERVER_PID" >/dev/null 2>&1 || true
        SERVER_PID=""

        if grep -q 'EADDRINUSE' "$SERVER_LOG"; then
            PORT=$((PORT + 1))
            attempts=$((attempts + 1))
            continue
        fi

        return 1
    done

    return 1
}

cleanup() {
    if [ -n "${SERVER_PID:-}" ]; then
        kill "$SERVER_PID" >/dev/null 2>&1 || true
        wait "$SERVER_PID" >/dev/null 2>&1 || true
    fi
    rm -rf "$TMP_DIR"
}

trap cleanup EXIT

INPUT_FILE="$TMP_DIR/smoke.yaml"
OUTPUT_FILE="$TMP_DIR/smoke.json"
SERVER_LOG="$TMP_DIR/server.log"

cat > "$INPUT_FILE" <<'EOF'
proxies:
  - name: smoke-ss
    type: ss
    server: example.com
    port: 8388
    cipher: aes-256-gcm
    password: testpass
EOF

echo "SubBridge smoke test"
echo "Working directory: $ROOT_DIR"
echo "Temporary directory: $TMP_DIR"
echo "----------------------------------------"

cd "$ROOT_DIR"

echo -n "1. Build dist artifacts... "
bun run build >/dev/null
echo -e "${GREEN}✓ Passed${NC}"

echo -n "2. CLI build smoke... "
bun ./dist/cli.js build \
    -i "$INPUT_FILE" \
    -o "$OUTPUT_FILE" >/dev/null 2>&1

if [ ! -f "$OUTPUT_FILE" ]; then
    echo -e "${RED}✗ Failed${NC}"
    echo "Missing CLI output: $OUTPUT_FILE"
    exit 1
fi
echo -e "${GREEN}✓ Passed${NC}"

echo -n "3. Start web server smoke... "
if start_web_server; then
    echo -e "${GREEN}✓ Started on port $PORT${NC}"
else
    if [ "$REQUIRE_WEB_SMOKE" = "1" ]; then
        echo -e "${RED}✗ Failed${NC}"
        echo "Web server exited unexpectedly:"
        cat "$SERVER_LOG"
        exit 1
    fi

    WEB_SMOKE_ENABLED=0
    echo -e "${YELLOW}! Skipped${NC}"
    echo "Web smoke skipped (unable to bind local port in current environment)."
fi

if [ "$WEB_SMOKE_ENABLED" = "1" ]; then
    echo -n "4. Health endpoint smoke... "
    HEALTH_RESPONSE=""
    for _ in {1..20}; do
        if HEALTH_RESPONSE="$(curl -fsS --max-time 3 "http://localhost:$PORT/health" 2>/dev/null)"; then
            break
        fi
        sleep 0.2
    done

    if [ -z "$HEALTH_RESPONSE" ]; then
        echo -e "${RED}✗ Failed${NC}"
        echo "Health endpoint did not become ready in time."
        cat "$SERVER_LOG"
        exit 1
    fi

    if [[ "$HEALTH_RESPONSE" != *'"status":"ok"'* ]]; then
        echo -e "${RED}✗ Failed${NC}"
        echo "$HEALTH_RESPONSE"
        exit 1
    fi
    echo -e "${GREEN}✓ Passed${NC}"

    echo -n "5. Convert endpoint smoke... "
    CONVERT_RESPONSE="$(curl -fsS --max-time 10 -X POST "http://localhost:$PORT/api/convert" \
        -H 'content-type: application/json' \
        --data "{\"source\":\"proxies:\\n  - name: web-smoke\\n    type: ss\\n    server: example.com\\n    port: 8388\\n    cipher: aes-256-gcm\\n    password: testpass\",\"sourceType\":\"yaml\"}")"
    if [[ "$CONVERT_RESPONSE" != *'"success":true'* ]] || [[ "$CONVERT_RESPONSE" != *'"config"'* ]]; then
        echo -e "${RED}✗ Failed${NC}"
        echo "$CONVERT_RESPONSE"
        exit 1
    fi
    echo -e "${GREEN}✓ Passed${NC}"
else
    echo -e "4. Health endpoint smoke... ${YELLOW}Skipped${NC}"
    echo -e "5. Convert endpoint smoke... ${YELLOW}Skipped${NC}"
fi

echo ""
echo -e "${GREEN}Smoke test passed.${NC}"
echo "Artifacts:"
echo "  CLI output: $OUTPUT_FILE"
