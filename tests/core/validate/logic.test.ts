import { describe, expect, test } from 'bun:test';
import { validateLogicalReferences } from '../../../src/core/validate/logic';
import type { SingBoxConfig } from '../../../src/core/types/singbox';

describe('validateLogicalReferences', () => {
    test('accepts closed outbound and DNS references', () => {
        const config: SingBoxConfig = {
            outbounds: [
                { type: 'direct', tag: 'direct' },
                { type: 'selector', tag: 'proxy', outbounds: ['direct'], default: 'direct' },
            ],
            dns: {
                servers: [{ tag: 'dns-0', type: 'udp', server: '8.8.8.8', detour: 'direct' }],
                rules: [{ server: 'dns-0', outbound: 'proxy' }],
                final: 'dns-0',
            },
            route: {
                rules: [{ outbound: 'proxy', domain_suffix: ['google.com'] }],
                final: 'proxy',
            },
        };

        const result = validateLogicalReferences(config);

        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
    });

    test('reports missing outbound and DNS references', () => {
        const config: SingBoxConfig = {
            outbounds: [
                { type: 'selector', tag: 'proxy', outbounds: ['missing'], default: 'missing' },
            ],
            dns: {
                servers: [{ tag: 'dns-0', type: 'udp', server: '8.8.8.8', detour: 'ghost' }],
                rules: [{ server: 'dns-missing', outbound: 'ghost' }],
                final: 'dns-missing',
            },
            route: {
                rules: [{ outbound: 'ghost' }],
                final: 'ghost',
            },
        };

        const result = validateLogicalReferences(config);

        expect(result.valid).toBe(false);
        expect(result.issues.some((issue) => issue.message.includes('missing outbound'))).toBe(true);
        expect(result.issues.some((issue) => issue.message.includes('missing server'))).toBe(true);
        expect(result.issues.some((issue) => issue.message.includes('detour'))).toBe(true);
    });

    test('reports broken DNS rule server and outbound references explicitly', () => {
        const config: SingBoxConfig = {
            outbounds: [
                { type: 'direct', tag: 'direct' },
                { type: 'selector', tag: 'proxy', outbounds: ['direct'], default: 'direct' },
            ],
            dns: {
                servers: [{ tag: 'dns-0', type: 'udp', server: '8.8.8.8', detour: 'direct' }],
                rules: [
                    { server: 'dns-missing', outbound: 'proxy' },
                    { server: 'dns-0', outbound: ['ghost', 'proxy'] },
                ],
                final: 'dns-0',
            },
            route: {
                final: 'proxy',
            },
        };

        const result = validateLogicalReferences(config);

        expect(result.valid).toBe(false);
        expect(
            result.issues.some((issue) =>
                issue.message.includes('DNS rule references missing server "dns-missing"')
            )
        ).toBe(true);
        expect(
            result.issues.some((issue) =>
                issue.message.includes('DNS rule references missing outbound "ghost"')
            )
        ).toBe(true);
        expect(
            result.issues.filter((issue) => issue.module === 'dns').every((issue) => issue.level === 'fatal')
        ).toBe(true);
    });

    test('reports circular outbound references', () => {
        const config: SingBoxConfig = {
            outbounds: [
                { type: 'selector', tag: 'LoopA', outbounds: ['LoopB'], default: 'LoopB' },
                { type: 'selector', tag: 'LoopB', outbounds: ['LoopA'], default: 'LoopA' },
                { type: 'direct', tag: 'direct' },
            ],
            route: { final: 'direct' },
        };

        const result = validateLogicalReferences(config);

        expect(result.valid).toBe(false);
        expect(result.issues.some((issue) => issue.code === 'CIRCULAR_REFERENCE')).toBe(true);
    });

    test('reports missing route rule_set references explicitly', () => {
        const config: SingBoxConfig = {
            outbounds: [
                { type: 'direct', tag: 'direct' },
            ],
            route: {
                rule_set: [{ type: 'inline', tag: 'known-set', rules: [] }],
                rules: [{ outbound: 'direct', rule_set: 'missing-set' }],
                final: 'direct',
            },
        };

        const result = validateLogicalReferences(config);

        expect(result.valid).toBe(false);
        expect(
            result.issues.some((issue) =>
                issue.message.includes('Route rule references missing rule_set "missing-set"')
            )
        ).toBe(true);
    });
});
