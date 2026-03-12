import { describe, expect, test } from 'bun:test';
import { planGroupOutbounds } from '../../../src/core/plan/groups';
import { materializeRelayChains } from '../../../src/core/plan/relay';
import type { MigrationAnalysis } from '../../../src/core/types/migration-analysis';
import type { NormalizedGroup } from '../../../src/core/types/normalized-clash';

function createAnalysis(): MigrationAnalysis {
    return {
        graph: {
            proxyNames: ['NodeA', 'NodeB'],
            groupNames: ['RelayChain'],
            proxyProviderNames: [],
            ruleProviderNames: [],
            ruleTargets: [],
            groupDependencies: [],
            routeDependencies: [],
            missingReferences: [],
            circularReferences: [],
        },
        capabilities: {
            proxies: {},
            groups: {
                'group-relay': {
                    status: 'degraded',
                    groupType: 'relay',
                    supportedFeatures: [],
                    unsupportedFeatures: [],
                    degradations: ['relay lowered to selector in V1'],
                    recommendedFallback: 'selector',
                },
            },
            rules: {},
        },
        runtime: {
            profile: 'mixed-client',
            requiresDns: false,
            requiresTun: false,
            requiresMixedInbound: true,
            reasoning: [],
        },
        objectStatuses: {
            proxies: {},
            groups: {
                'group-relay': 'degraded',
            },
            rules: {},
            dns: undefined,
            tun: undefined,
        },
    };
}

describe('planGroupOutbounds', () => {
    test('degrades relay groups to selector with explicit issue and decision', () => {
        const groups: NormalizedGroup[] = [{
            id: 'group-relay',
            stableKey: 'group:proxy-groups[0]:RelayChain',
            name: 'RelayChain',
            type: 'relay',
            members: [
                { kind: 'proxy', name: 'NodeA' },
                { kind: 'proxy', name: 'NodeB' },
            ],
            sourcePath: 'proxy-groups[0]',
            raw: {},
            strategy: {
                expectedBehavior: 'relay',
            },
        }];

        const result = planGroupOutbounds(groups, createAnalysis(), new Set(['NodeA', 'NodeB']));

        expect(result.outbounds).toHaveLength(1);
        expect(result.outbounds[0]).toMatchObject({
            type: 'selector',
            tag: 'RelayChain',
            payload: {
                outbounds: ['NodeA', 'NodeB'],
                default: 'NodeA',
            },
        });
        expect(result.outbounds[0]?.notes).toContain('relay degraded to selector');
        expect(result.outbounds[0]?.notes).toContain('relay-chain semantics are not implemented in V1');

        expect(
            result.issues.some((issue) =>
                issue.objectName === 'RelayChain'
                && issue.message.includes('relay semantics that are not implemented in V1')
            )
        ).toBe(true);
        expect(
            result.decisions.some((decision) =>
                decision.summary === 'Degrade relay group RelayChain to selector'
            )
        ).toBe(true);

        const materialized = materializeRelayChains(groups, [
            {
                id: 'proxy-a',
                sourcePaths: ['proxies[0]'],
                status: 'exact',
                decision: 'normalized-map',
                notes: [],
                type: 'shadowsocks',
                tag: 'NodeA',
                payload: {
                    server: 'a.example.com',
                    server_port: 8388,
                    method: 'aes-256-gcm',
                    password: 'pass-a',
                },
            },
            {
                id: 'proxy-b',
                sourcePaths: ['proxies[1]'],
                status: 'exact',
                decision: 'normalized-map',
                notes: [],
                type: 'vmess',
                tag: 'NodeB',
                payload: {
                    server: 'b.example.com',
                    server_port: 443,
                    uuid: 'test-uuid',
                },
            },
            ...result.outbounds,
        ]);
        expect(materialized.outbounds.find((outbound) => outbound.tag === 'RelayChain')).toMatchObject({
            type: 'vmess',
            tag: 'RelayChain',
            payload: expect.objectContaining({
                server: 'b.example.com',
                detour: 'RelayChain::relay::1::NodeA',
            }),
        });
        expect(materialized.outbounds.find((outbound) => outbound.tag === 'RelayChain::relay::1::NodeA')).toMatchObject({
            type: 'shadowsocks',
            tag: 'RelayChain::relay::1::NodeA',
            payload: expect.objectContaining({
                server: 'a.example.com',
            }),
        });
        expect(
            materialized.repairs.some((repair) =>
                repair.summary === 'Rewrite relay group RelayChain as chained detour outbounds'
            )
        ).toBe(true);
    });

    test('keeps DIRECT and REJECT members as direct/block tags', () => {
        const groups: NormalizedGroup[] = [{
            id: 'group-select',
            stableKey: 'group:proxy-groups[0]:Proxy',
            name: 'Proxy',
            type: 'select',
            members: [
                { kind: 'proxy', name: 'NodeA' },
                { kind: 'unknown', name: 'DIRECT' },
                { kind: 'unknown', name: 'REJECT' },
            ],
            sourcePath: 'proxy-groups[0]',
            raw: {},
        }];

        const result = planGroupOutbounds(groups, createAnalysis(), new Set(['NodeA']));

        expect(result.outbounds).toHaveLength(1);
        expect(result.outbounds[0]).toMatchObject({
            type: 'selector',
            tag: 'Proxy',
            payload: {
                outbounds: ['NodeA', 'direct', 'block'],
                default: 'NodeA',
            },
        });
    });

    test('keeps provider-only groups runnable by preserving provider placeholder members', () => {
        const analysis = createAnalysis();
        analysis.graph.groupNames = ['HK', 'Proxy'];
        analysis.graph.proxyProviderNames = ['Remote'];
        analysis.objectStatuses.groups = {
            'group-hk': 'degraded',
            'group-proxy': 'degraded',
        };
        analysis.capabilities.groups = {
            'group-hk': {
                status: 'degraded',
                groupType: 'url-test',
                supportedFeatures: [],
                unsupportedFeatures: [],
                degradations: ['provider-backed members require placeholder handling in V1'],
            },
            'group-proxy': {
                status: 'degraded',
                groupType: 'select',
                supportedFeatures: [],
                unsupportedFeatures: [],
                degradations: ['provider-backed members require placeholder handling in V1'],
            },
        };

        const groups: NormalizedGroup[] = [
            {
                id: 'group-hk',
                stableKey: 'group:proxy-groups[0]:HK',
                name: 'HK',
                type: 'url-test',
                members: [{ kind: 'provider', name: 'Remote' }],
                sourcePath: 'proxy-groups[0]',
                raw: {},
                strategy: { expectedBehavior: 'latency-test' },
            },
            {
                id: 'group-proxy',
                stableKey: 'group:proxy-groups[1]:Proxy',
                name: 'Proxy',
                type: 'select',
                members: [
                    { kind: 'group', name: 'HK' },
                    { kind: 'unknown', name: 'DIRECT' },
                ],
                sourcePath: 'proxy-groups[1]',
                raw: {},
            },
        ];

        const result = planGroupOutbounds(groups, analysis, new Set(['Remote']));

        expect(result.outbounds.find((item) => item.tag === 'HK')).toMatchObject({
            type: 'urltest',
            payload: {
                outbounds: ['Remote'],
            },
        });
        expect(result.outbounds.find((item) => item.tag === 'Proxy')).toMatchObject({
            type: 'selector',
            payload: {
                outbounds: ['HK', 'direct'],
                default: 'HK',
            },
        });
        expect(
            result.issues.some((issue) =>
                issue.message.includes('falls back to direct because provider members are not expanded in V1')
            )
        ).toBe(false);
    });
});
