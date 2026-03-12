import type { MigrationIssue } from '../types/migration';
import type { NormalizedTun } from '../types/normalized-clash';

export function normalizeTun(rawTun: Record<string, unknown> | undefined): {
    tun?: NormalizedTun;
    issues: MigrationIssue[];
} {
    if (!rawTun || typeof rawTun !== 'object') {
        return { tun: undefined, issues: [] };
    }

    return {
        tun: {
            enabled: Boolean(rawTun.enable),
            stack: typeof rawTun.stack === 'string' ? rawTun.stack : undefined,
            autoRoute: typeof rawTun['auto-route'] === 'boolean' ? rawTun['auto-route'] : undefined,
            autoDetectInterface:
                typeof rawTun['auto-detect-interface'] === 'boolean'
                    ? rawTun['auto-detect-interface']
                    : undefined,
            dnsHijack: Array.isArray(rawTun['dns-hijack'])
                ? rawTun['dns-hijack'].filter((item): item is string => typeof item === 'string')
                : undefined,
            strictRoute:
                typeof rawTun['strict-route'] === 'boolean' ? rawTun['strict-route'] : undefined,
            mtu: typeof rawTun.mtu === 'number' ? rawTun.mtu : undefined,
            sourcePath: 'tun',
        },
        issues: [],
    };
}
