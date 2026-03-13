#!/bin/bash
# Proxy connectivity smoke test for generated sing-box config.
# Verifies that the config can proxy key endpoints (including YouTube).

set -euo pipefail

CONFIG_PATH="singbox.json"
PROXY_URL="http://127.0.0.1:7893"
SING_BOX_BIN="sing-box"
KEEP_TUN=0
KEEP_TMP=0
PROBE_204_URL="https://www.gstatic.com/generate_204"
PROBE_PAGE_URL="https://www.youtube.com/"
PROBE_IP_URL="https://api.ipify.org"

TMP_DIR="$(mktemp -d)"
TEST_CONFIG="$TMP_DIR/test-config.json"
LOG_FILE="$TMP_DIR/sing-box.log"
SB_PID=""
TEST_PASSED=0

usage() {
    cat <<'EOF'
Usage: ./scripts/proxy-smoke.sh [options]

Options:
  -c, --config <path>      sing-box JSON config path (default: singbox.json)
  -p, --proxy <url>        local proxy url for curl (default: http://127.0.0.1:7893)
  -b, --bin <path>         sing-box binary (default: sing-box)
      --keep-tun           keep tun inbound in test config (default: remove tun for non-root tests)
      --keep-tmp           keep temp files and sing-box log
      --probe-204-url <u>  override the 204 probe URL
      --probe-page-url <u> override the page probe URL
      --probe-ip-url <u>   override the egress IP probe URL
  -h, --help               show help
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -c|--config)
            CONFIG_PATH="$2"
            shift 2
            ;;
        -p|--proxy)
            PROXY_URL="$2"
            shift 2
            ;;
        -b|--bin)
            SING_BOX_BIN="$2"
            shift 2
            ;;
        --keep-tun)
            KEEP_TUN=1
            shift
            ;;
        --keep-tmp)
            KEEP_TMP=1
            shift
            ;;
        --probe-204-url)
            PROBE_204_URL="$2"
            shift 2
            ;;
        --probe-page-url)
            PROBE_PAGE_URL="$2"
            shift 2
            ;;
        --probe-ip-url)
            PROBE_IP_URL="$2"
            shift 2
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

cleanup() {
    if [[ -n "$SB_PID" ]]; then
        kill "$SB_PID" >/dev/null 2>&1 || true
        wait "$SB_PID" >/dev/null 2>&1 || true
    fi
    if [[ "$TEST_PASSED" -eq 1 && "$KEEP_TMP" -eq 0 ]]; then
        rm -rf "$TMP_DIR"
    else
        echo "Temp files kept at: $TMP_DIR"
        echo "sing-box log: $LOG_FILE"
    fi
}
trap cleanup EXIT

if [[ ! -f "$CONFIG_PATH" ]]; then
    echo "Config not found: $CONFIG_PATH" >&2
    exit 1
fi

if [[ "$KEEP_TUN" -eq 1 ]]; then
    cp "$CONFIG_PATH" "$TEST_CONFIG"
else
    node - <<'NODE' "$CONFIG_PATH" "$TEST_CONFIG" "$PROXY_URL"
const fs = require('fs');
const inputPath = process.argv[2];
const outputPath = process.argv[3];
const proxyUrl = process.argv[4];
const config = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const parsedProxyUrl = new URL(proxyUrl);
const proxyHost = parsedProxyUrl.hostname || '127.0.0.1';
const proxyPort = Number(parsedProxyUrl.port || (parsedProxyUrl.protocol === 'https:' ? '443' : '80'));

config.inbounds = (config.inbounds || []).filter((inbound) => inbound.type !== 'tun');
if (!Array.isArray(config.inbounds)) {
  config.inbounds = [];
}

let mixedInbound = config.inbounds.find((inbound) => inbound.type === 'mixed');
if (!mixedInbound) {
  mixedInbound = {
    type: 'mixed',
    tag: 'mixed-in',
  };
  config.inbounds.unshift(mixedInbound);
}

mixedInbound.listen = proxyHost;
mixedInbound.listen_port = proxyPort;
mixedInbound.set_system_proxy = false;

if (config.experimental && config.experimental.clash_api) {
  delete config.experimental.clash_api;
}

fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
NODE
fi

"$SING_BOX_BIN" run -c "$TEST_CONFIG" >"$LOG_FILE" 2>&1 &
SB_PID=$!

sleep 1
if ! kill -0 "$SB_PID" >/dev/null 2>&1; then
    echo "sing-box failed to start." >&2
    tail -n 80 "$LOG_FILE" >&2 || true
    exit 1
fi

check_http_code() {
    local name="$1"
    local url="$2"
    local expected="$3"
    local code

    code="$(curl -sS -m 25 --proxy "$PROXY_URL" -o /dev/null -w '%{http_code}' "$url" || true)"
    echo "$name -> $code"

    case "$expected" in
        204)
            [[ "$code" == "204" ]]
            ;;
        2xx_or_3xx)
            [[ "$code" =~ ^2|^3 ]]
            ;;
        *)
            [[ "$code" == "$expected" ]]
            ;;
    esac
}

echo "Proxy smoke test"
echo "  config: $CONFIG_PATH"
echo "  proxy : $PROXY_URL"

if ! check_http_code "gstatic generate_204" "$PROBE_204_URL" "204"; then
    echo "gstatic probe failed." >&2
    exit 1
fi

if ! check_http_code "youtube homepage" "$PROBE_PAGE_URL" "2xx_or_3xx"; then
    echo "YouTube probe failed." >&2
    exit 1
fi

IP_RESULT="$(curl -sS -m 15 --proxy "$PROXY_URL" "$PROBE_IP_URL" || true)"
if [[ -z "$IP_RESULT" ]]; then
    echo "Failed to fetch egress IP via proxy." >&2
    exit 1
fi
echo "egress ip -> $IP_RESULT"

if grep -q "route(YouTube)" "$LOG_FILE"; then
    echo "route log  -> matched YouTube route"
else
    echo "route log  -> YouTube route match not observed in log"
fi

TEST_PASSED=1
echo "Proxy smoke test passed."
