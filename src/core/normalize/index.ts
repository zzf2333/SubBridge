import type { MigrationIssue } from '../types/migration';
import type { NormalizedClashConfig } from '../types/normalized-clash';
import type { RawClashConfig } from '../types/raw-clash';
import { normalizeDns } from './dns';
import { normalizeGeneral } from './general';
import { normalizeGroups } from './groups';
import { normalizeProxies } from './proxies';
import { normalizeProviders } from './providers';
import { normalizeRules } from './rules';
import { normalizeScriptShortcuts } from './script';
import { normalizeTun } from './tun';

export function normalizeClashConfig(rawConfig: RawClashConfig): {
    normalized: NormalizedClashConfig;
    issues: MigrationIssue[];
} {
    const proxyResult = normalizeProxies(rawConfig.proxies ?? []);
    const groupResult = normalizeGroups(rawConfig['proxy-groups'] ?? []);
    const ruleResult = normalizeRules(rawConfig.rules ?? []);
    const dnsResult = normalizeDns(asObject(rawConfig.dns));
    const tunResult = normalizeTun(asObject(rawConfig.tun));
    const providerResult = normalizeProviders(
        asObject(rawConfig['rule-providers']),
        asObject(rawConfig['proxy-providers'])
    );

    return {
        normalized: {
            general: normalizeGeneral(rawConfig),
            proxies: proxyResult.proxies,
            groups: groupResult.groups,
            rules: ruleResult.rules,
            scriptShortcuts: normalizeScriptShortcuts(asObject(rawConfig.script)),
            dns: dnsResult.dns,
            tun: tunResult.tun,
            providers: {
                ruleProviders: providerResult.ruleProviders,
                proxyProviders: providerResult.proxyProviders,
            },
            meta: {
                sourceFormat: 'clash',
                migratorVersion: '0.1.0-dev',
                parserWarnings: [],
            },
        },
        issues: [
            ...proxyResult.issues,
            ...groupResult.issues,
            ...ruleResult.issues,
            ...dnsResult.issues,
            ...tunResult.issues,
            ...providerResult.issues,
        ],
    };
}

function asObject(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}
