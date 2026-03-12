# SubBridge

A configuration migrator for Clash / Clash.Meta.
Outputs runnable sing-box configs with explainable migration reports.

## V1 Scope

- First release — only the current approach is maintained
- No backward compatibility with previous schemes
- No guarantee of older sing-box version support

## Core Principles

1. Runnable output first
2. Graceful degradation by default
3. Every migration decision must be explainable

## Features

- CLI and Web API
- Proxy protocols: `ss / vmess / trojan / vless / hysteria2 / http`
- Full migration pipeline: groups, rules, DNS, TUN
- Provider prefetch & expansion:
  - `proxy-provider` cache expanded into real proxy nodes
  - `rule-provider` cache expanded into inline rule_set
- Structured reports: `issues / decisions / repairs / behaviorChanges / reportDisplay`
- Web URL safety: protocol restriction, localhost/private-IP blocking, DNS-rebind guard, redirect-chain validation

## Quick Start

### Requirements

- Bun `1.3.5+`

### Install

```bash
git clone https://github.com/zzf2333/SubBridge.git
cd SubBridge
bun install
bun run build
```

### CLI

```bash
# Local file
subbridge convert -i clash.yaml -o singbox.json

# Remote subscription
subbridge convert -u https://example.com/clash -o singbox.json

# Export report
subbridge convert -i clash.yaml -o singbox.json -r report.json --report-display report-display.json

# Provider prefetch control
subbridge convert -i clash.yaml -o singbox.json --provider-fetch-scope all --provider-fetch-timeout 4000

# Disable provider prefetch
subbridge convert -i clash.yaml -o singbox.json --no-provider-fetch
```

### Web

```bash
# Development
bun run dev

# Production
bun run start
```

API:

- `POST /api/convert`
- `GET /api/subscribe?url=<clash-url>`

## Development

```bash
bun run lint
bun run test
bun run build
bun run smoke
bun run proxy:smoke
bun run release:check
```

## Proxy Connectivity Check

After generating `singbox.json`:

```bash
bun run proxy:smoke
```

Options:

```bash
./scripts/proxy-smoke.sh -c /path/to/singbox.json -p http://127.0.0.1:7893
```

## License

MIT
