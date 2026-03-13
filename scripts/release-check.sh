#!/bin/bash
# Release readiness check for SubBridge

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NPM_CACHE_DIR="${NPM_CONFIG_CACHE:-/tmp/.npm-cache}"

echo "SubBridge release check"
echo "Working directory: $ROOT_DIR"
echo "NPM cache: $NPM_CACHE_DIR"
echo "----------------------------------------"

cd "$ROOT_DIR"

echo "1) lint"
bun run lint

echo "2) test"
bun run test

echo "3) build"
bun run build

echo "4) release notes"
bun run release:notes >/dev/null

echo "5) verify representative Clash fixtures"
bun run verify:fixtures

echo "6) smoke (require web)"
REQUIRE_WEB_SMOKE="${REQUIRE_WEB_SMOKE:-1}" bun run smoke

echo "7) pack dry-run"
npm_config_cache="$NPM_CACHE_DIR" npm pack --dry-run

echo "----------------------------------------"
echo "Release check passed."
