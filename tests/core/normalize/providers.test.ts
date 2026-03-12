import { describe, expect, test } from 'bun:test';
import { normalizeProviders } from '../../../src/core/normalize/providers';

describe('normalizeProviders', () => {
    test('normalizes rule and proxy providers into explicit provider refs', () => {
        const result = normalizeProviders(
            {
                ruleset: {
                    type: 'http',
                    url: 'https://example.com/rules.yaml',
                },
            },
            {
                remote: {
                    type: 'file',
                    path: './providers/remote.yaml',
                },
            }
        );

        expect(result.ruleProviders).toHaveLength(1);
        expect(result.proxyProviders).toHaveLength(1);
        expect(result.ruleProviders[0]?.name).toBe('ruleset');
        expect(result.ruleProviders[0]?.type).toBe('rule');
        expect(result.ruleProviders[0]?.vehicle).toBe('http');
        expect(result.ruleProviders[0]?.url).toBe('https://example.com/rules.yaml');
        expect(result.proxyProviders[0]?.name).toBe('remote');
        expect(result.proxyProviders[0]?.type).toBe('proxy');
        expect(result.proxyProviders[0]?.vehicle).toBe('file');
        expect(result.proxyProviders[0]?.path).toBe('./providers/remote.yaml');
    });
});
