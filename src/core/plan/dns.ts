import type { MigrationIssue } from '../types/migration';
import type { RuntimeIntent } from '../types/migration-analysis';
import type {
    PlannedDns,
    PlannedDnsRule,
    PlannedRepair,
    PlannedDnsServer,
    PlanningDecision,
} from '../types/migration-plan';
import type { NormalizedDns, NormalizedDnsServer } from '../types/normalized-clash';
import { MigrationErrorCode } from '../types/migration';
import { createRepair } from './repair';
import { isIP } from 'net';

const DNS_BOOTSTRAP_UDP_TAG = 'dns-bootstrap-udp';
const DNS_BOOTSTRAP_UDP_ADDR = '223.5.5.5';
const DNS_REMOTE_TAG = 'dns-remote';
const DNS_REMOTE_ADDR = '8.8.8.8';
const PROXY_DETOUR_TAG = 'proxy';

export function planDns(
    dns: NormalizedDns | undefined,
    runtime: RuntimeIntent
): {
    dns?: PlannedDns;
    issues: MigrationIssue[];
    decisions: PlanningDecision[];
    repairs: PlannedRepair[];
} {
    if (!dns && !runtime.requiresDns) {
        return { dns: undefined, issues: [], decisions: [], repairs: [] };
    }

    const normalizedDns = dns ?? buildDefaultDns();
    const registry = new Map<string, string>();
    const servers: PlannedDnsServer[] = [];
    const domainResolverServerTags = new Set<string>();
    const fakeIpEnabled = normalizedDns.enhancedMode === 'fake-ip';

    registerServers(
        normalizedDns.nameservers,
        normalizedDns.sourcePath,
        registry,
        servers,
        domainResolverServerTags
    );
    registerServers(
        normalizedDns.fallback,
        normalizedDns.sourcePath,
        registry,
        servers,
        domainResolverServerTags
    );
    registerServers(
        normalizedDns.defaultNameserver,
        normalizedDns.sourcePath,
        registry,
        servers,
        domainResolverServerTags
    );
    if (fakeIpEnabled) {
        servers.unshift({
            tag: 'fakeip',
            type: 'fakeip',
            payload: {
                type: 'fakeip',
                inet4_range: normalizedDns.fakeIpRange || '198.18.0.0/15',
            },
            sourcePaths: [normalizedDns.sourcePath],
        });
    }

    const defaultDomainResolver = ensureDefaultDomainResolverServer(
        servers,
        normalizedDns.sourcePath
    );

    const realDnsTag = pickFinalDnsTag(normalizedDns, registry);
    const rules = [
        ...buildDnsPolicyRules(normalizedDns, registry, servers, domainResolverServerTags),
        ...buildFakeIpFilterRules(normalizedDns, realDnsTag),
    ];
    for (const plannedServer of servers) {
        if (domainResolverServerTags.has(plannedServer.tag)) {
            plannedServer.payload.domain_resolver = defaultDomainResolver;
        }
    }
    // DNS 分流：当所有 DNS 服务器都是本地的（无 detour），
    // 添加远程 DNS 通过代理解析，避免 DNS 污染导致域名规则失效
    let finalDnsTag = fakeIpEnabled ? 'fakeip' : realDnsTag;
    const dnsSplitDecisions: PlanningDecision[] = [];

    if (runtime.requiresDns && !fakeIpEnabled && realDnsTag && isAllLocalDns(servers)) {
        // 添加远程 DNS 服务器，通过代理出站解析
        servers.push({
            tag: DNS_REMOTE_TAG,
            type: 'udp',
            payload: {
                type: 'udp',
                server: DNS_REMOTE_ADDR,
                detour: PROXY_DETOUR_TAG,
            },
            sourcePaths: [normalizedDns.sourcePath],
        });

        // outbound:any 规则防止 DNS 循环（代理出站解析服务器地址时用本地 DNS）
        rules.unshift({
            type: 'outbound-any',
            payload: { outbound: 'any', server: realDnsTag },
            sourcePaths: [normalizedDns.sourcePath],
        });

        finalDnsTag = DNS_REMOTE_TAG;

        dnsSplitDecisions.push({
            id: crypto.randomUUID(),
            kind: 'fallback-map',
            targetModule: 'dns',
            summary: `Add remote DNS ${DNS_REMOTE_ADDR} via proxy and set as default`,
            reason: 'All DNS servers are domestic; remote DNS through proxy prevents DNS poisoning for proxied domains',
            sourcePaths: [normalizedDns.sourcePath],
        });
    }

    const fakeIpHandling = buildFakeIpHandling(normalizedDns, rules);

    return {
        dns: {
            id: crypto.randomUUID(),
            sourcePaths: [normalizedDns.sourcePath],
            status: dns ? 'exact' : 'degraded',
            decision: dns ? 'normalized-map' : 'default-fill',
            notes: collectDnsNotes(normalizedDns, defaultDomainResolver),
            servers,
            rules,
            final: finalDnsTag,
            defaultDomainResolver,
            strategy: normalizedDns.ipv6 === false ? 'ipv4_only' : undefined,
            independentCache: fakeIpEnabled || normalizedDns.respectRules === true,
            reverseMapping: fakeIpEnabled,
            fakeip: fakeIpEnabled
                ? {
                      enabled: true,
                      inet4Range: normalizedDns.fakeIpRange || '198.18.0.0/15',
                  }
                : undefined,
        },
        issues: fakeIpHandling.issues,
        decisions: [
            {
                id: crypto.randomUUID(),
                kind: dns ? 'normalized-map' : 'default-fill',
                targetModule: 'dns',
                summary: dns ? 'Plan DNS from normalized config' : 'Insert default DNS plan',
                reason: dns
                    ? 'Runtime profile requires DNS and source config includes DNS settings'
                    : 'Runtime profile requires DNS but source config does not include DNS settings',
                sourcePaths: [normalizedDns.sourcePath],
            },
            ...buildDnsDecisions(normalizedDns, rules, defaultDomainResolver),
            ...dnsSplitDecisions,
            ...fakeIpHandling.decisions,
        ],
        repairs: fakeIpHandling.repairs,
    };
}

function buildDnsServerPayload(server: NormalizedDnsServer): Record<string, unknown> {
    if (server.type === 'system') {
        return { type: 'local' };
    }

    if (server.type === 'dhcp') {
        return { type: 'dhcp' };
    }

    const endpoint = parseDnsEndpoint(server);
    const payload: Record<string, unknown> = {
        type: server.type,
        server: endpoint.host,
        detour: server.detour,
    };
    if (endpoint.port) {
        payload.server_port = endpoint.port;
    }
    if (server.type === 'https' && endpoint.path) {
        payload.path = endpoint.path;
    }

    return payload;
}

function buildDefaultDns(): NormalizedDns {
    return {
        enabled: true,
        nameservers: [
            { type: 'udp', address: '8.8.8.8', source: 'nameserver' },
            { type: 'udp', address: '1.1.1.1', source: 'fallback' },
        ],
        sourcePath: 'dns:default',
    };
}

function collectDnsNotes(dns: NormalizedDns, defaultDomainResolver: string): string[] {
    const notes: string[] = [];

    if (dns.enhancedMode) {
        notes.push(`enhanced-mode:${dns.enhancedMode}`);
    }
    if (dns.respectRules) {
        notes.push('respect-rules enabled');
    }
    if (dns.enhancedMode === 'fake-ip') {
        notes.push('fake-ip:partial-emission');
        notes.push('fake-ip:reverse-mapping enabled');
        if (dns.fakeIpRange) {
            notes.push('fake-ip-range emitted');
        }
        if (dns.fakeIpFilter && dns.fakeIpFilter.length > 0) {
            notes.push(`fake-ip-filter partial:${dns.fakeIpFilter.length}`);
        }
        if (dns.respectRules) {
            notes.push('fake-ip:respect-rules not fully linked');
        }
    }
    if (dns.nameserverPolicy && Object.keys(dns.nameserverPolicy).length > 0) {
        notes.push(`policy-count:${Object.keys(dns.nameserverPolicy).length}`);
    }
    if (dns.fallbackFilter?.geoip) {
        notes.push(
            `fallback-filter:geoip${dns.fallbackFilter.geoipCode ? `:${dns.fallbackFilter.geoipCode}` : ''}`
        );
    }
    if (dns.fallbackFilter?.ipcidr && dns.fallbackFilter.ipcidr.length > 0) {
        notes.push(`fallback-filter:ipcidr:${dns.fallbackFilter.ipcidr.length}`);
    }
    notes.push(`default-domain-resolver:${defaultDomainResolver}`);

    return notes;
}

function registerServers(
    dnsServers: NormalizedDnsServer[] | undefined,
    sourcePath: string,
    registry: Map<string, string>,
    plannedServers: PlannedDnsServer[],
    domainResolverServerTags: Set<string>
): void {
    for (const server of dnsServers ?? []) {
        const key = buildServerKey(server);
        if (registry.has(key)) {
            continue;
        }

        const tag = `${server.source}-${server.type}-${registry.size}`;
        registry.set(key, tag);
        plannedServers.push({
            tag,
            type: server.type,
            payload: buildDnsServerPayload(server),
            sourcePaths: [sourcePath],
        });

        if (requiresDomainResolver(server)) {
            domainResolverServerTags.add(tag);
        }
    }
}

function buildServerKey(server: NormalizedDnsServer): string {
    if (server.type === 'system' || server.type === 'dhcp') {
        return `${server.source}:${server.type}`;
    }

    return `${server.source}:${server.type}:${server.address}:${server.port ?? ''}:${server.detour ?? ''}`;
}

function pickFinalDnsTag(dns: NormalizedDns, registry: Map<string, string>): string | undefined {
    const candidates = [
        ...(dns.defaultNameserver ?? []),
        ...dns.nameservers,
        ...(dns.fallback ?? []),
    ];

    for (const server of candidates) {
        const tag = registry.get(buildServerKey(server));
        if (tag) {
            return tag;
        }
    }

    return undefined;
}

function buildDnsPolicyRules(
    dns: NormalizedDns,
    registry: Map<string, string>,
    plannedServers: PlannedDnsServer[],
    domainResolverServerTags: Set<string>
): PlannedDnsRule[] {
    if (!dns.nameserverPolicy) {
        return [];
    }

    const rules: PlannedDnsRule[] = [];

    for (const [pattern, dnsServers] of Object.entries(dns.nameserverPolicy)) {
        registerServers(dnsServers, dns.sourcePath, registry, plannedServers, domainResolverServerTags);
        const firstServer = dnsServers[0];
        if (!firstServer) {
            continue;
        }

        const serverTag = registry.get(buildServerKey(firstServer));
        if (!serverTag) {
            continue;
        }

        for (const payload of buildDnsRulePayloads(pattern, serverTag)) {
            rules.push({
                type: payload.geosite
                    ? 'geosite'
                    : payload.domain_suffix
                      ? 'domain_suffix'
                      : 'domain',
                payload,
                sourcePaths: [dns.sourcePath],
            });
        }
    }

    return rules;
}

function buildDnsRulePayloads(pattern: string, serverTag: string): Record<string, unknown>[] {
    const patterns = pattern
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    return patterns.map((item) => {
        if (item.startsWith('geosite:')) {
            return { geosite: [item.slice('geosite:'.length)], server: serverTag };
        }

        if (item.startsWith('+.') || item.startsWith('*.')) {
            return { domain_suffix: [item.slice(2)], server: serverTag };
        }

        return { domain: [item], server: serverTag };
    });
}

function buildFakeIpFilterRules(
    dns: NormalizedDns,
    serverTag: string | undefined
): PlannedDnsRule[] {
    if (
        dns.enhancedMode !== 'fake-ip' ||
        !serverTag ||
        !dns.fakeIpFilter ||
        dns.fakeIpFilter.length === 0
    ) {
        return [];
    }

    const rules: PlannedDnsRule[] = [];
    for (const pattern of dns.fakeIpFilter) {
        const payload = buildFakeIpFilterPayload(pattern, serverTag);
        if (!payload) {
            continue;
        }

        rules.push({
            type: payload.domain_suffix ? 'domain_suffix' : 'domain',
            payload,
            sourcePaths: [`${dns.sourcePath}:fake-ip-filter:${pattern}`],
        });
    }

    return rules;
}

function buildFakeIpFilterPayload(
    pattern: string,
    serverTag: string
): Record<string, unknown> | null {
    if (pattern.startsWith('+.') || pattern.startsWith('*.')) {
        return { domain_suffix: [pattern.slice(2)], server: serverTag };
    }

    if (/^[A-Za-z0-9.-]+$/.test(pattern)) {
        return { domain: [pattern], server: serverTag };
    }

    const heuristicSuffix = buildWildcardSuffixHeuristic(pattern);
    if (heuristicSuffix) {
        return { domain_suffix: [heuristicSuffix], server: serverTag };
    }

    return null;
}

function buildDnsDecisions(
    dns: NormalizedDns,
    rules: PlannedDnsRule[],
    defaultDomainResolver: string
): PlanningDecision[] {
    const decisions: PlanningDecision[] = [];

    decisions.push({
        id: crypto.randomUUID(),
        kind: 'normalized-map',
        targetModule: 'dns',
        summary: `Set route.default_domain_resolver to ${defaultDomainResolver}`,
        reason: 'sing-box 1.12+ expects explicit domain resolver wiring for DNS and dial fields',
        sourcePaths: [dns.sourcePath],
    });

    if (dns.enhancedMode === 'fake-ip') {
        decisions.push({
            id: crypto.randomUUID(),
            kind: 'fallback-map',
            targetModule: 'dns',
            summary: 'Partially emit fake-ip DNS mode with runtime-safe fallback',
            reason: 'V1 emits sing-box fakeip and reverse-mapping basics, but not full Clash fake-ip semantics',
            sourcePaths: [dns.sourcePath],
        });
    }

    if (rules.length > 0) {
        decisions.push({
            id: crypto.randomUUID(),
            kind: 'normalized-map',
            targetModule: 'dns',
            summary: `Plan ${rules.length} DNS policy rules`,
            reason: 'nameserver-policy entries can be lowered to sing-box DNS rules in common cases',
            sourcePaths: [dns.sourcePath],
        });
    }

    if (
        dns.fallbackFilter?.geoip ||
        (dns.fallbackFilter?.ipcidr && dns.fallbackFilter.ipcidr.length > 0)
    ) {
        decisions.push({
            id: crypto.randomUUID(),
            kind: 'fallback-map',
            targetModule: 'dns',
            summary: 'Keep fallback-filter as advisory metadata only',
            reason: 'V1 records fallback-filter settings in DNS notes but does not model Clash fallback DNS decision logic explicitly',
            sourcePaths: [dns.sourcePath],
        });
    }

    return decisions;
}

function buildFakeIpHandling(
    dns: NormalizedDns,
    emittedRules: PlannedDnsRule[]
): {
    issues: MigrationIssue[];
    decisions: PlanningDecision[];
    repairs: PlannedRepair[];
} {
    if (dns.enhancedMode !== 'fake-ip') {
        return { issues: [], decisions: [], repairs: [] };
    }

    const issues: MigrationIssue[] = [
        {
            id: crypto.randomUUID(),
            level: 'warning',
            code: MigrationErrorCode.UNSUPPORTED_DNS_FEATURE,
            module: 'dns',
            sourcePath: dns.sourcePath,
            objectName: 'dns',
            message: 'fake-ip mode is partially emitted in V1 with runtime-safe fallback',
            impact: 'Basic fake-ip and reverse-mapping are emitted, but full Clash fake-ip semantics are not preserved.',
            fallback:
                'Emit sing-box fakeip service and DNS rules for the supported subset, while keeping remaining gaps in the report',
        },
    ];
    const decisions: PlanningDecision[] = [];
    const repairs: PlannedRepair[] = [
        createRepair({
            kind: 'rewrite',
            targetModule: 'dns',
            summary: 'Rewrite fake-ip DNS mode as partial sing-box fakeip emission',
            before: 'Clash fake-ip DNS mode with full Clash-specific allocation and filters',
            after: 'Sing-box fakeip service with reverse-mapping and supported filter lowering',
            reason: 'V1 preserves the runnable subset of fake-ip semantics and degrades unsupported details explicitly',
            sourcePaths: [dns.sourcePath],
        }),
    ];

    if (dns.fakeIpRange) {
        decisions.push({
            id: crypto.randomUUID(),
            kind: 'normalized-map',
            targetModule: 'dns',
            summary: 'Emit fake-ip-range into sing-box fakeip.inet4_range',
            reason: 'Custom Clash fake-ip IPv4 range can be mapped to sing-box fakeip.inet4_range',
            sourcePaths: [dns.sourcePath],
        });
    }

    if (dns.fakeIpFilter && dns.fakeIpFilter.length > 0) {
        const supported = emittedRules.filter((rule) =>
            rule.sourcePaths.some((path) => path.startsWith(`${dns.sourcePath}:fake-ip-filter:`))
        ).length;
        const unsupported = Math.max(dns.fakeIpFilter.length - supported, 0);

        if (supported > 0) {
            decisions.push({
                id: crypto.randomUUID(),
                kind: 'fallback-map',
                targetModule: 'dns',
                summary: `Lower ${supported} fake-ip-filter entries into DNS rules`,
                reason: 'Simple literal and suffix filters can be represented as sing-box DNS rules',
                sourcePaths: [dns.sourcePath],
            });
        }

        if (unsupported > 0) {
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.UNSUPPORTED_DNS_FEATURE,
                module: 'dns',
                sourcePath: dns.sourcePath,
                objectName: 'dns',
                message: `fake-ip-filter has ${unsupported} entries that cannot be lowered in V1`,
                impact: 'Some fake-ip exclusion rules are not modeled explicitly.',
                fallback:
                    'Emit supported literal/suffix filters as DNS rules and report the remaining unmatched patterns',
            });
            repairs.push(
                createRepair({
                    kind: 'drop',
                    targetModule: 'dns',
                    summary: 'Drop unsupported fake-ip-filter entries',
                    before: `fake-ip-filter=${dns.fakeIpFilter.join(', ')}`,
                    after: `Unsupported fake-ip-filter entries dropped: ${unsupported}`,
                    reason: 'Only simple literal and suffix fake-ip filters are lowered in V1',
                    sourcePaths: [dns.sourcePath],
                })
            );
        }
    }

    if (dns.respectRules) {
        decisions.push({
            id: crypto.randomUUID(),
            kind: 'fallback-map',
            targetModule: 'dns',
            summary: 'Keep respect-rules as advisory metadata only',
            reason: 'V1 records respect-rules in DNS notes but does not model full Clash fake-ip and DNS-routing coupling',
            sourcePaths: [dns.sourcePath],
        });
        repairs.push(
            createRepair({
                kind: 'rewrite',
                targetModule: 'dns',
                summary: 'Rewrite fake-ip respect-rules as report-only metadata',
                before: 'Clash DNS resolution behavior coupled with respect-rules',
                after: 'DNS notes keep respect-rules enabled, but no dedicated runtime linkage is emitted',
                reason: 'V1 does not implement full fake-ip and route-aware DNS coupling',
                sourcePaths: [dns.sourcePath],
            })
        );
    }

    if (
        dns.fallbackFilter?.geoip ||
        (dns.fallbackFilter?.ipcidr && dns.fallbackFilter.ipcidr.length > 0)
    ) {
        issues.push({
            id: crypto.randomUUID(),
            level: 'warning',
            code: MigrationErrorCode.UNSUPPORTED_DNS_FEATURE,
            module: 'dns',
            sourcePath: dns.sourcePath,
            objectName: 'dns',
            message: 'fallback-filter is preserved as advisory metadata only in V1',
            impact: 'Clash fallback DNS decision logic is not fully reproduced.',
            fallback:
                'Record fallback-filter in notes and keep the config runnable without dedicated fallback-filter enforcement',
        });
        repairs.push(
            createRepair({
                kind: 'rewrite',
                targetModule: 'dns',
                summary: 'Rewrite fallback-filter as report-only metadata',
                before: 'Clash fallback DNS decision logic with geoip/ipcidr filters',
                after: 'DNS notes keep fallback-filter details, but no dedicated runtime linkage is emitted',
                reason: 'V1 does not implement full Clash fallback-filter behavior',
                sourcePaths: [dns.sourcePath],
            })
        );
    }

    return { issues, decisions, repairs };
}

function buildWildcardSuffixHeuristic(pattern: string): string | null {
    const normalized = pattern.replace(/^\+\./, '').replace(/^\*\./, '');
    const labels = normalized.split('.').filter(Boolean);
    if (labels.length === 0) {
        return null;
    }

    const trailing: string[] = [];
    for (let index = labels.length - 1; index >= 0; index -= 1) {
        const label = labels[index];
        if (!label || label.includes('*')) {
            break;
        }
        trailing.unshift(label);
    }

    return trailing.length >= 2 ? trailing.join('.') : null;
}

function ensureDefaultDomainResolverServer(
    servers: PlannedDnsServer[],
    sourcePath: string
): string {
    const existing = servers.find((server) => canBeResolver(server.payload));
    if (existing) {
        return existing.tag;
    }

    const bootstrapResolver: PlannedDnsServer = {
        tag: DNS_BOOTSTRAP_UDP_TAG,
        type: 'udp',
        payload: {
            type: 'udp',
            server: DNS_BOOTSTRAP_UDP_ADDR,
        },
        sourcePaths: [sourcePath],
    };
    servers.unshift(bootstrapResolver);
    return bootstrapResolver.tag;
}

function canBeResolver(payload: Record<string, unknown>): boolean {
    const type = payload.type;
    if (type === 'local' || type === 'dhcp') {
        return true;
    }

    const host = typeof payload.server === 'string' ? payload.server : undefined;
    return Boolean(host && isIP(stripBrackets(host)) !== 0);
}

function requiresDomainResolver(server: NormalizedDnsServer): boolean {
    if (server.type === 'system' || server.type === 'dhcp') {
        return false;
    }

    const endpoint = parseDnsEndpoint(server);
    return isIP(stripBrackets(endpoint.host)) === 0;
}

function parseDnsEndpoint(
    server: Extract<NormalizedDnsServer, { type: 'udp' | 'tcp' | 'tls' | 'https' | 'quic' }>
): {
    host: string;
    port?: number;
    path?: string;
} {
    const raw = server.address.trim();
    const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `${server.type}://${raw}`;

    try {
        const parsed = new URL(withScheme);
        const host = stripBrackets(parsed.hostname) || stripBrackets(raw);
        const parsedPort = parsed.port ? Number(parsed.port) : undefined;
        const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : undefined;
        return {
            host,
            port: parsedPort ?? server.port,
            path,
        };
    } catch {
        const slashIndex = raw.indexOf('/');
        const hostPort = slashIndex >= 0 ? raw.slice(0, slashIndex) : raw;
        const path = slashIndex >= 0 ? raw.slice(slashIndex) : undefined;
        const split = splitHostAndPort(hostPort, server.port);
        return {
            host: split.host,
            port: split.port,
            path,
        };
    }
}

function splitHostAndPort(
    hostPort: string,
    fallbackPort?: number
): {
    host: string;
    port?: number;
} {
    const trimmed = hostPort.trim();
    if (!trimmed) {
        return { host: '', port: fallbackPort };
    }

    if (trimmed.startsWith('[')) {
        const end = trimmed.indexOf(']');
        if (end > 0) {
            const host = stripBrackets(trimmed.slice(0, end + 1));
            const remainder = trimmed.slice(end + 1);
            const port =
                remainder.startsWith(':') && /^[0-9]+$/.test(remainder.slice(1))
                    ? Number(remainder.slice(1))
                    : fallbackPort;
            return { host, port };
        }
    }

    const colonCount = (trimmed.match(/:/g) ?? []).length;
    if (colonCount === 1) {
        const [host, portRaw] = trimmed.split(':');
        if (host && portRaw && /^[0-9]+$/.test(portRaw)) {
            return { host: stripBrackets(host), port: Number(portRaw) };
        }
    }

    return { host: stripBrackets(trimmed), port: fallbackPort };
}

function stripBrackets(host: string): string {
    return host.replace(/^\[/, '').replace(/\]$/, '');
}

// 检查是否所有 DNS 服务器都是本地的（没有通过代理的 detour）
function isAllLocalDns(servers: PlannedDnsServer[]): boolean {
    return servers.every((server) => !server.payload.detour);
}
