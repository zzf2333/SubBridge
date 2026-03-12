import { describe, expect, test } from 'bun:test';
import { normalizeDns } from '../../../src/core/normalize/dns';

describe('normalizeDns', () => {
    test('normalizes nameserver-policy entries', () => {
        const result = normalizeDns({
            nameserver: ['8.8.8.8'],
            'nameserver-policy': {
                'geosite:cn': ['https://dns.example/dns-query'],
                '+.openai.com': ['tls://1.1.1.1'],
            },
        });

        expect(result.dns?.nameserverPolicy?.['geosite:cn']?.[0]).toEqual({
            type: 'https',
            address: 'dns.example/dns-query',
            source: 'policy',
        });
        expect(result.dns?.nameserverPolicy?.['+.openai.com']?.[0]).toEqual({
            type: 'tls',
            address: '1.1.1.1',
            source: 'policy',
        });
    });

    test('normalizes fallback-filter entries', () => {
        const result = normalizeDns({
            nameserver: ['8.8.8.8'],
            'fallback-filter': {
                geoip: true,
                'geoip-code': 'CN',
                ipcidr: ['240.0.0.0/4'],
            },
        });

        expect(result.dns?.fallbackFilter).toEqual({
            geoip: true,
            geoipCode: 'CN',
            ipcidr: ['240.0.0.0/4'],
        });
    });
});
