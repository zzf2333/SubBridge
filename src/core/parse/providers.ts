import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { MigrationErrorCode, type MigrationIssue } from '../types/migration';
import type { RawClashConfig, RawProxy, RawProxyGroup } from '../types/raw-clash';
import { parseRawClashConfig } from './clash';
import { parseYamlInput } from './yaml';
import { fetchText } from '../../utils/http';

type MutableProviderRecord = Record<string, unknown> & {
    __resolvedPath?: string;
    __expandedProxyNames?: string[];
};

const DEFAULT_PROVIDER_FETCH_TIMEOUT_MS = 4_000;

export interface RemoteProviderCacheOptions {
    enabled?: boolean;
    timeoutMs?: number;
    force?: boolean;
    scope?: 'proxy' | 'rule' | 'all';
    fetcher?: (url: string, timeoutMs: number) => Promise<string>;
    nowMs?: () => number;
}

export interface RemoteProviderCacheRefreshResult {
    rawConfig: RawClashConfig;
    fetched: string[];
    skipped: string[];
    failed: Array<{ name: string; kind: 'proxy' | 'rule'; reason: string }>;
}

export type RemoteProxyProviderCacheOptions = RemoteProviderCacheOptions;
export type RemoteProxyProviderCacheRefreshResult = RemoteProviderCacheRefreshResult;

export async function refreshRemoteProviderCachesFromYaml(
    input: string,
    baseDir: string,
    options: RemoteProviderCacheOptions = {}
): Promise<RemoteProviderCacheRefreshResult> {
    let rawConfig: RawClashConfig;
    try {
        rawConfig = parseRawClashConfig(parseYamlInput(input));
    } catch {
        return {
            rawConfig: {},
            fetched: [],
            skipped: [],
            failed: [],
        };
    }

    return refreshRemoteProviderCaches(rawConfig, baseDir, options);
}

export async function refreshRemoteProviderCaches(
    rawConfig: RawClashConfig,
    baseDir: string,
    options: RemoteProviderCacheOptions = {}
): Promise<RemoteProviderCacheRefreshResult> {
    if (options.enabled === false) {
        return {
            rawConfig,
            fetched: [],
            skipped: [],
            failed: [],
        };
    }

    const timeoutMs = resolveProviderFetchTimeout(options.timeoutMs);
    const fetcher = options.fetcher ?? fetchText;
    const nowMs = options.nowMs ?? (() => Date.now());
    const scope = resolveProviderFetchScope(options.scope);
    const proxyRefresh =
        scope === 'rule'
            ? emptyProviderRefreshResult()
            : await refreshProviderMap(
                  asObjectMap(rawConfig['proxy-providers']),
                  'proxy',
                  baseDir,
                  fetcher,
                  timeoutMs,
                  options.force === true,
                  nowMs
              );
    const ruleRefresh =
        scope === 'proxy'
            ? emptyProviderRefreshResult()
            : await refreshProviderMap(
                  asObjectMap(rawConfig['rule-providers']),
                  'rule',
                  baseDir,
                  fetcher,
                  timeoutMs,
                  options.force === true,
                  nowMs
              );
    return {
        rawConfig: {
            ...rawConfig,
            'proxy-providers': proxyRefresh.map ?? rawConfig['proxy-providers'],
            'rule-providers': ruleRefresh.map ?? rawConfig['rule-providers'],
        },
        fetched: [...proxyRefresh.fetched, ...ruleRefresh.fetched],
        skipped: [...proxyRefresh.skipped, ...ruleRefresh.skipped],
        failed: [...proxyRefresh.failed, ...ruleRefresh.failed],
    };
}

export async function refreshRemoteProxyProviderCachesFromYaml(
    input: string,
    baseDir: string,
    options: RemoteProxyProviderCacheOptions = {}
): Promise<RemoteProxyProviderCacheRefreshResult> {
    let rawConfig: RawClashConfig;
    try {
        rawConfig = parseRawClashConfig(parseYamlInput(input));
    } catch {
        return {
            rawConfig: {},
            fetched: [],
            skipped: [],
            failed: [],
        };
    }

    return refreshRemoteProxyProviderCaches(rawConfig, baseDir, options);
}

export async function refreshRemoteProxyProviderCaches(
    rawConfig: RawClashConfig,
    baseDir: string,
    options: RemoteProxyProviderCacheOptions = {}
): Promise<RemoteProxyProviderCacheRefreshResult> {
    if (options.enabled === false) {
        return {
            rawConfig,
            fetched: [],
            skipped: [],
            failed: [],
        };
    }

    const timeoutMs = resolveProviderFetchTimeout(options.timeoutMs);
    const fetcher = options.fetcher ?? fetchText;
    const nowMs = options.nowMs ?? (() => Date.now());
    const proxyRefresh = await refreshProviderMap(
        asObjectMap(rawConfig['proxy-providers']),
        'proxy',
        baseDir,
        fetcher,
        timeoutMs,
        options.force === true,
        nowMs
    );

    return {
        rawConfig: {
            ...rawConfig,
            'proxy-providers': proxyRefresh.map ?? rawConfig['proxy-providers'],
        },
        fetched: proxyRefresh.fetched,
        skipped: proxyRefresh.skipped,
        failed: proxyRefresh.failed,
    };
}

async function refreshProviderMap(
    providerMap: Record<string, unknown> | undefined,
    kind: 'proxy' | 'rule',
    baseDir: string,
    fetcher: (url: string, timeoutMs: number) => Promise<string>,
    timeoutMs: number,
    forceRefresh: boolean,
    nowMs: () => number
): Promise<{
    map?: Record<string, unknown>;
    fetched: string[];
    skipped: string[];
    failed: Array<{ name: string; kind: 'proxy' | 'rule'; reason: string }>;
}> {
    if (!providerMap) {
        return {
            map: undefined,
            fetched: [],
            skipped: [],
            failed: [],
        };
    }

    const fetched: string[] = [];
    const skipped: string[] = [];
    const failed: Array<{ name: string; kind: 'proxy' | 'rule'; reason: string }> = [];
    const clonedProviders: Record<string, unknown> = {};

    for (const [providerName, rawProvider] of Object.entries(providerMap)) {
        if (!rawProvider || typeof rawProvider !== 'object' || Array.isArray(rawProvider)) {
            clonedProviders[providerName] = rawProvider;
            continue;
        }

        const provider = { ...(rawProvider as MutableProviderRecord) };
        const providerUrl = asNonEmptyString(provider.url);
        const providerPath = asNonEmptyString(provider.path);

        if (!providerUrl) {
            clonedProviders[providerName] = provider;
            continue;
        }

        if (!providerPath) {
            failed.push({
                name: providerName,
                kind,
                reason: 'missing provider.path for cache write',
            });
            clonedProviders[providerName] = provider;
            continue;
        }

        const resolvedPath = resolve(baseDir, providerPath);
        provider.__resolvedPath = resolvedPath;

        if (shouldReuseProviderCache(resolvedPath, provider.interval, forceRefresh, nowMs)) {
            skipped.push(providerName);
            clonedProviders[providerName] = provider;
            continue;
        }

        try {
            const content = await fetcher(providerUrl, timeoutMs);
            const validateError = validateFetchedProviderContent(kind, content);
            if (validateError) {
                failed.push({
                    name: providerName,
                    kind,
                    reason: validateError,
                });
                clonedProviders[providerName] = provider;
                continue;
            }

            mkdirSync(dirname(resolvedPath), { recursive: true });
            writeFileSync(resolvedPath, content, 'utf-8');
            fetched.push(providerName);
        } catch (error) {
            failed.push({
                name: providerName,
                kind,
                reason: (error as Error).message,
            });
        }

        clonedProviders[providerName] = provider;
    }

    return {
        map: clonedProviders,
        fetched,
        skipped,
        failed,
    };
}

export function expandLocalProxyProviders(
    rawConfig: RawClashConfig,
    baseDir: string
): {
    rawConfig: RawClashConfig;
    issues: MigrationIssue[];
} {
    const issues: MigrationIssue[] = [];
    const proxyProviders = asObjectMap(rawConfig['proxy-providers']);
    const ruleProviders = asObjectMap(rawConfig['rule-providers']);
    const groups = Array.isArray(rawConfig['proxy-groups'])
        ? rawConfig['proxy-groups'].map((group) => ({ ...group }))
        : [];
    const proxies = Array.isArray(rawConfig.proxies) ? [...rawConfig.proxies] : [];

    const clonedRuleProviders = annotateResolvedProviderPaths(ruleProviders, baseDir);

    if (!proxyProviders) {
        return {
            rawConfig: {
                ...rawConfig,
                'rule-providers': clonedRuleProviders ?? rawConfig['rule-providers'],
            },
            issues,
        };
    }

    const expandedByProvider = new Map<string, string[]>();
    const existingProxyNames = new Set(
        proxies
            .map((proxy) => (typeof proxy?.name === 'string' ? proxy.name : undefined))
            .filter((name): name is string => Boolean(name))
    );

    const clonedProviders: Record<string, unknown> = {};

    for (const [providerName, rawProvider] of Object.entries(proxyProviders)) {
        if (!rawProvider || typeof rawProvider !== 'object' || Array.isArray(rawProvider)) {
            clonedProviders[providerName] = rawProvider;
            continue;
        }

        const provider = { ...(rawProvider as MutableProviderRecord) };
        const localPath = typeof provider.path === 'string' ? provider.path : undefined;

        if (localPath) {
            const resolvedPath = resolve(baseDir, localPath);
            provider.__resolvedPath = resolvedPath;

            if (existsSync(resolvedPath)) {
                try {
                    const providerConfig = parseRawClashConfig(
                        parseYamlInput(readFileSync(resolvedPath, 'utf-8'))
                    );
                    const providerProxies = Array.isArray(providerConfig.proxies)
                        ? providerConfig.proxies
                        : [];
                    const expandedNames = collectProviderProxyNames(
                        providerProxies,
                        proxies,
                        existingProxyNames
                    );

                    if (expandedNames.length > 0) {
                        provider.__expandedProxyNames = expandedNames;
                        expandedByProvider.set(providerName, expandedNames);
                    }
                } catch (error) {
                    issues.push({
                        id: crypto.randomUUID(),
                        level: 'warning',
                        code: MigrationErrorCode.UNRESOLVABLE_DEPENDENCY,
                        module: 'proxy',
                        sourcePath: `proxy-providers.${providerName}`,
                        objectName: providerName,
                        message: `Proxy-provider "${providerName}" local cache could not be expanded`,
                        impact: 'The migrator falls back to provider placeholder behavior for this provider.',
                        fallback:
                            'Keep the provider as a placeholder outbound instead of expanding concrete proxies',
                        suggestion: `Check provider cache file: ${(error as Error).message}`,
                    });
                }
            }
        }

        clonedProviders[providerName] = provider;
    }

    const rewrittenGroups = groups.map((group, index) =>
        rewriteGroupWithExpandedProviders(group, index, expandedByProvider, issues)
    );

    return {
        rawConfig: {
            ...rawConfig,
            proxies,
            'proxy-groups': rewrittenGroups,
            'rule-providers': clonedRuleProviders ?? rawConfig['rule-providers'],
            'proxy-providers': clonedProviders,
        },
        issues,
    };
}

function annotateResolvedProviderPaths(
    providers: Record<string, unknown> | undefined,
    baseDir: string
): Record<string, unknown> | undefined {
    if (!providers) {
        return undefined;
    }

    const annotated: Record<string, unknown> = {};
    for (const [name, rawProvider] of Object.entries(providers)) {
        if (!rawProvider || typeof rawProvider !== 'object' || Array.isArray(rawProvider)) {
            annotated[name] = rawProvider;
            continue;
        }

        const provider = { ...(rawProvider as MutableProviderRecord) };
        const localPath = typeof provider.path === 'string' ? provider.path : undefined;
        if (localPath) {
            provider.__resolvedPath = resolve(baseDir, localPath);
        }
        annotated[name] = provider;
    }

    return annotated;
}

function collectProviderProxyNames(
    providerProxies: RawProxy[],
    mergedProxies: RawProxy[],
    existingProxyNames: Set<string>
): string[] {
    const names: string[] = [];

    for (const proxy of providerProxies) {
        const name = typeof proxy?.name === 'string' ? proxy.name : undefined;
        if (!name) {
            continue;
        }

        names.push(name);

        if (!existingProxyNames.has(name)) {
            mergedProxies.push(proxy);
            existingProxyNames.add(name);
        }
    }

    return Array.from(new Set(names));
}

function rewriteGroupWithExpandedProviders(
    group: RawProxyGroup,
    index: number,
    expandedByProvider: Map<string, string[]>,
    issues: MigrationIssue[]
): RawProxyGroup {
    const providerNames = Array.isArray(group.use)
        ? group.use.filter((item): item is string => typeof item === 'string')
        : [];
    if (providerNames.length === 0) {
        return group;
    }

    const currentProxies = Array.isArray(group.proxies) ? [...group.proxies] : [];
    const nextUse: string[] = [];
    const seen = new Set(currentProxies);

    for (const providerName of providerNames) {
        const expanded = expandedByProvider.get(providerName);
        if (!expanded || expanded.length === 0) {
            nextUse.push(providerName);
            continue;
        }

        const matched = applyGroupFilter(
            expanded,
            group.filter,
            issues,
            index,
            group.name ?? `group-${index}`
        );
        if (matched.length === 0) {
            nextUse.push(providerName);
            continue;
        }

        for (const name of matched) {
            if (!seen.has(name)) {
                currentProxies.push(name);
                seen.add(name);
            }
        }
    }

    return {
        ...group,
        proxies: currentProxies.length > 0 ? currentProxies : undefined,
        use: nextUse.length > 0 ? nextUse : undefined,
    };
}

function applyGroupFilter(
    proxyNames: string[],
    rawFilter: unknown,
    issues: MigrationIssue[],
    index: number,
    groupName: string
): string[] {
    if (typeof rawFilter !== 'string' || rawFilter.length === 0) {
        return proxyNames;
    }

    try {
        const pattern = new RegExp(rawFilter);
        return proxyNames.filter((name) => pattern.test(name));
    } catch {
        issues.push({
            id: crypto.randomUUID(),
            level: 'warning',
            code: MigrationErrorCode.INVALID_FIELD_VALUE,
            module: 'group',
            sourcePath: `proxy-groups[${index}]`,
            objectName: groupName,
            message: `Group "${groupName}" uses invalid provider filter regex`,
            impact: 'The local provider expansion falls back to including all expanded provider proxies for this group.',
            fallback: 'Ignore the invalid filter during local provider expansion',
        });
        return proxyNames;
    }
}

function asObjectMap(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function resolveProviderFetchScope(
    scope: RemoteProviderCacheOptions['scope']
): 'proxy' | 'rule' | 'all' {
    if (scope === 'proxy' || scope === 'rule' || scope === 'all') {
        return scope;
    }

    return 'all';
}

function emptyProviderRefreshResult(): {
    map?: Record<string, unknown>;
    fetched: string[];
    skipped: string[];
    failed: Array<{ name: string; kind: 'proxy' | 'rule'; reason: string }>;
} {
    return {
        map: undefined,
        fetched: [],
        skipped: [],
        failed: [],
    };
}

function resolveProviderFetchTimeout(timeoutMs: number | undefined): number {
    if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return DEFAULT_PROVIDER_FETCH_TIMEOUT_MS;
    }

    return Math.floor(timeoutMs);
}

function shouldReuseProviderCache(
    resolvedPath: string,
    rawInterval: unknown,
    forceRefresh: boolean,
    nowMs: () => number
): boolean {
    if (forceRefresh || !existsSync(resolvedPath)) {
        return false;
    }

    const interval = typeof rawInterval === 'number' && rawInterval > 0 ? rawInterval : undefined;
    if (!interval) {
        return true;
    }

    try {
        const mtimeMs = statSync(resolvedPath).mtimeMs;
        const ageMs = Math.max(0, nowMs() - mtimeMs);
        return ageMs <= interval * 1_000;
    } catch {
        return false;
    }
}

function validateFetchedProviderContent(
    kind: 'proxy' | 'rule',
    content: string
): string | undefined {
    if (content.trim().length === 0) {
        return 'fetched content is empty';
    }

    if (kind === 'proxy') {
        try {
            const providerConfig = parseRawClashConfig(parseYamlInput(content));
            const providerProxies = Array.isArray(providerConfig.proxies)
                ? providerConfig.proxies
                : [];
            if (providerProxies.length === 0) {
                return 'fetched content does not contain provider proxies';
            }
        } catch (error) {
            return `invalid provider content: ${(error as Error).message}`;
        }
    }

    return undefined;
}
