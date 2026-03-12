import { describe, expect, test } from 'bun:test';
import { planDns } from '../../../src/core/plan/dns';
import type { RuntimeIntent } from '../../../src/core/types/migration-analysis';
import type { NormalizedDns } from '../../../src/core/types/normalized-clash';

const runtime: RuntimeIntent = {
    profile: 'mixed-client',
    requiresDns: true,
    requiresTun: false,
    requiresMixedInbound: true,
    reasoning: [],
};

describe('planDns', () => {
    test('plans DNS policy rules and notes', () => {
        const dns: NormalizedDns = {
            enabled: true,
            enhancedMode: 'fake-ip',
            nameservers: [{ type: 'udp', address: '8.8.8.8', source: 'nameserver' }],
            nameserverPolicy: {
                'geosite:cn,+.openai.com': [
                    { type: 'https', address: 'dns.example/dns-query', source: 'policy' },
                ],
            },
            sourcePath: 'dns',
        };

        const result = planDns(dns, runtime);

        expect(result.dns).toBeDefined();
        expect(result.dns?.servers.length).toBe(3);
        expect(result.dns?.rules).toHaveLength(2);
        expect(result.dns?.notes).toContain('enhanced-mode:fake-ip');
        expect(result.dns?.notes).toContain('fake-ip:partial-emission');
        expect(result.dns?.notes).toContain('default-domain-resolver:nameserver-udp-0');
        expect(result.dns?.final).toBe('fakeip');
        expect(result.dns?.defaultDomainResolver).toBe('nameserver-udp-0');
        expect(result.dns?.reverseMapping).toBe(true);
        expect(result.dns?.independentCache).toBe(true);
        expect(
            result.dns?.servers.some(
                (server) =>
                    server.tag === 'policy-https-1' &&
                    server.payload.domain_resolver === 'nameserver-udp-0'
            )
        ).toBe(true);
        expect(result.decisions.some((decision) => decision.summary.includes('DNS policy rules'))).toBe(true);
        expect(
            result.decisions.some((decision) =>
                decision.summary.includes('route.default_domain_resolver')
            )
        ).toBe(true);
        expect(result.decisions.some((decision) => decision.summary.includes('fake-ip'))).toBe(true);
        expect(result.issues.some((issue) => issue.message.includes('fake-ip mode is partially emitted'))).toBe(true);
        expect(result.repairs.some((repair) => repair.summary.includes('Rewrite fake-ip DNS mode'))).toBe(true);
    });

    test('records layered fake-ip degradations for range, filter, and respect-rules', () => {
        const dns: NormalizedDns = {
            enabled: true,
            enhancedMode: 'fake-ip',
            fakeIpRange: '198.18.0.1/16',
            fakeIpFilter: ['*.lan', '*.local', '*.n.n.srv.nintendo.net', 'xbox.*.*.microsoft.com'],
            fallbackFilter: {
                geoip: true,
                geoipCode: 'CN',
                ipcidr: ['240.0.0.0/4'],
            },
            respectRules: true,
            nameservers: [{ type: 'udp', address: '8.8.8.8', source: 'nameserver' }],
            sourcePath: 'dns',
        };

        const result = planDns(dns, runtime);

        expect(result.dns?.notes).toContain('fallback-filter:geoip:CN');
        expect(result.dns?.notes).toContain('fallback-filter:ipcidr:1');
        expect(result.dns?.notes).toContain('fake-ip-range emitted');
        expect(result.dns?.notes).toContain('fake-ip-filter partial:4');
        expect(result.dns?.notes).toContain('fake-ip:respect-rules not fully linked');
        expect(result.dns?.fakeip?.inet4Range).toBe('198.18.0.1/16');
        expect(result.dns?.rules).toHaveLength(4);
        expect(result.decisions.some((decision) => decision.summary.includes('respect-rules'))).toBe(true);
        expect(result.decisions.some((decision) => decision.summary.includes('fake-ip-range'))).toBe(true);
        expect(result.decisions.some((decision) => decision.summary.includes('fallback-filter'))).toBe(true);
        expect(result.repairs.some((repair) => repair.summary.includes('Rewrite fake-ip respect-rules'))).toBe(true);
        expect(result.repairs.some((repair) => repair.summary.includes('Rewrite fallback-filter'))).toBe(true);
    });
});
