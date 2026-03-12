import { describe, expect, test } from 'bun:test';
import { applyPlanPatches } from '../../../src/core/plan/patches';
import type { MigrationPlan } from '../../../src/core/types/migration-plan';

function createPlan(): MigrationPlan {
    return {
        profile: 'mixed-client',
        inbounds: [],
        outbounds: [{
            id: 'o1',
            sourcePaths: ['proxies[0]'],
            status: 'exact',
            decision: 'normalized-map',
            notes: [],
            type: 'vmess',
            tag: 'NodeA',
            payload: {
                server: 'example.com',
                server_port: 443,
            },
        }],
        dns: undefined,
        route: {
            id: 'route-1',
            sourcePaths: [],
            status: 'exact',
            decision: 'normalized-map',
            notes: [],
            rules: [],
            ruleSets: [],
            final: undefined,
        },
        patches: [],
        repairs: [],
        issues: [],
        decisions: [],
    };
}

describe('applyPlanPatches', () => {
    test('adds default proxy selector and route final', () => {
        const patched = applyPlanPatches(createPlan());

        expect(patched.outbounds.some((outbound) => outbound.tag === 'proxy')).toBe(true);
        expect(patched.route.final).toBe('proxy');
    });

    test('adds direct and block outbounds', () => {
        const patched = applyPlanPatches(createPlan());

        expect(patched.outbounds.some((outbound) => outbound.tag === 'direct')).toBe(true);
        expect(patched.outbounds.some((outbound) => outbound.tag === 'block')).toBe(true);
    });

    test('repairs invalid DNS detour references', () => {
        const plan = createPlan();
        plan.dns = {
            id: 'dns-1',
            sourcePaths: ['dns'],
            status: 'exact',
            decision: 'normalized-map',
            notes: [],
            servers: [{
                tag: 'dns-0',
                type: 'udp',
                payload: {
                    type: 'udp',
                    server: '8.8.8.8',
                    detour: 'missing',
                },
                sourcePaths: ['dns'],
            }],
            rules: [],
            final: 'dns-0',
        };

        const patched = applyPlanPatches(plan);

        expect(patched.dns?.servers[0]?.payload.detour).toBe('proxy');
        expect(patched.patches.some((patch) => patch.kind === 'repair-dns-detour')).toBe(true);
        expect(patched.repairs.some((repair) => repair.summary.includes('Repair DNS detour'))).toBe(true);
    });

    test('drops route rules that reference missing outbounds after planning', () => {
        const plan = createPlan();
        plan.route.rules = [{
            id: 'rule-1',
            sourcePaths: ['rules[0]'],
            status: 'exact',
            notes: [],
            payload: {
                domain_suffix: ['example.com'],
                outbound: 'GhostGroup',
            },
        }];

        const patched = applyPlanPatches(plan);

        expect(
            patched.route.rules.some(
                (rule) => (rule.payload.outbound as string | undefined) === 'GhostGroup'
            )
        ).toBe(false);
        expect(
            patched.route.rules.some((rule) => rule.payload.clash_mode === 'direct')
        ).toBe(true);
        expect(
            patched.route.rules.some((rule) => rule.payload.clash_mode === 'global')
        ).toBe(true);
        expect(patched.patches.some((patch) => patch.kind === 'prune-invalid-route-rule')).toBe(true);
        expect(
            patched.repairs.some((repair) =>
                repair.summary.includes('Drop route rule with missing outbound "GhostGroup"')
            )
        ).toBe(true);
    });

    test('adds protocol dns hijack guard rule for dns-enabled plans', () => {
        const plan = createPlan();
        plan.dns = {
            id: 'dns-1',
            sourcePaths: ['dns'],
            status: 'exact',
            decision: 'normalized-map',
            notes: [],
            servers: [{
                tag: 'dns-0',
                type: 'udp',
                payload: {
                    type: 'udp',
                    server: '8.8.8.8',
                },
                sourcePaths: ['dns'],
            }],
            rules: [],
            final: 'dns-0',
        };
        plan.route.rules = [{
            id: 'rule-direct-lan',
            sourcePaths: ['rules[0]'],
            status: 'exact',
            notes: [],
            payload: {
                ip_cidr: ['172.16.0.0/12'],
                outbound: 'direct',
            },
        }];

        const patched = applyPlanPatches(plan);

        expect(patched.outbounds.some((outbound) => outbound.type === 'dns')).toBe(false);
        expect(patched.route.rules[0]?.payload).toMatchObject({
            protocol: 'dns',
            action: 'hijack-dns',
        });
        expect(patched.patches.some((patch) => patch.kind === 'add-dns-route-rule')).toBe(true);
    });

    test('adds default auto urltest for large subscriptions without urltest groups', () => {
        const plan = createPlan();
        plan.outbounds = Array.from({ length: 10 }, (_, index) => ({
            id: `o${index}`,
            sourcePaths: [`proxies[${index}]`],
            status: 'exact',
            decision: 'normalized-map',
            notes: [],
            type: 'vmess',
            tag: `Node${index}`,
            payload: {
                server: `example-${index}.com`,
                server_port: 443,
            },
        }));

        const patched = applyPlanPatches(plan);
        const auto = patched.outbounds.find((outbound) => outbound.tag === 'Auto');
        const proxySelector = patched.outbounds.find((outbound) => outbound.tag === 'proxy');

        expect(auto).toMatchObject({
            type: 'urltest',
            payload: {
                url: 'https://www.gstatic.com/generate_204',
                interval: '300s',
            },
        });
        expect(proxySelector).toMatchObject({
            type: 'selector',
        });
        expect((proxySelector?.payload.outbounds as string[])[0]).toBe('Auto');
        expect(proxySelector?.payload.default).toBe('Auto');
        expect(
            patched.patches.some((patch) => patch.kind === 'add-auto-urltest-outbound')
        ).toBe(true);
    });

    test('binds auto urltest to route-referenced selector groups', () => {
        const plan = createPlan();
        const nodes = Array.from({ length: 10 }, (_, index) => ({
            id: `o${index}`,
            sourcePaths: [`proxies[${index}]`],
            status: 'exact' as const,
            decision: 'normalized-map' as const,
            notes: [],
            type: 'vmess',
            tag: `Node${index}`,
            payload: {
                server: `example-${index}.com`,
                server_port: 443,
            },
        }));
        plan.outbounds = [
            ...nodes,
            {
                id: 'selector-proxies',
                sourcePaths: ['proxy-groups[0]'],
                status: 'exact',
                decision: 'normalized-map',
                notes: [],
                type: 'selector',
                tag: 'Proxies',
                payload: {
                    outbounds: nodes.map((node) => node.tag),
                    default: 'Node0',
                },
            },
        ];
        plan.route.rules = [{
            id: 'rule-youtube',
            sourcePaths: ['rules[0]'],
            status: 'exact',
            notes: [],
            payload: {
                domain_suffix: ['youtube.com'],
                outbound: 'Proxies',
            },
        }];
        plan.route.final = 'Proxies';

        const patched = applyPlanPatches(plan);
        const proxiesSelector = patched.outbounds.find((outbound) => outbound.tag === 'Proxies');

        expect(proxiesSelector?.type).toBe('selector');
        expect((proxiesSelector?.payload.outbounds as string[])[0]).toBe('Auto');
        expect(proxiesSelector?.payload.default).toBe('Auto');
    });
});
