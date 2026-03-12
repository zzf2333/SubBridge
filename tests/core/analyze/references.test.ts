import { describe, expect, test } from 'bun:test';
import { analyzeReferences } from '../../../src/core/analyze/references';
import type { NormalizedClashConfig } from '../../../src/core/types/normalized-clash';

function createConfig(): NormalizedClashConfig {
    return {
        general: {
            mode: 'rule',
            ports: {},
        },
        proxies: [{
            id: 'p1',
            stableKey: 'proxy:proxies[0]:NodeA',
            name: 'NodeA',
            type: 'ss',
            server: 'example.com',
            port: 443,
            sourcePath: 'proxies[0]',
            raw: {},
            features: [],
            method: 'aes-128-gcm',
            password: 'pass',
        }],
        groups: [{
            id: 'g1',
            stableKey: 'group:proxy-groups[0]:Auto',
            name: 'Auto',
            type: 'select',
            members: [{ kind: 'unknown', name: 'NodeA' }],
            sourcePath: 'proxy-groups[0]',
            raw: {},
        }],
        rules: [{
            id: 'r1',
            stableKey: 'rule:rules[0]:MATCH,Auto',
            raw: 'MATCH,Auto',
            sourcePath: 'rules[0]',
            matcher: { type: 'match' },
            target: { kind: 'group', name: 'Auto' },
            options: { extra: {} },
        }],
        scriptShortcuts: {},
        providers: {
            ruleProviders: [],
            proxyProviders: [],
        },
        meta: {
            sourceFormat: 'clash',
            migratorVersion: '0.1.0-dev',
            parserWarnings: [],
        },
    };
}

describe('analyzeReferences', () => {
    test('resolves known group and proxy references without issues', () => {
        const result = analyzeReferences(createConfig());

        expect(result.graph.missingReferences).toHaveLength(0);
        expect(result.issues).toHaveLength(0);
    });

    test('detects missing references', () => {
        const config = createConfig();
        config.groups[0]!.members = [{ kind: 'unknown', name: 'MissingNode' }];

        const result = analyzeReferences(config);

        expect(result.graph.missingReferences).toHaveLength(1);
        expect(result.issues[0]?.code).toBe('MISSING_REFERENCE');
    });

    test('treats known provider members as resolved references', () => {
        const config = createConfig();
        config.groups[0]!.members = [{ kind: 'provider', name: 'remote-provider' }];
        config.providers.proxyProviders = [{
            id: 'provider-1',
            stableKey: 'provider:proxy-providers[0]:remote-provider',
            name: 'remote-provider',
            type: 'proxy',
            vehicle: 'http',
            sourcePath: 'proxy-providers.remote-provider',
            raw: {},
        }];

        const result = analyzeReferences(config);

        expect(result.graph.proxyProviderNames).toEqual(['remote-provider']);
        expect(result.graph.missingReferences).toHaveLength(0);
    });

    test('treats known RULE-SET providers as resolved references', () => {
        const config = createConfig();
        config.rules = [{
            id: 'r-rule-set',
            stableKey: 'rule:rules[0]:RULE-SET,google,Auto',
            raw: 'RULE-SET,google,Auto',
            sourcePath: 'rules[0]',
            matcher: { type: 'rule_set', value: 'google' },
            target: { kind: 'group', name: 'Auto' },
            options: { extra: {} },
        }];
        config.providers.ruleProviders = [{
            id: 'provider-rule-1',
            stableKey: 'provider:rule-providers[0]:google',
            name: 'google',
            type: 'rule',
            vehicle: 'http',
            sourcePath: 'rule-providers.google',
            raw: {},
        }];

        const result = analyzeReferences(config);

        expect(result.graph.ruleProviderNames).toEqual(['google']);
        expect(result.graph.missingReferences).toHaveLength(0);
    });
});
