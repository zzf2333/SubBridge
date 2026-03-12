import type { MigrationIssue } from '../types/migration';
import type { NormalizedProviderRef } from '../types/normalized-clash';

export function normalizeProviders(
    ruleProviders: Record<string, unknown> | undefined,
    proxyProviders: Record<string, unknown> | undefined
): {
    ruleProviders: NormalizedProviderRef[];
    proxyProviders: NormalizedProviderRef[];
    issues: MigrationIssue[];
} {
    return {
        ruleProviders: normalizeProviderMap('rule', 'rule-providers', ruleProviders),
        proxyProviders: normalizeProviderMap('proxy', 'proxy-providers', proxyProviders),
        issues: [],
    };
}

function normalizeProviderMap(
    type: NormalizedProviderRef['type'],
    sourceRoot: string,
    rawMap: Record<string, unknown> | undefined
): NormalizedProviderRef[] {
    if (!rawMap) {
        return [];
    }

    return Object.entries(rawMap)
        .filter(([, raw]) => raw && typeof raw === 'object' && !Array.isArray(raw))
        .map(([name, raw], index) => {
            const record = raw as Record<string, unknown>;
            return {
                id: crypto.randomUUID(),
                stableKey: `provider:${sourceRoot}[${index}]:${name}`,
                name,
                type,
                vehicle: normalizeProviderVehicle(record.type),
                path: asString(record.path) || undefined,
                url: asString(record.url) || undefined,
                resolvedPath: asString(record.__resolvedPath) || undefined,
                intervalSeconds: asNumber(record.interval),
                behavior: asString(record.behavior) || undefined,
                expandedProxyNames: asStringArray(record.__expandedProxyNames),
                sourcePath: `${sourceRoot}.${name}`,
                raw: record,
            };
        });
}

function normalizeProviderVehicle(value: unknown): NormalizedProviderRef['vehicle'] {
    if (value === 'http' || value === 'file' || value === 'inline') {
        return value;
    }
    return 'unknown';
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const items = value.filter((item): item is string => typeof item === 'string');
    return items.length > 0 ? items : undefined;
}
