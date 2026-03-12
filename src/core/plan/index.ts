import type { MigrationAnalysis } from '../types/migration-analysis';
import type { MigrationPlan } from '../types/migration-plan';
import type { NormalizedClashConfig } from '../types/normalized-clash';
import { planDns } from './dns';
import { planGroupOutbounds } from './groups';
import { planInbounds } from './inbounds';
import { applyPlanPatches } from './patches';
import { planProxyProviderOutbounds } from './providers';
import { planProxyOutbounds } from './proxies';
import { materializeRelayChains } from './relay';
import { planRouteRules } from './rules';
export * from './proxies';
export * from './providers';
export * from './groups';
export * from './rules';
export * from './dns';
export * from './inbounds';
export * from './patches';
export * from './repair';
export * from './relay';
export * from './rule-strategies';

export function buildMigrationPlan(
    config: NormalizedClashConfig,
    analysis: MigrationAnalysis
): MigrationPlan {
    const proxyResult = planProxyOutbounds(config.proxies, analysis);
    const providerResult = planProxyProviderOutbounds(config.providers.proxyProviders);
    const groupResult = planGroupOutbounds(
        config.groups,
        analysis,
        new Set([
            ...proxyResult.outbounds.map((outbound) => outbound.tag),
            ...providerResult.outbounds.map((outbound) => outbound.tag),
        ])
    );
    const routeResult = planRouteRules(
        config.rules,
        config.providers.ruleProviders,
        config.scriptShortcuts,
        analysis
    );
    const dnsResult = planDns(config.dns, analysis.runtime);
    const inboundResult = planInbounds(config.general, config.tun, analysis.runtime);

    const relayResult = materializeRelayChains(config.groups, [
        ...proxyResult.outbounds,
        ...providerResult.outbounds,
        ...groupResult.outbounds,
    ]);

    const plan: MigrationPlan = {
        profile: analysis.runtime.profile,
        inbounds: inboundResult.inbounds,
        outbounds: relayResult.outbounds,
        dns: dnsResult.dns,
        route: {
            id: crypto.randomUUID(),
            sourcePaths: config.rules.map((rule) => rule.sourcePath),
            status: 'exact',
            decision: 'normalized-map',
            notes: [],
            rules: routeResult.rules,
            ruleSets: routeResult.ruleSets,
            final: routeResult.final,
            autoDetectInterface: config.tun?.autoDetectInterface,
        },
        patches: [],
        repairs: [
            ...providerResult.repairs,
            ...groupResult.repairs,
            ...relayResult.repairs,
            ...routeResult.repairs,
            ...dnsResult.repairs,
        ],
        issues: [
            ...proxyResult.issues,
            ...providerResult.issues,
            ...groupResult.issues,
            ...relayResult.issues,
            ...routeResult.issues,
            ...dnsResult.issues,
            ...inboundResult.issues,
        ],
        decisions: [
            ...proxyResult.decisions,
            ...providerResult.decisions,
            ...groupResult.decisions,
            ...relayResult.decisions,
            ...routeResult.decisions,
            ...dnsResult.decisions,
            ...inboundResult.decisions,
        ],
    };

    return applyPlanPatches(plan);
}
