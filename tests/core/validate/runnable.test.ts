import { describe, expect, test } from 'bun:test';
import { validateRunnableConfig } from '../../../src/core/validate/runnable';
import type { MigrationPlan } from '../../../src/core/types/migration-plan';
import type { SingBoxConfig } from '../../../src/core/types/singbox';

function createPlan(profile: MigrationPlan['profile']): MigrationPlan {
    return {
        profile,
        inbounds: [],
        outbounds: [],
        dns: undefined,
        route: {
            id: 'route-1',
            sourcePaths: [],
            status: 'exact',
            decision: 'direct-map',
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

describe('validateRunnableConfig', () => {
    test('rejects missing outbounds and route final', () => {
        const result = validateRunnableConfig({}, createPlan('proxy-only'));

        expect(result.valid).toBe(false);
        expect(result.issues.some((issue) => issue.message.includes('No outbounds'))).toBe(true);
        expect(result.issues.some((issue) => issue.message.includes('route.final'))).toBe(true);
    });

    test('rejects missing mixed inbound for mixed-client profile', () => {
        const config: SingBoxConfig = {
            outbounds: [{ type: 'direct', tag: 'direct' }],
            route: { final: 'direct' },
        };

        const result = validateRunnableConfig(config, createPlan('mixed-client'));

        expect(result.valid).toBe(false);
        expect(result.issues.some((issue) => issue.message.includes('mixed inbound'))).toBe(true);
    });

    test('accepts runnable tun-client config', () => {
        const config: SingBoxConfig = {
            inbounds: [{ type: 'tun', tag: 'tun-in' }],
            outbounds: [{ type: 'direct', tag: 'direct' }],
            dns: { servers: [{ tag: 'dns-0', type: 'udp', server: '8.8.8.8' }] },
            route: { final: 'direct' },
        };
        const plan = createPlan('tun-client');

        const result = validateRunnableConfig(config, plan);

        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
    });
});
