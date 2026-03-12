import { MigrationErrorCode, type MigrationIssue } from '../types/migration';
import type { NormalizedDns, NormalizedDnsServer } from '../types/normalized-clash';

export function normalizeDns(rawDns: Record<string, unknown> | undefined): {
    dns?: NormalizedDns;
    issues: MigrationIssue[];
} {
    if (!rawDns || typeof rawDns !== 'object') {
        return { dns: undefined, issues: [] };
    }

    const issues: MigrationIssue[] = [];

    return {
        dns: {
            enabled: true,
            listen: typeof rawDns.listen === 'string' ? rawDns.listen : undefined,
            ipv6: typeof rawDns.ipv6 === 'boolean' ? rawDns.ipv6 : undefined,
            enhancedMode: parseEnhancedMode(rawDns['enhanced-mode']),
            fakeIpRange:
                typeof rawDns['fake-ip-range'] === 'string' ? rawDns['fake-ip-range'] : undefined,
            nameservers: normalizeDnsServers(rawDns.nameserver, 'nameserver', issues),
            fallback: normalizeDnsServers(rawDns.fallback, 'fallback', issues),
            defaultNameserver: normalizeDnsServers(rawDns['default-nameserver'], 'default', issues),
            nameserverPolicy: normalizeDnsPolicy(rawDns['nameserver-policy'], issues),
            fakeIpFilter: Array.isArray(rawDns['fake-ip-filter'])
                ? rawDns['fake-ip-filter'].filter(
                      (item): item is string => typeof item === 'string'
                  )
                : undefined,
            fallbackFilter: normalizeFallbackFilter(rawDns['fallback-filter']),
            respectRules:
                typeof rawDns['respect-rules'] === 'boolean' ? rawDns['respect-rules'] : undefined,
            useHosts: typeof rawDns['use-hosts'] === 'boolean' ? rawDns['use-hosts'] : undefined,
            sourcePath: 'dns',
        },
        issues,
    };
}

function parseEnhancedMode(value: unknown): NormalizedDns['enhancedMode'] {
    if (value === 'fake-ip' || value === 'redir-host' || value === 'none') {
        return value;
    }
    return undefined;
}

function normalizeDnsServers(
    value: unknown,
    source: NormalizedDnsServer['source'],
    issues: MigrationIssue[]
): NormalizedDnsServer[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    return value.flatMap((server) => {
        if (typeof server === 'string') {
            return normalizeDnsServerString(server, source);
        }

        if (server && typeof server === 'object' && !Array.isArray(server)) {
            const record = server as Record<string, unknown>;
            const address = typeof record.address === 'string' ? record.address : undefined;
            if (!address) {
                issues.push({
                    id: crypto.randomUUID(),
                    level: 'warning',
                    code: MigrationErrorCode.INVALID_DNS_SERVER,
                    module: 'dns',
                    sourcePath: 'dns',
                    message: 'DNS server object is missing address',
                    impact: 'The invalid DNS server entry will be ignored',
                });
                return [];
            }

            const normalized = normalizeDnsServerString(address, source)[0];
            return normalized
                ? [
                      {
                          ...normalized,
                          detour:
                              typeof record.detour === 'string' ? record.detour : normalized.detour,
                      },
                  ]
                : [];
        }

        issues.push({
            id: crypto.randomUUID(),
            level: 'warning',
            code: MigrationErrorCode.INVALID_DNS_SERVER,
            module: 'dns',
            sourcePath: 'dns',
            message: 'Unsupported DNS server entry format',
            impact: 'The invalid DNS server entry will be ignored',
        });
        return [];
    });
}

function normalizeDnsServerString(
    server: string,
    source: NormalizedDnsServer['source']
): NormalizedDnsServer[] {
    if (server === 'system' || server === 'dhcp') {
        return [{ type: server, source }];
    }

    const match = server.match(/^(udp|tcp|tls|https|quic):\/\/(.+)$/i);
    if (match) {
        const protocol = match[1].toLowerCase() as 'udp' | 'tcp' | 'tls' | 'https' | 'quic';
        return [{ type: protocol, address: match[2], source }];
    }

    return [{ type: 'udp', address: server, source }];
}

function normalizeDnsPolicy(
    value: unknown,
    issues: MigrationIssue[]
): Record<string, NormalizedDnsServer[]> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const policies = Object.entries(value as Record<string, unknown>)
        .map(([pattern, policyValue]) => {
            const servers = normalizeDnsServers(policyValue, 'policy', issues);
            return servers && servers.length > 0 ? ([pattern, servers] as const) : undefined;
        })
        .filter((entry): entry is readonly [string, NormalizedDnsServer[]] => Boolean(entry));

    return policies.length > 0 ? Object.fromEntries(policies) : undefined;
}

function normalizeFallbackFilter(value: unknown): NormalizedDns['fallbackFilter'] | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const record = value as Record<string, unknown>;
    const ipcidr = Array.isArray(record.ipcidr)
        ? record.ipcidr.filter((item): item is string => typeof item === 'string')
        : undefined;

    const normalized: NonNullable<NormalizedDns['fallbackFilter']> = {
        geoip: typeof record.geoip === 'boolean' ? record.geoip : undefined,
        geoipCode: typeof record['geoip-code'] === 'string' ? record['geoip-code'] : undefined,
        ipcidr,
    };

    return normalized.geoip ||
        normalized.geoipCode ||
        (normalized.ipcidr && normalized.ipcidr.length > 0)
        ? normalized
        : undefined;
}
