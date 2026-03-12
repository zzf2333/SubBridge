import { MigrationErrorCode, type MigrationIssue } from '../types/migration';
import type {
    NormalizedHttpProxy,
    NormalizedHysteria2Proxy,
    NormalizedPlugin,
    NormalizedProxy,
    NormalizedShadowsocksProxy,
    NormalizedTls,
    NormalizedTrojanProxy,
    NormalizedTransport,
    NormalizedUnknownProxy,
    NormalizedVlessProxy,
    NormalizedVMessProxy,
} from '../types/normalized-clash';
import type { RawProxy } from '../types/raw-clash';

export function normalizeProxies(rawProxies: RawProxy[] = []): {
    proxies: NormalizedProxy[];
    issues: MigrationIssue[];
} {
    const proxies: NormalizedProxy[] = [];
    const issues: MigrationIssue[] = [];

    rawProxies.forEach((proxy, index) => {
        const sourcePath = `proxies[${index}]`;
        const normalized = normalizeProxy(proxy, sourcePath, issues);
        proxies.push(normalized);
    });

    return { proxies, issues };
}

function normalizeProxy(
    raw: RawProxy,
    sourcePath: string,
    issues: MigrationIssue[]
): NormalizedProxy {
    const name =
        typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : `proxy-${sourcePath}`;
    const type = typeof raw.type === 'string' ? raw.type : 'unknown';
    const id = crypto.randomUUID();
    const stableKey = generateStableKey('proxy', sourcePath, name);
    const server = typeof raw.server === 'string' ? raw.server : '';
    const port = typeof raw.port === 'number' ? raw.port : 0;
    const udp = asBoolean(raw.udp);
    const tls = normalizeTls(raw);
    const transport = normalizeTransport(raw);
    const plugin = normalizePlugin(raw);
    const features = collectFeatures(raw, tls, transport, plugin, udp);

    if (!server || !port) {
        issues.push({
            id: crypto.randomUUID(),
            level: 'warning',
            code: MigrationErrorCode.MISSING_REQUIRED_FIELD,
            module: 'proxy',
            sourcePath,
            objectId: id,
            objectStableKey: stableKey,
            objectName: name,
            message: 'Proxy is missing required server or port fields',
            impact: 'This proxy will likely be dropped or degraded in planning',
        });
    }

    switch (type) {
        case 'ss':
            return {
                id,
                stableKey,
                name,
                type: 'ss',
                server,
                port,
                udp,
                sourcePath,
                raw,
                tls,
                transport,
                plugin,
                features,
                method: asString(raw.cipher),
                password: asString(raw.password),
            } as NormalizedShadowsocksProxy;
        case 'vmess':
            return {
                id,
                stableKey,
                name,
                type: 'vmess',
                server,
                port,
                udp,
                sourcePath,
                raw,
                tls,
                transport,
                plugin,
                features,
                uuid: asString(raw.uuid),
                alterId: asNumber(raw.alterId),
                security: asString(raw.cipher),
                packetEncoding: normalizePacketEncoding(raw),
            } as NormalizedVMessProxy;
        case 'trojan':
            return {
                id,
                stableKey,
                name,
                type: 'trojan',
                server,
                port,
                udp,
                sourcePath,
                raw,
                tls: tls ?? { enabled: true, serverName: server || undefined },
                transport,
                plugin,
                features,
                password: asString(raw.password),
            } as NormalizedTrojanProxy;
        case 'vless':
            return {
                id,
                stableKey,
                name,
                type: 'vless',
                server,
                port,
                udp,
                sourcePath,
                raw,
                tls,
                transport,
                plugin,
                features,
                uuid: asString(raw.uuid),
                flow: asString(raw.flow),
                packetEncoding: asString(raw['packet-encoding']),
                reality: normalizeReality(raw),
            } as NormalizedVlessProxy;
        case 'hysteria2':
            return {
                id,
                stableKey,
                name,
                type: 'hysteria2',
                server,
                port,
                udp,
                sourcePath,
                raw,
                tls: tls ?? { enabled: true, serverName: asString(raw.sni) || server || undefined },
                transport,
                plugin,
                features,
                password: asString(raw.password),
                obfs: normalizeHysteria2Obfs(raw),
                bandwidth: normalizeBandwidth(raw),
            } as NormalizedHysteria2Proxy;
        case 'http':
            return {
                id,
                stableKey,
                name,
                type: 'http',
                server,
                port,
                udp,
                sourcePath,
                raw,
                tls,
                transport,
                plugin,
                features,
                username: asString(raw.username) || undefined,
                password: asString(raw.password) || undefined,
                path: asString(raw.path) || undefined,
                headers: asStringOrStringArrayRecord(raw.headers),
            } as NormalizedHttpProxy;
        default:
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.UNSUPPORTED_PROTOCOL,
                module: 'proxy',
                sourcePath,
                objectId: id,
                objectStableKey: stableKey,
                objectName: name,
                message: `Unsupported proxy protocol: ${type}`,
                impact: 'The proxy is kept in normalized form, but may be dropped in planning',
                fallback: 'Convert to unknown proxy and defer the decision to planner',
            });
            return {
                id,
                stableKey,
                name,
                type: 'unknown',
                originalType: type,
                server,
                port,
                udp,
                sourcePath,
                raw,
                tls,
                transport,
                plugin,
                features,
            } as NormalizedUnknownProxy;
    }
}

function generateStableKey(module: string, sourcePath: string, name: string): string {
    return `${module}:${sourcePath}:${name}`;
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function normalizeTls(raw: RawProxy): NormalizedTls | undefined {
    const enabled =
        asBoolean(raw.tls) || asBoolean(raw['skip-cert-verify']) || typeof raw.sni === 'string';
    if (!enabled) {
        return undefined;
    }

    return {
        enabled: true,
        insecure: asBoolean(raw['skip-cert-verify']),
        serverName: asString(raw.sni) || asString(raw.server),
        alpn: Array.isArray(raw.alpn)
            ? raw.alpn.filter((item): item is string => typeof item === 'string')
            : undefined,
        fingerprint: asString(raw.fingerprint) || undefined,
        clientFingerprint: asString(raw['client-fingerprint']) || undefined,
    };
}

function normalizeTransport(raw: RawProxy): NormalizedTransport | undefined {
    const network = asString(raw.network);
    if (!network || network === 'tcp') {
        return network === 'tcp' ? { type: 'tcp' } : undefined;
    }

    if (network === 'ws') {
        const wsOpts = asObject(raw['ws-opts']);
        return {
            type: 'ws',
            path: asString(wsOpts?.path) || undefined,
            headers: asStringRecord(wsOpts?.headers),
            maxEarlyData: asNumber(wsOpts?.['max-early-data']),
            earlyDataHeaderName: asString(wsOpts?.['early-data-header-name']) || undefined,
        };
    }

    if (network === 'grpc') {
        const grpcOpts = asObject(raw['grpc-opts']);
        return {
            type: 'grpc',
            serviceName: asString(grpcOpts?.['grpc-service-name']) || undefined,
        };
    }

    if (network === 'http') {
        const httpOpts = asObject(raw['http-opts']);
        return {
            type: 'http',
            method: asString(httpOpts?.method) || undefined,
            path: firstString(httpOpts?.path),
            headers: asStringOrStringArrayRecord(httpOpts?.headers),
        };
    }

    if (network === 'h2') {
        const h2Opts = asObject(raw['h2-opts']);
        return {
            type: 'h2',
            path: asString(h2Opts?.path) || undefined,
            host: stringOrStringArray(h2Opts?.host),
        };
    }

    return undefined;
}

function normalizePlugin(raw: RawProxy): NormalizedPlugin | undefined {
    const type = asString(raw.plugin);
    if (!type) {
        return undefined;
    }

    return {
        type,
        options: asObject(raw['plugin-opts']) ?? {},
    };
}

function normalizePacketEncoding(raw: RawProxy): 'xudp' | 'packetaddr' | undefined {
    if (asBoolean(raw.xudp)) {
        return 'xudp';
    }
    if (asBoolean(raw['packet-addr'])) {
        return 'packetaddr';
    }
    return undefined;
}

function normalizeReality(raw: RawProxy): NormalizedVlessProxy['reality'] | undefined {
    const realityOpts = asObject(raw['reality-opts']);
    const publicKey = asString(realityOpts?.['public-key']);
    if (!publicKey) {
        return undefined;
    }

    return {
        publicKey,
        shortId: asString(realityOpts?.['short-id']) || undefined,
    };
}

function normalizeHysteria2Obfs(raw: RawProxy): NormalizedHysteria2Proxy['obfs'] | undefined {
    const type = asString(raw.obfs);
    if (!type) {
        return undefined;
    }

    return {
        type,
        password: asString(raw['obfs-password']) || undefined,
    };
}

function normalizeBandwidth(raw: RawProxy): NormalizedHysteria2Proxy['bandwidth'] | undefined {
    const upMbps = parseBandwidth(raw.up);
    const downMbps = parseBandwidth(raw.down);
    if (upMbps === undefined && downMbps === undefined) {
        return undefined;
    }

    return { upMbps, downMbps };
}

function parseBandwidth(value: unknown): number | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function collectFeatures(
    raw: RawProxy,
    tls: NormalizedTls | undefined,
    transport: NormalizedTransport | undefined,
    plugin: NormalizedPlugin | undefined,
    udp: boolean | undefined
): string[] {
    const features: string[] = [];

    if (tls?.enabled) {
        features.push('tls');
    }
    if (transport) {
        features.push(`transport:${transport.type}`);
    }
    if (plugin) {
        features.push(`plugin:${plugin.type}`);
    }
    if (udp) {
        features.push('udp');
    }
    if (asBoolean(raw['skip-cert-verify'])) {
        features.push('tls:insecure');
    }

    return features;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
    const record = asObject(value);
    if (!record) {
        return undefined;
    }

    const entries = Object.entries(record).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
    );
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function asStringOrStringArrayRecord(
    value: unknown
): Record<string, string | string[]> | undefined {
    const record = asObject(value);
    if (!record) {
        return undefined;
    }

    const normalized = Object.entries(record).flatMap(([key, recordValue]) => {
        if (typeof recordValue === 'string') {
            return [[key, recordValue] as const];
        }
        if (Array.isArray(recordValue)) {
            const strings = recordValue.filter((item): item is string => typeof item === 'string');
            if (strings.length > 0) {
                return [[key, strings] as const];
            }
        }
        return [];
    });

    return normalized.length > 0 ? Object.fromEntries(normalized) : undefined;
}

function firstString(value: unknown): string | undefined {
    if (typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value)) {
        const first = value.find((item): item is string => typeof item === 'string');
        return first;
    }
    return undefined;
}

function stringOrStringArray(value: unknown): string | string[] | undefined {
    if (typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value)) {
        const strings = value.filter((item): item is string => typeof item === 'string');
        return strings.length > 0 ? strings : undefined;
    }
    return undefined;
}
