import { describe, expect, test } from 'bun:test';
import { planInbounds } from '../../../src/core/plan/inbounds';
import type { RuntimeIntent } from '../../../src/core/types/migration-analysis';
import type { ClashGeneral, NormalizedTun } from '../../../src/core/types/normalized-clash';

const general: ClashGeneral = {
    mode: 'rule',
    ports: {},
};

describe('planInbounds', () => {
    test('plans tun inbound with normalized tun options', () => {
        const runtime: RuntimeIntent = {
            profile: 'tun-client',
            requiresDns: true,
            requiresTun: true,
            requiresMixedInbound: true,
            reasoning: [],
        };
        const tun: NormalizedTun = {
            enabled: true,
            stack: 'system',
            autoRoute: true,
            autoDetectInterface: true,
            dnsHijack: ['any:53'],
            strictRoute: true,
            mtu: 9000,
            sourcePath: 'tun',
        };

        const result = planInbounds(general, tun, runtime);
        const tunInbound = result.inbounds.find((inbound) => inbound.type === 'tun');
        const mixedInbound = result.inbounds.find((inbound) => inbound.type === 'mixed');

        expect(tunInbound).toBeDefined();
        expect(tunInbound?.options).toMatchObject({
            address: ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'],
            stack: 'system',
            auto_route: true,
            auto_detect_interface: true,
            strict_route: true,
            mtu: 9000,
            dns_hijack: ['any:53'],
        });
        expect(result.decisions.some((decision) => decision.summary.includes('tun inbound'))).toBe(true);
        expect(result.inbounds.some((inbound) => inbound.type === 'mixed')).toBe(true);
        expect(mixedInbound?.options).toMatchObject({
            set_system_proxy: false,
        });
    });
});
