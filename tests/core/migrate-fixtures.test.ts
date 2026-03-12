import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { migrateClashConfig } from '../../src/core/migrate';

const FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/test-configs');

describe('migrateClashConfig fixtures', () => {
    test('migrates complex dns/tun/group/rule fixture into runnable config with explainable degradations', () => {
        const input = readFileSync(join(FIXTURE_DIR, 'migration-complex.yaml'), 'utf-8');

        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
            emitIntermediateArtifacts: true,
        });

        expect(result.success).toBe(true);
        expect(result.runnable).toBe(true);
        expect(result.report.summary.profile).toBe('tun-client');
        expect(result.report.summary.degradedMappings).toBeGreaterThan(0);

        expect(result.config?.dns?.servers.length).toBeGreaterThanOrEqual(4);
        expect(result.config?.dns?.rules?.length).toBeGreaterThanOrEqual(2);
        expect(result.config?.dns?.strategy).toBe('ipv4_only');

        expect(result.config?.inbounds?.some((inbound) => inbound.type === 'tun')).toBe(true);
        expect(result.config?.inbounds?.some((inbound) => inbound.type === 'mixed')).toBe(true);
        expect(result.config?.outbounds?.some((outbound) => outbound.tag === 'RelayChain')).toBe(true);
        expect(result.config?.outbounds?.some((outbound) => outbound.tag === 'Proxy')).toBe(true);
        expect(result.config?.route?.final).toBe('Proxy');
        expect(result.config?.route?.geosite).toBeUndefined();

        expect(
            result.report.issues.some((issue) =>
                issue.message.includes('was dropped because sing-box 1.12 removed geosite database route matching')
            )
        ).toBe(true);
        expect(result.report.repairs.some((repair) => repair.summary.includes('Drop GEOSITE rule'))).toBe(true);
        expect(
            result.report.issues.some((issue) =>
                issue.message.includes('approximated as a domain keyword rule')
            )
        ).toBe(true);
        expect(
            result.report.issues.some((issue) =>
                issue.message.includes('approximated as process_name')
            )
        ).toBe(true);

        expect(
            result.report.behaviorChanges.some((change) =>
                change.summary.includes('RelayChain') || change.after.includes('relay degraded to selector')
            )
        ).toBe(true);
        expect(
            result.report.behaviorChanges.some((change) =>
                change.summary.includes('Drop GEOSITE rule')
            )
        ).toBe(true);

        expect(
            result.artifacts?.plan?.dns?.notes.some((note) => note.includes('enhanced-mode:fake-ip'))
        ).toBe(true);
        expect(
            result.artifacts?.plan?.dns?.notes.some((note) => note.includes('fake-ip:partial-emission'))
        ).toBe(true);
        expect(
            result.report.issues.some((issue) =>
                issue.message.includes('fake-ip mode is partially emitted in V1')
            )
        ).toBe(true);
        expect(
            result.report.repairs.some((repair) =>
                repair.summary.includes('Rewrite fake-ip DNS mode as partial sing-box fakeip emission')
            )
        ).toBe(true);
        expect(
            result.artifacts?.plan?.route.rules.some((rule) =>
                rule.notes.includes('degraded:domain-regex->domain_keyword')
            )
        ).toBe(true);
        expect(
            result.artifacts?.plan?.route.rules.some((rule) =>
                rule.notes.includes('degraded:process-path->process-name')
            )
        ).toBe(true);
    });

    test('keeps dirty fixture runnable while reporting broken references and repairing dns detour', () => {
        const input = readFileSync(join(FIXTURE_DIR, 'migration-dirty-runnable.yaml'), 'utf-8');

        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
            emitIntermediateArtifacts: true,
        });

        expect(result.success).toBe(true);
        expect(result.runnable).toBe(true);
        expect(result.report.summary.profile).toBe('mixed-client');
        expect(result.report.issues.some((issue) => issue.message.includes('Missing reference: MissingNode'))).toBe(true);
        expect(result.report.issues.some((issue) => issue.message.includes('Missing reference: MissingGroup'))).toBe(true);
        expect(result.report.issues.some((issue) => issue.message.includes('no valid members'))).toBe(true);
        expect(result.config?.outbounds?.some((outbound) => outbound.tag === 'EmptyGroup')).toBe(false);
        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'Proxy')).toEqual({
            type: 'selector',
            tag: 'Proxy',
            outbounds: ['NodeA'],
            default: 'NodeA',
        });
        const routeRules = result.config?.route?.rules ?? [];
        expect(
            routeRules.some((rule) => rule.protocol === 'dns' && rule.action === 'hijack-dns')
        ).toBe(true);
        expect(
            routeRules.some(
                (rule) =>
                    rule.clash_mode === 'direct' && rule.action === 'route' && rule.outbound === 'direct'
            )
        ).toBe(true);
        expect(
            routeRules.some(
                (rule) =>
                    rule.clash_mode === 'global' &&
                    rule.action === 'route' &&
                    (rule.outbound === 'proxy' || rule.outbound === result.config?.route?.final)
            )
        ).toBe(true);
        expect(result.config?.route?.rules?.[0]).toMatchObject({
            protocol: 'dns',
            action: 'hijack-dns',
        });
        expect(result.config?.dns?.servers.some((server) => server.detour === 'Proxy')).toBe(true);
        expect(result.report.behaviorChanges.some((change) => change.summary.includes('Repair DNS detour'))).toBe(true);
        expect(result.report.repairs.some((repair) => repair.summary.includes('Drop empty group EmptyGroup'))).toBe(true);
        expect(result.report.repairs.some((repair) => repair.summary.includes('Repair DNS detour'))).toBe(true);
    });

    test('repairs cyclic group fixture into runnable config while keeping cycle warnings', () => {
        const input = readFileSync(join(FIXTURE_DIR, 'migration-cyclic-groups.yaml'), 'utf-8');

        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
            emitIntermediateArtifacts: true,
        });

        expect(result.success).toBe(true);
        expect(result.runnable).toBe(true);
        expect(result.report.issues.some((issue) => issue.code === 'CIRCULAR_REFERENCE')).toBe(true);
        expect(result.config?.outbounds?.some((outbound) => outbound.tag === 'LoopA')).toBe(false);
        expect(result.config?.outbounds?.some((outbound) => outbound.tag === 'LoopB')).toBe(false);
        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'Proxy')).toEqual({
            type: 'selector',
            tag: 'Proxy',
            outbounds: ['NodeA'],
            default: 'NodeA',
        });
        expect(result.report.repairs.some((repair) => repair.summary.includes('Prune unresolved members from group Proxy'))).toBe(true);
    });

    test('keeps degraded feature fixture runnable while explaining fallback and provider gaps', () => {
        const input = readFileSync(join(FIXTURE_DIR, 'migration-degraded-features.yaml'), 'utf-8');

        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
            emitIntermediateArtifacts: true,
        });

        expect(result.success).toBe(true);
        expect(result.runnable).toBe(true);
        expect(result.report.summary.degradedMappings).toBeGreaterThan(0);
        expect(result.report.issues.some((issue) => issue.code === 'INVALID_DNS_SERVER')).toBe(true);
        expect(result.report.issues.some((issue) => issue.code === 'UNRESOLVABLE_DEPENDENCY')).toBe(true);
        expect(result.artifacts?.normalized?.providers.proxyProviders).toHaveLength(1);
        expect(result.artifacts?.analysis.graph.proxyProviderNames).toEqual(['remote-provider']);
        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'remote-provider')).toEqual({
            type: 'selector',
            tag: 'remote-provider',
            outbounds: ['direct'],
            default: 'direct',
        });

        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'AutoFallback')).toEqual({
            type: 'urltest',
            tag: 'AutoFallback',
            outbounds: ['NodeA', 'NodeB'],
            url: 'https://www.gstatic.com/generate_204',
            interval: '300s',
        });
        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'Balanced')).toEqual({
            type: 'selector',
            tag: 'Balanced',
            outbounds: ['AutoFallback', 'NodeA'],
            default: 'AutoFallback',
        });
        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'ProviderBacked')).toEqual({
            type: 'selector',
            tag: 'ProviderBacked',
            outbounds: ['remote-provider'],
            default: 'remote-provider',
        });
        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'Proxy')).toEqual({
            type: 'selector',
            tag: 'Proxy',
            outbounds: ['Balanced', 'ProviderBacked', 'NodeB'],
            default: 'Balanced',
        });

        expect(
            result.report.behaviorChanges.some((change) =>
                change.after.includes('fallback degraded to urltest')
            )
        ).toBe(true);
        expect(
            result.report.behaviorChanges.some((change) =>
                change.after.includes('load-balance degraded to selector')
            )
        ).toBe(true);
        expect(
            result.report.issues.some((issue) =>
                issue.message.includes('provider members that are not expanded in V1')
            )
        ).toBe(false);
        expect(
            result.report.repairs.some((repair) =>
                repair.summary.includes('Rewrite proxy-provider remote-provider as direct placeholder outbound')
            )
        ).toBe(true);
    });

    test('repairs layered provider and fake-ip fixture into runnable output with explicit DNS and group repairs', () => {
        const input = readFileSync(join(FIXTURE_DIR, 'migration-provider-fakeip-layered.yaml'), 'utf-8');

        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
            emitIntermediateArtifacts: true,
        });

        expect(result.success).toBe(true);
        expect(result.runnable).toBe(true);
        expect(result.report.summary.profile).toBe('mixed-client');
        expect(result.artifacts?.normalized?.providers.proxyProviders).toHaveLength(2);
        expect(result.artifacts?.analysis.graph.proxyProviderNames).toEqual(['remote-a', 'remote-b']);

        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'remote-a')).toEqual({
            type: 'selector',
            tag: 'remote-a',
            outbounds: ['direct'],
            default: 'direct',
        });
        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'ProviderLeaf')).toEqual({
            type: 'selector',
            tag: 'ProviderLeaf',
            outbounds: ['remote-a', 'remote-b'],
            default: 'remote-a',
        });
        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'ProviderParent')).toEqual({
            type: 'selector',
            tag: 'ProviderParent',
            outbounds: ['ProviderLeaf'],
            default: 'ProviderLeaf',
        });
        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'Proxy')).toEqual({
            type: 'selector',
            tag: 'Proxy',
            outbounds: ['ProviderParent', 'NodeA'],
            default: 'ProviderParent',
        });

        expect(result.config?.dns?.servers.some((server) => server.detour === 'Proxy')).toBe(true);
        expect(result.artifacts?.plan?.dns?.notes).toContain('fake-ip:partial-emission');
        expect(result.artifacts?.plan?.dns?.notes).toContain('fake-ip-range emitted');
        expect(result.artifacts?.plan?.dns?.notes).toContain('fake-ip-filter partial:2');
        expect(result.artifacts?.plan?.dns?.notes).toContain('fake-ip:respect-rules not fully linked');
        expect(result.config?.dns?.final).toBe('fakeip');

        expect(result.report.issues.some((issue) => issue.code === 'UNRESOLVABLE_DEPENDENCY')).toBe(true);
        expect(result.report.issues.some((issue) => issue.code === 'INVALID_DNS_SERVER')).toBe(true);
        expect(result.report.repairs.some((repair) => repair.summary.includes('Rewrite proxy-provider remote-a as direct placeholder outbound'))).toBe(true);
        expect(result.report.repairs.some((repair) => repair.summary.includes('Rewrite proxy-provider remote-b as direct placeholder outbound'))).toBe(true);
        expect(result.report.repairs.some((repair) => repair.summary.includes('Rewrite fake-ip DNS mode as partial sing-box fakeip emission'))).toBe(true);
        expect(result.report.repairs.some((repair) => repair.summary.includes('Repair DNS detour'))).toBe(true);
    });

    test('repairs provider and cycle fixture into runnable output while pruning cycle edges and preserving provider placeholders', () => {
        const input = readFileSync(join(FIXTURE_DIR, 'migration-provider-cycle.yaml'), 'utf-8');

        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
            emitIntermediateArtifacts: true,
        });

        expect(result.success).toBe(true);
        expect(result.runnable).toBe(true);
        expect(result.artifacts?.normalized?.providers.proxyProviders).toHaveLength(1);
        expect(result.report.issues.some((issue) => issue.code === 'CIRCULAR_REFERENCE')).toBe(true);
        expect(result.report.issues.some((issue) => issue.code === 'UNRESOLVABLE_DEPENDENCY')).toBe(true);

        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'remote-a')).toEqual({
            type: 'selector',
            tag: 'remote-a',
            outbounds: ['direct'],
            default: 'direct',
        });
        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'ProviderLeaf')).toEqual({
            type: 'selector',
            tag: 'ProviderLeaf',
            outbounds: ['remote-a'],
            default: 'remote-a',
        });
        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'LoopA')).toEqual({
            type: 'selector',
            tag: 'LoopA',
            outbounds: ['ProviderLeaf'],
            default: 'ProviderLeaf',
        });
        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'LoopB')).toEqual({
            type: 'selector',
            tag: 'LoopB',
            outbounds: ['LoopA'],
            default: 'LoopA',
        });
        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'Proxy')).toEqual({
            type: 'selector',
            tag: 'Proxy',
            outbounds: ['LoopA', 'NodeA'],
            default: 'LoopA',
        });

        expect(
            result.report.repairs.some((repair) =>
                repair.summary.includes('Rewrite proxy-provider remote-a as direct placeholder outbound')
            )
        ).toBe(true);
        expect(
            result.report.repairs.some((repair) =>
                repair.summary.includes('Prune unresolved members from group LoopA')
            )
        ).toBe(true);
        expect(
            result.report.repairs.some((repair) =>
                repair.summary.includes('Rewrite proxy-provider remote-a as direct placeholder outbound')
            )
        ).toBe(true);
    });
});
