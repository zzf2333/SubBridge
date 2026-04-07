/**
 * convert/outbounds.ts
 *
 * 协议转换层：将 Clash 原始代理数据转换为 sing-box outbound JSON。
 *
 * 两步流程：
 *   1. parseRawProxy(raw)   — Clash 原始对象 → SubBridgeNode
 *   2. nodeToOutbound(node) — SubBridgeNode → SingBoxOutbound
 *
 * 两步分离是为了让 group/countries.ts 能在步骤 1 之后、步骤 2 之前
 * 给节点打上 countryCode 标签。
 */

import type {
    SubBridgeNode,
    ShadowsocksNode,
    VMessNode,
    VLESSNode,
    TrojanNode,
    Hysteria2Node,
    HttpNode,
    NodeTls,
    NodeTransport,
    NodePlugin,
} from '@/core/types/node';
import type {
    SingBoxOutbound,
    SingBoxSSOutbound,
    SingBoxVMessOutbound,
    SingBoxVLESSOutbound,
    SingBoxTrojanOutbound,
    SingBoxHysteria2Outbound,
    SingBoxHTTPOutbound,
    SingBoxTLS,
    SingBoxTransport,
} from '@/core/types/singbox';

// ─── ParseResult ────────────────────────────────────────────────────────────

export type ParseResult =
    | { ok: true; node: SubBridgeNode }
    | { ok: false; reason: 'unsupported'; tag: string; type: string }
    | { ok: false; reason: 'missing-fields'; tag: string; fields: string[] };

// ─── parseRawProxy ───────────────────────────────────────────────────────────

export function parseRawProxy(raw: Record<string, unknown>): ParseResult {
    const tag = asString(raw['name']) || asString(raw['tag']) || '(unnamed)';
    const type = asString(raw['type']).toLowerCase();

    // 基础字段校验
    const missingFields: string[] = [];
    if (typeof raw['server'] !== 'string' || !raw['server']) {
        missingFields.push('server');
    }
    const portVal = asNumber(raw['port']);
    if (!Number.isInteger(portVal) || portVal < 1 || portVal > 65535) {
        missingFields.push('port');
    }
    if (missingFields.length > 0) {
        return { ok: false, reason: 'missing-fields', tag, fields: missingFields };
    }

    const server = asString(raw['server']);
    const serverPort = asNumber(raw['port']);

    const base = {
        tag,
        server,
        serverPort,
        ...(raw['udp'] !== undefined ? { udp: Boolean(raw['udp']) } : {}),
        raw,
    };

    switch (type) {
        case 'ss': {
            const method = asString(raw['cipher']);
            const password = asString(raw['password']);
            const missing: string[] = [];
            if (!method) missing.push('cipher');
            if (!password) missing.push('password');
            if (missing.length > 0) {
                return { ok: false, reason: 'missing-fields', tag, fields: missing };
            }
            const plugin = parsePlugin(raw);
            const node: ShadowsocksNode = {
                ...base,
                type: 'shadowsocks',
                method,
                password,
                ...(plugin ? { plugin } : {}),
            };
            return { ok: true, node };
        }

        case 'vmess': {
            const uuid = asString(raw['uuid']);
            if (!uuid) {
                return { ok: false, reason: 'missing-fields', tag, fields: ['uuid'] };
            }
            const alterId = asOptionalNumber(raw['alterId'] ?? raw['alter-id']);
            const security = asOptionalString(raw['cipher']);
            const packetEncoding = parsePacketEncoding(raw['packet-encoding']);
            const tls = parseTls(raw);
            const transport = parseTransport(raw);
            const node: VMessNode = {
                ...base,
                type: 'vmess',
                uuid,
                ...(alterId !== undefined ? { alterId } : {}),
                ...(security ? { security } : {}),
                ...(packetEncoding ? { packetEncoding } : {}),
                ...(tls ? { tls } : {}),
                ...(transport ? { transport } : {}),
            };
            return { ok: true, node };
        }

        case 'vless': {
            const uuid = asString(raw['uuid']);
            if (!uuid) {
                return { ok: false, reason: 'missing-fields', tag, fields: ['uuid'] };
            }
            const flow = asOptionalString(raw['flow']);
            const packetEncoding = asOptionalString(raw['packet-encoding']);
            const tls = parseTls(raw);
            const reality = parseReality(raw);
            const transport = parseTransport(raw);
            const node: VLESSNode = {
                ...base,
                type: 'vless',
                uuid,
                ...(flow ? { flow } : {}),
                ...(packetEncoding ? { packetEncoding } : {}),
                ...(tls ? { tls } : {}),
                ...(reality ? { reality } : {}),
                ...(transport ? { transport } : {}),
            };
            return { ok: true, node };
        }

        case 'trojan': {
            const password = asString(raw['password']);
            if (!password) {
                return { ok: false, reason: 'missing-fields', tag, fields: ['password'] };
            }
            const tls = parseTls(raw);
            const transport = parseTransport(raw);
            const node: TrojanNode = {
                ...base,
                type: 'trojan',
                password,
                ...(tls ? { tls } : {}),
                ...(transport ? { transport } : {}),
            };
            return { ok: true, node };
        }

        case 'hysteria2':
        case 'hy2': {
            const password = asString(raw['password']);
            if (!password) {
                return { ok: false, reason: 'missing-fields', tag, fields: ['password'] };
            }
            const obfs = parseHysteria2Obfs(raw);
            const bandwidth = parseHysteria2Bandwidth(raw);
            const tls = parseTls(raw);
            const node: Hysteria2Node = {
                ...base,
                type: 'hysteria2',
                password,
                ...(obfs ? { obfs } : {}),
                ...(bandwidth ? { bandwidth } : {}),
                ...(tls ? { tls } : {}),
            };
            return { ok: true, node };
        }

        case 'http':
        case 'https': {
            const username = asOptionalString(raw['username']);
            const password = asOptionalString(raw['password']);
            const path = asOptionalString(raw['path']);
            const headers = asOptionalStringRecord(raw['headers']);
            const tls = type === 'https' ? parseTls(raw, true) : parseTls(raw);
            const node: HttpNode = {
                ...base,
                type: 'http',
                ...(username ? { username } : {}),
                ...(password ? { password } : {}),
                ...(path ? { path } : {}),
                ...(headers ? { headers } : {}),
                ...(tls ? { tls } : {}),
            };
            return { ok: true, node };
        }

        default:
            return { ok: false, reason: 'unsupported', tag, type: type || 'unknown' };
    }
}

// ─── nodeToOutbound ──────────────────────────────────────────────────────────

export function nodeToOutbound(node: SubBridgeNode): SingBoxOutbound {
    switch (node.type) {
        case 'shadowsocks':
            return buildSSOutbound(node);
        case 'vmess':
            return buildVMessOutbound(node);
        case 'vless':
            return buildVLESSOutbound(node);
        case 'trojan':
            return buildTrojanOutbound(node);
        case 'hysteria2':
            return buildHy2Outbound(node);
        case 'http':
            return buildHttpOutbound(node);
    }
}

// ─── 各协议 outbound 构建 ─────────────────────────────────────────────────────

function buildSSOutbound(node: ShadowsocksNode): SingBoxSSOutbound {
    const pluginResult = node.plugin ? serializeShadowsocksPlugin(node.plugin) : null;
    return {
        type: 'shadowsocks',
        tag: node.tag,
        server: node.server,
        server_port: node.serverPort,
        method: node.method,
        password: node.password,
        ...(pluginResult ? { plugin: pluginResult.name, plugin_opts: pluginResult.options } : {}),
    };
}

function buildVMessOutbound(node: VMessNode): SingBoxVMessOutbound {
    const tls = buildTls(node.tls);
    const transport = buildTransport(node.transport);
    return {
        type: 'vmess',
        tag: node.tag,
        server: node.server,
        server_port: node.serverPort,
        uuid: node.uuid,
        ...(node.security ? { security: node.security } : {}),
        ...(node.alterId !== undefined ? { alter_id: node.alterId } : {}),
        ...(node.packetEncoding ? { packet_encoding: node.packetEncoding } : {}),
        ...(tls ? { tls } : {}),
        ...(transport ? { transport } : {}),
    };
}

function buildVLESSOutbound(node: VLESSNode): SingBoxVLESSOutbound {
    const tls = buildTls(node.tls, node.reality);
    const transport = buildTransport(node.transport);
    return {
        type: 'vless',
        tag: node.tag,
        server: node.server,
        server_port: node.serverPort,
        uuid: node.uuid,
        ...(node.flow ? { flow: node.flow } : {}),
        ...(node.packetEncoding ? { packet_encoding: node.packetEncoding } : {}),
        ...(tls ? { tls } : {}),
        ...(transport ? { transport } : {}),
    };
}

function buildTrojanOutbound(node: TrojanNode): SingBoxTrojanOutbound {
    const tls = buildTls(node.tls);
    const transport = buildTransport(node.transport);
    return {
        type: 'trojan',
        tag: node.tag,
        server: node.server,
        server_port: node.serverPort,
        password: node.password,
        ...(tls ? { tls } : {}),
        ...(transport ? { transport } : {}),
    };
}

function buildHy2Outbound(node: Hysteria2Node): SingBoxHysteria2Outbound {
    const tls = buildTls(node.tls);
    return {
        type: 'hysteria2',
        tag: node.tag,
        server: node.server,
        server_port: node.serverPort,
        password: node.password,
        ...(node.bandwidth?.upMbps !== undefined ? { up_mbps: node.bandwidth.upMbps } : {}),
        ...(node.bandwidth?.downMbps !== undefined ? { down_mbps: node.bandwidth.downMbps } : {}),
        ...(node.obfs
            ? { obfs: { type: node.obfs.type, password: node.obfs.password ?? '' } }
            : {}),
        ...(tls ? { tls } : {}),
    };
}

function buildHttpOutbound(node: HttpNode): SingBoxHTTPOutbound {
    const tls = buildTls(node.tls);
    return {
        type: 'http',
        tag: node.tag,
        server: node.server,
        server_port: node.serverPort,
        ...(node.username ? { username: node.username } : {}),
        ...(node.password ? { password: node.password } : {}),
        ...(node.path ? { path: node.path } : {}),
        ...(node.headers ? { headers: node.headers } : {}),
        ...(tls ? { tls } : {}),
    };
}

// ─── TLS 序列化 ───────────────────────────────────────────────────────────────

function buildTls(
    tls?: NodeTls,
    reality?: { publicKey: string; shortId?: string }
): SingBoxTLS | undefined {
    if (!tls?.enabled) return undefined;

    return {
        enabled: true,
        ...(tls.serverName ? { server_name: tls.serverName } : {}),
        ...(tls.insecure !== undefined ? { insecure: tls.insecure } : {}),
        ...(tls.alpn && tls.alpn.length > 0 ? { alpn: tls.alpn } : {}),
        ...(tls.clientFingerprint
            ? { utls: { enabled: true, fingerprint: tls.clientFingerprint } }
            : {}),
        ...(reality
            ? {
                  reality: {
                      enabled: true,
                      public_key: reality.publicKey,
                      ...(reality.shortId ? { short_id: reality.shortId } : {}),
                  },
              }
            : {}),
    };
}

// ─── Transport 序列化 ─────────────────────────────────────────────────────────

function buildTransport(transport?: NodeTransport): SingBoxTransport | undefined {
    if (!transport) return undefined;

    switch (transport.type) {
        case 'ws':
            return {
                type: 'ws',
                ...(transport.path ? { path: transport.path } : {}),
                ...(transport.headers ? { headers: transport.headers } : {}),
                ...(transport.maxEarlyData !== undefined
                    ? { max_early_data: transport.maxEarlyData }
                    : {}),
                ...(transport.earlyDataHeaderName
                    ? { early_data_header_name: transport.earlyDataHeaderName }
                    : {}),
            };
        case 'grpc':
            return {
                type: 'grpc',
                ...(transport.serviceName ? { service_name: transport.serviceName } : {}),
            };
        case 'http':
            return {
                type: 'http',
                ...(transport.host ? { host: transport.host } : {}),
                ...(transport.path ? { path: transport.path } : {}),
                ...(transport.method ? { method: transport.method } : {}),
                ...(transport.headers ? { headers: transport.headers } : {}),
            };
        case 'h2':
            return {
                type: 'http',
                ...(transport.host ? { host: transport.host } : {}),
                ...(transport.path ? { path: transport.path } : {}),
            };
    }
}

// ─── Shadowsocks 插件序列化 ───────────────────────────────────────────────────

function serializeShadowsocksPlugin(plugin: NodePlugin): { name: string; options: string } | null {
    if (plugin.type === 'obfs') {
        const mode = asString(plugin.options['mode']);
        const host = asString(plugin.options['host']);
        const parts: string[] = [];
        if (mode) parts.push(`obfs=${mode}`);
        if (host) parts.push(`obfs-host=${host}`);
        return parts.length > 0 ? { name: 'obfs-local', options: parts.join(';') } : null;
    }

    if (plugin.type === 'v2ray-plugin') {
        const mode = asString(plugin.options['mode']);
        const host = asString(plugin.options['host']);
        const path = asString(plugin.options['path']);
        const tls = asOptionalBoolean(plugin.options['tls']);
        const mux = asOptionalBoolean(plugin.options['mux']);
        const parts: string[] = [];
        if (mode) parts.push(`mode=${mode}`);
        if (host) parts.push(`host=${host}`);
        if (path) parts.push(`path=${path}`);
        if (tls !== undefined) parts.push(`tls=${tls ? 'true' : 'false'}`);
        if (mux !== undefined) parts.push(`mux=${mux ? 'true' : 'false'}`);
        return parts.length > 0 ? { name: 'v2ray-plugin', options: parts.join(';') } : null;
    }

    return null;
}

// ─── 字段解析辅助 ─────────────────────────────────────────────────────────────

function parseTls(raw: Record<string, unknown>, forceEnabled = false): NodeTls | undefined {
    const tlsEnabled =
        forceEnabled || raw['tls'] === true || raw['tls'] === 'true' || raw['tls'] === 1;
    if (!tlsEnabled) return undefined;

    const insecure = raw['skip-cert-verify'];
    const sni = asOptionalString(raw['sni']);
    const alpn = parseAlpn(raw['alpn']);
    const fingerprint =
        asOptionalString(raw['client-fingerprint']) ?? asOptionalString(raw['fingerprint']);

    return {
        enabled: true,
        ...(insecure !== undefined ? { insecure: Boolean(insecure) } : {}),
        ...(sni ? { serverName: sni } : {}),
        ...(alpn ? { alpn } : {}),
        ...(fingerprint ? { clientFingerprint: fingerprint } : {}),
    };
}

function parseAlpn(value: unknown): string[] | undefined {
    if (Array.isArray(value)) {
        return value.filter((v) => typeof v === 'string') as string[];
    }
    if (typeof value === 'string' && value.trim() !== '') {
        return [value];
    }
    return undefined;
}

function parseTransport(raw: Record<string, unknown>): NodeTransport | undefined {
    const network = asString(raw['network']).toLowerCase();

    switch (network) {
        case 'ws': {
            const opts = asRecord(raw['ws-opts']);
            return {
                type: 'ws',
                ...(asOptionalString(opts?.['path']) ? { path: asString(opts!['path']) } : {}),
                ...(asRecord(opts?.['headers'])
                    ? { headers: asStringRecord(opts!['headers']) }
                    : {}),
                ...(asOptionalNumber(opts?.['max-early-data']) !== undefined
                    ? { maxEarlyData: asNumber(opts!['max-early-data']) }
                    : {}),
                ...(asOptionalString(opts?.['early-data-header-name'])
                    ? { earlyDataHeaderName: asString(opts!['early-data-header-name']) }
                    : {}),
            };
        }
        case 'grpc': {
            const opts = asRecord(raw['grpc-opts']);
            return {
                type: 'grpc',
                ...(asOptionalString(opts?.['grpc-service-name'])
                    ? { serviceName: asString(opts!['grpc-service-name']) }
                    : {}),
            };
        }
        case 'http': {
            const opts = asRecord(raw['http-opts']);
            return {
                type: 'http',
                ...(asOptionalString(opts?.['method'])
                    ? { method: asString(opts!['method']) }
                    : {}),
                ...(asOptionalString(opts?.['path']) ? { path: asString(opts!['path']) } : {}),
                ...(asRecord(opts?.['headers'])
                    ? { headers: asStringRecord(opts!['headers']) }
                    : {}),
            };
        }
        case 'h2': {
            const opts = asRecord(raw['h2-opts']);
            return {
                type: 'h2',
                ...(asOptionalString(opts?.['path']) ? { path: asString(opts!['path']) } : {}),
                ...(opts?.['host'] !== undefined ? { host: parseHostField(opts!['host']) } : {}),
            };
        }
        default:
            return undefined;
    }
}

function parseReality(
    raw: Record<string, unknown>
): { publicKey: string; shortId?: string } | undefined {
    const opts = asRecord(raw['reality-opts']);
    if (!opts) return undefined;
    const publicKey = asOptionalString(opts['public-key']);
    if (!publicKey) return undefined;
    const shortId = asOptionalString(opts['short-id']);
    return {
        publicKey,
        ...(shortId ? { shortId } : {}),
    };
}

function parsePlugin(raw: Record<string, unknown>): NodePlugin | undefined {
    // 优先检查 plugin 字段（obfs-local / v2ray-plugin 格式）
    const pluginName = asOptionalString(raw['plugin']);
    const pluginOpts = asRecord(raw['plugin-opts']) ?? asRecord(raw['obfs-opts']);

    if (pluginName === 'obfs-local' || pluginName === 'obfs') {
        return {
            type: 'obfs',
            options: {
                mode: asOptionalString(pluginOpts?.['mode']) ?? '',
                host: asOptionalString(pluginOpts?.['obfs-host'] ?? pluginOpts?.['host']) ?? '',
            },
        };
    }

    if (pluginName === 'v2ray-plugin') {
        return {
            type: 'v2ray-plugin',
            options: {
                mode: asOptionalString(pluginOpts?.['mode']) ?? '',
                host: asOptionalString(pluginOpts?.['host']) ?? '',
                path: asOptionalString(pluginOpts?.['path']) ?? '',
                tls: pluginOpts?.['tls'],
                mux: pluginOpts?.['mux'],
            },
        };
    }

    // 旧式 obfs 字段（某些 Clash 订阅用 obfs/obfs-host 直接写在代理节点上）
    const obfs = asOptionalString(raw['obfs']);
    if (obfs) {
        return {
            type: 'obfs',
            options: {
                mode: obfs,
                host: asOptionalString(raw['obfs-host']) ?? '',
            },
        };
    }

    return undefined;
}

function parsePacketEncoding(value: unknown): 'xudp' | 'packetaddr' | undefined {
    if (value === 'xudp' || value === 'packetaddr') return value;
    return undefined;
}

function parseHysteria2Obfs(
    raw: Record<string, unknown>
): { type: string; password?: string } | undefined {
    const obfsType = asOptionalString(raw['obfs']);
    if (!obfsType) return undefined;
    return {
        type: obfsType,
        ...(raw['obfs-password'] !== undefined
            ? { password: asString(raw['obfs-password']) }
            : {}),
    };
}

function parseHysteria2Bandwidth(
    raw: Record<string, unknown>
): { upMbps?: number; downMbps?: number } | undefined {
    const up = parseBandwidthMbps(raw['up']);
    const down = parseBandwidthMbps(raw['down']);
    if (up === undefined && down === undefined) return undefined;
    return {
        ...(up !== undefined ? { upMbps: up } : {}),
        ...(down !== undefined ? { downMbps: down } : {}),
    };
}

/**
 * 解析带宽字符串（如 "20 Mbps"、"100mbps"、"1 Gbps"）为 Mbps 数值。
 * 纯数字时直接视为 Mbps。
 */
function parseBandwidthMbps(value: unknown): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const str = value.trim();
        const numericOnly = parseFloat(str);
        if (isNaN(numericOnly)) return undefined;

        const unit = str.replace(/[\d.\s]/g, '').toLowerCase();
        switch (unit) {
            case 'gbps':
                return numericOnly * 1000;
            case 'kbps':
                return numericOnly / 1000;
            case 'mbps':
            case '':
                return numericOnly;
            default:
                return numericOnly;
        }
    }
    return undefined;
}

// ─── 基础类型工具 ─────────────────────────────────────────────────────────────

function asString(value: unknown): string {
    return typeof value === 'string' ? value : String(value ?? '');
}

function asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value !== '' ? value : undefined;
}

function asNumber(value: unknown): number {
    return typeof value === 'number' ? value : Number(value);
}

function asOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const n = Number(value);
        return isNaN(n) ? undefined : n;
    }
    return undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function asStringRecord(value: unknown): Record<string, string> {
    const obj = asRecord(value);
    if (!obj) return {};
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') result[k] = v;
    }
    return result;
}

function asOptionalStringRecord(
    value: unknown
): Record<string, string | string[]> | undefined {
    const obj = asRecord(value);
    if (!obj) return undefined;
    const result: Record<string, string | string[]> = {};
    let hasEntry = false;
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') {
            result[k] = v;
            hasEntry = true;
        } else if (Array.isArray(v)) {
            result[k] = v.filter((x) => typeof x === 'string') as string[];
            hasEntry = true;
        }
    }
    return hasEntry ? result : undefined;
}

function parseHostField(value: unknown): string | string[] {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.filter((v) => typeof v === 'string') as string[];
    return String(value ?? '');
}
