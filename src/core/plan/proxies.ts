import { MigrationErrorCode, type MigrationIssue } from '../types/migration';
import type { MigrationAnalysis } from '../types/migration-analysis';
import type { PlanningDecision, PlannedOutbound } from '../types/migration-plan';
import type { NormalizedProxy } from '../types/normalized-clash';

export function planProxyOutbounds(
    proxies: NormalizedProxy[],
    analysis: MigrationAnalysis
): {
    outbounds: PlannedOutbound[];
    issues: MigrationIssue[];
    decisions: PlanningDecision[];
} {
    const outbounds: PlannedOutbound[] = [];
    const issues: MigrationIssue[] = [];
    const decisions: PlanningDecision[] = [];

    for (const proxy of proxies) {
        const plannerDegraded = shouldDegradeProxyInPlanner(proxy);
        const status = plannerDegraded
            ? 'degraded'
            : (analysis.objectStatuses.proxies[proxy.id] ?? 'exact');

        if (proxy.type === 'unknown') {
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.UNSUPPORTED_PROTOCOL,
                module: 'proxy',
                sourcePath: proxy.sourcePath,
                objectId: proxy.id,
                objectStableKey: proxy.stableKey,
                objectName: proxy.name,
                message: `Proxy "${proxy.name}" uses unsupported protocol "${proxy.originalType}"`,
                impact: 'The proxy is dropped from planned outbounds',
                fallback: 'Keep it in the report, but do not emit an outbound',
            });
            decisions.push({
                id: crypto.randomUUID(),
                kind: 'drop-unsupported',
                targetModule: 'proxy',
                targetId: proxy.id,
                summary: `Drop unsupported proxy ${proxy.name}`,
                reason: `Protocol ${proxy.originalType} is not supported in V1 planner`,
                sourcePaths: [proxy.sourcePath],
            });
            continue;
        }

        if (!proxy.server || !proxy.port) {
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.MISSING_REQUIRED_FIELD,
                module: 'proxy',
                sourcePath: proxy.sourcePath,
                objectId: proxy.id,
                objectStableKey: proxy.stableKey,
                objectName: proxy.name,
                message: `Proxy "${proxy.name}" is missing server or port`,
                impact: 'The proxy is dropped from planned outbounds',
                fallback: 'Report the proxy but skip emitting an outbound',
            });
            decisions.push({
                id: crypto.randomUUID(),
                kind: 'drop-unsupported',
                targetModule: 'proxy',
                targetId: proxy.id,
                summary: `Drop incomplete proxy ${proxy.name}`,
                reason: 'Required outbound endpoint fields are missing',
                sourcePaths: [proxy.sourcePath],
            });
            continue;
        }

        if (plannerDegraded) {
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.UNSUPPORTED_FIELD,
                module: 'proxy',
                sourcePath: proxy.sourcePath,
                objectId: proxy.id,
                objectStableKey: proxy.stableKey,
                objectName: proxy.name,
                message: `Proxy "${proxy.name}" uses Shadowsocks plugin "${proxy.plugin?.type}" that is not fully emitted in V1`,
                impact: 'The proxy is kept runnable, but plugin-specific behavior may be dropped.',
                fallback:
                    'Emit a plain Shadowsocks outbound when plugin options cannot be serialized safely',
            });
            decisions.push({
                id: crypto.randomUUID(),
                kind: 'fallback-map',
                targetModule: 'proxy',
                targetId: proxy.id,
                summary: `Drop plugin fields from proxy ${proxy.name}`,
                reason: 'Current sing-box emission path only supports a safe subset of Clash Shadowsocks plugin fields',
                sourcePaths: [proxy.sourcePath],
            });
        }

        outbounds.push({
            id: crypto.randomUUID(),
            sourcePaths: [proxy.sourcePath],
            status,
            decision: status === 'degraded' ? 'fallback-map' : 'normalized-map',
            notes: proxy.features,
            type: mapProxyType(proxy.type),
            tag: proxy.name,
            payload: buildProxyPayload(proxy),
        });
        decisions.push({
            id: crypto.randomUUID(),
            kind: status === 'degraded' ? 'fallback-map' : 'normalized-map',
            targetModule: 'proxy',
            targetId: proxy.id,
            summary: `Plan outbound for proxy ${proxy.name}`,
            reason: `Lower ${proxy.type} proxy into sing-box outbound`,
            sourcePaths: [proxy.sourcePath],
        });
    }

    return { outbounds, issues, decisions };
}

function mapProxyType(type: NormalizedProxy['type']): string {
    switch (type) {
        case 'ss':
            return 'shadowsocks';
        default:
            return type;
    }
}

function buildProxyPayload(
    proxy: Exclude<NormalizedProxy, { type: 'unknown' }>
): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        server: proxy.server,
        server_port: proxy.port,
    };

    if (proxy.type === 'http') {
        if (proxy.username) {
            payload.username = proxy.username;
        }
        if (proxy.password) {
            payload.password = proxy.password;
        }
        if (proxy.path) {
            payload.path = proxy.path;
        }
        if (proxy.headers) {
            payload.headers = proxy.headers;
        }
    }

    if ('method' in proxy) {
        payload.method = proxy.method;
        payload.password = proxy.password;
    }
    if ('uuid' in proxy) {
        payload.uuid = proxy.uuid;
    }
    if ('password' in proxy && proxy.type !== 'ss') {
        payload.password = proxy.password;
    }
    if ('security' in proxy && proxy.security) {
        payload.security = proxy.security;
    }
    if ('alterId' in proxy && proxy.alterId !== undefined) {
        payload.alter_id = proxy.alterId;
    }
    if ('flow' in proxy && proxy.flow) {
        payload.flow = proxy.flow;
    }
    if ('packetEncoding' in proxy && proxy.packetEncoding) {
        payload.packet_encoding = proxy.packetEncoding;
    }
    if ('obfs' in proxy && proxy.obfs) {
        payload.obfs = proxy.obfs;
    }
    if ('bandwidth' in proxy && proxy.bandwidth) {
        payload.up_mbps = proxy.bandwidth.upMbps;
        payload.down_mbps = proxy.bandwidth.downMbps;
    }
    if (proxy.tls) {
        const tlsPayload: Record<string, unknown> = {
            enabled: proxy.tls.enabled,
            insecure: proxy.tls.insecure,
            server_name: proxy.tls.serverName,
            alpn: proxy.tls.alpn,
            utls: proxy.tls.clientFingerprint
                ? {
                      enabled: true,
                      fingerprint: proxy.tls.clientFingerprint,
                  }
                : undefined,
        };
        if ('reality' in proxy && proxy.reality) {
            tlsPayload.reality = {
                enabled: true,
                public_key: proxy.reality.publicKey,
                short_id: proxy.reality.shortId,
            };
        }
        payload.tls = tlsPayload;
    }
    if (proxy.transport) {
        const transportPayload = buildTransportPayload(proxy.transport);
        if (transportPayload) {
            payload.transport = transportPayload;
        }
    }
    if (proxy.plugin && proxy.type === 'ss') {
        const pluginMapping = serializeShadowsocksPlugin(proxy.plugin);
        if (pluginMapping) {
            payload.plugin = pluginMapping.name;
            payload.plugin_opts = pluginMapping.options;
        }
    }

    return payload;
}

function shouldDegradeProxyInPlanner(
    proxy: Exclude<NormalizedProxy, { type: 'unknown' }> | NormalizedProxy
): boolean {
    return (
        proxy.type === 'ss' && Boolean(proxy.plugin) && !serializeShadowsocksPlugin(proxy.plugin)
    );
}

function buildTransportPayload(
    transport: Exclude<NormalizedProxy['transport'], undefined>
): Record<string, unknown> | undefined {
    switch (transport.type) {
        case 'ws':
            return {
                type: 'ws',
                path: transport.path,
                headers: transport.headers,
                max_early_data: transport.maxEarlyData,
                early_data_header_name: transport.earlyDataHeaderName,
            };
        case 'grpc':
            return {
                type: 'grpc',
                service_name: transport.serviceName,
            };
        case 'http':
            return {
                type: 'http',
                method: transport.method,
                path: transport.path,
                headers: transport.headers,
                host: transport.host,
            };
        case 'h2':
            return {
                type: 'http',
                path: transport.path,
                host: transport.host,
            };
        case 'tcp':
            return undefined;
    }
}

function serializeShadowsocksPlugin(plugin: Exclude<NormalizedProxy['plugin'], undefined>): {
    name: string;
    options: string;
} | null {
    if (plugin.type === 'obfs') {
        const mode = asString(plugin.options.mode);
        const host = asString(plugin.options.host);
        const parts = [];

        if (mode) {
            parts.push(`obfs=${mode}`);
        }
        if (host) {
            parts.push(`obfs-host=${host}`);
        }

        return parts.length > 0
            ? {
                  name: 'obfs-local',
                  options: parts.join(';'),
              }
            : null;
    }

    if (plugin.type === 'v2ray-plugin') {
        const mode = asString(plugin.options.mode);
        const host = asString(plugin.options.host);
        const path = asString(plugin.options.path);
        const tls = asBoolean(plugin.options.tls);
        const mux = asBoolean(plugin.options.mux);
        const parts = [];

        if (mode) {
            parts.push(`mode=${mode}`);
        }
        if (host) {
            parts.push(`host=${host}`);
        }
        if (path) {
            parts.push(`path=${path}`);
        }
        if (tls !== undefined) {
            parts.push(`tls=${tls ? 'true' : 'false'}`);
        }
        if (mux !== undefined) {
            parts.push(`mux=${mux ? 'true' : 'false'}`);
        }

        return parts.length > 0
            ? {
                  name: 'v2ray-plugin',
                  options: parts.join(';'),
              }
            : null;
    }

    return null;
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function asBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}
