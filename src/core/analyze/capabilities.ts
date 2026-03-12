import type { CapabilityAnalysis } from '../types/migration-analysis';
import type {
    NormalizedClashConfig,
    NormalizedProxy,
    NormalizedRule,
    RuleMatcher,
} from '../types/normalized-clash';

export function analyzeCapabilities(config: NormalizedClashConfig): CapabilityAnalysis {
    const ruleProviderMap = new Map(
        config.providers.ruleProviders.map((provider) => [provider.name, provider])
    );

    return {
        proxies: Object.fromEntries(
            config.proxies.map((proxy) => [proxy.id, analyzeProxyCapability(proxy)])
        ),
        groups: Object.fromEntries(
            config.groups.map((group) => [
                group.id,
                {
                    status:
                        group.type === 'unknown' ||
                        group.type === 'fallback' ||
                        group.type === 'load-balance' ||
                        group.type === 'relay' ||
                        group.members.some((member) => member.kind === 'provider')
                            ? 'degraded'
                            : 'exact',
                    groupType: group.type,
                    supportedFeatures:
                        group.type === 'select' || group.type === 'url-test' ? [group.type] : [],
                    unsupportedFeatures: group.type === 'unknown' ? ['unknown'] : [],
                    degradations: collectGroupDegradations(
                        group.type,
                        group.members.some((member) => member.kind === 'provider')
                    ),
                    recommendedFallback: getGroupFallback(group.type),
                },
            ])
        ),
        rules: Object.fromEntries(
            config.rules.map((rule) => [rule.id, analyzeRuleCapability(rule, ruleProviderMap)])
        ),
        dns: config.dns
            ? {
                  status: config.dns.enhancedMode === 'fake-ip' ? 'degraded' : 'exact',
                  supportedFeatures: config.dns.enhancedMode ? [config.dns.enhancedMode] : [],
                  unsupportedFeatures: [],
                  degradations:
                      config.dns.enhancedMode === 'fake-ip'
                          ? ['fake-ip behavior may require planner fallback and runtime completion']
                          : [],
              }
            : undefined,
        tun: config.tun
            ? {
                  status: 'exact',
                  supportedFeatures: ['tun'],
                  unsupportedFeatures: [],
                  degradations: [],
              }
            : undefined,
    };
}

function analyzeProxyCapability(proxy: NormalizedProxy) {
    const unsupportedFeatures: string[] = [];
    const degradations: string[] = [];
    let status: 'exact' | 'degraded' = 'exact';

    if (proxy.type === 'unknown') {
        status = 'degraded';
        unsupportedFeatures.push(proxy.originalType);
        degradations.push('Unknown proxy protocol');
    }

    if (!proxy.server || !proxy.port) {
        status = 'degraded';
        degradations.push('Missing required endpoint fields');
    }

    return {
        status,
        proxyType: proxy.type,
        supportedFeatures: proxy.features,
        unsupportedFeatures,
        degradations,
    };
}

function analyzeRuleCapability(
    rule: NormalizedRule,
    ruleProviderMap: Map<string, NormalizedClashConfig['providers']['ruleProviders'][number]>
) {
    const matcherType = rule.matcher.type;
    const degradedMatchers = new Set<RuleMatcher['type']>([
        'geoip',
        'geosite',
        'domain_regex',
        'process_path',
        'script',
    ]);
    const isResolvableRuleSet =
        matcherType === 'rule_set' &&
        (() => {
            const provider = ruleProviderMap.get(rule.matcher.value);
            return Boolean(
                provider &&
                ((provider.vehicle === 'http' && provider.url) ||
                    (provider.vehicle === 'file' && provider.path) ||
                    provider.vehicle === 'inline')
            );
        })();
    const isDegraded =
        degradedMatchers.has(matcherType) || (matcherType === 'rule_set' && !isResolvableRuleSet);

    return {
        status: isDegraded ? 'degraded' : 'exact',
        matcherType,
        supportedFeatures: [matcherType],
        unsupportedFeatures: [],
        degradations: isDegraded
            ? [`${matcherType} may require planner fallback or simplified lowering`]
            : [],
        recommendedFallback: getRuleFallback(matcherType),
    };
}

function collectGroupDegradations(
    type: NormalizedClashConfig['groups'][number]['type'],
    hasProviderMembers: boolean
): string[] {
    const degradations: string[] = [];

    switch (type) {
        case 'fallback':
            degradations.push('fallback is expected to degrade to urltest');
            break;
        case 'load-balance':
            degradations.push('load-balance is expected to degrade to selector');
            break;
        case 'relay':
            degradations.push('relay may be dropped or degraded in V1');
            break;
        case 'unknown':
            degradations.push('Unsupported group type');
            break;
    }

    if (hasProviderMembers) {
        degradations.push('provider-backed group members require placeholder handling in V1');
    }

    return degradations;
}

function getGroupFallback(type: NormalizedClashConfig['groups'][number]['type']) {
    switch (type) {
        case 'fallback':
            return 'urltest' as const;
        case 'load-balance':
        case 'relay':
            return 'selector' as const;
        default:
            return undefined;
    }
}

function getRuleFallback(type: RuleMatcher['type']): string | undefined {
    switch (type) {
        case 'geoip':
            return 'ip_cidr';
        case 'geosite':
            return 'domain_suffix';
        case 'domain_regex':
            return 'domain | domain_suffix | domain_keyword';
        case 'process_path':
            return 'process_name';
        case 'rule_set':
            return 'provider-placeholder';
        case 'script':
            return 'script-placeholder';
        default:
            return undefined;
    }
}
