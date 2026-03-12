import { describe, expect, test } from 'bun:test';
import { join } from 'path';
import { planRouteRules } from '../../../src/core/plan/rules';
import { buildRuleStrategyFromMatcher } from '../../../src/core/plan/rule-strategies';
import type { MigrationAnalysis } from '../../../src/core/types/migration-analysis';
import type { NormalizedRule } from '../../../src/core/types/normalized-clash';

const analysis: MigrationAnalysis = {
    graph: {
        proxyNames: ['NodeA'],
        groupNames: ['Proxy'],
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
        groups: {},
        rules: {},
    },
    runtime: {
        profile: 'mixed-client',
        requiresDns: true,
        requiresTun: false,
        requiresMixedInbound: true,
        reasoning: [],
    },
    objectStatuses: {
        proxies: {},
        groups: {},
        rules: {
            r1: 'exact',
            r2: 'exact',
            r3: 'degraded',
            r4: 'degraded',
            r5: 'degraded',
            r6: 'exact',
        },
    },
    issues: [],
};

describe('planRouteRules', () => {
    test('lowers MATCH to route final', () => {
        const rules: NormalizedRule[] = [{
            id: 'r1',
            stableKey: 'rule:rules[0]:MATCH,Proxy',
            raw: 'MATCH,Proxy',
            sourcePath: 'rules[0]',
            matcher: { type: 'match' },
            target: { kind: 'group', name: 'Proxy' },
            options: { extra: {} },
        }];

        const result = planRouteRules(rules, [], {}, analysis);

        expect(result.final).toBe('Proxy');
        expect(result.rules).toHaveLength(0);
    });

    test('lowers DOMAIN-SUFFIX rule to route payload', () => {
        const rules: NormalizedRule[] = [{
            id: 'r2',
            stableKey: 'rule:rules[1]:DOMAIN-SUFFIX,google.com,NodeA',
            raw: 'DOMAIN-SUFFIX,google.com,NodeA',
            sourcePath: 'rules[1]',
            matcher: { type: 'domain_suffix', value: 'google.com' },
            target: { kind: 'proxy', name: 'NodeA' },
            options: { extra: {} },
        }];

        const result = planRouteRules(rules, [], {}, analysis);

        expect(result.rules).toHaveLength(1);
        expect(result.rules[0]?.payload).toEqual({
            domain_suffix: ['google.com'],
            outbound: 'NodeA',
        });
    });

    test('drops geosite rule and reports sing-box 1.12 compatibility fallback', () => {
        const rules: NormalizedRule[] = [{
            id: 'r3',
            stableKey: 'rule:rules[2]:GEOSITE,cn,Proxy',
            raw: 'GEOSITE,cn,Proxy',
            sourcePath: 'rules[2]',
            matcher: { type: 'geosite', value: 'cn' },
            target: { kind: 'group', name: 'Proxy' },
            options: { extra: {} },
        }];

        const result = planRouteRules(rules, [], {}, analysis);

        expect(result.rules).toHaveLength(0);
        expect(result.issues[0]?.message).toContain('was dropped because sing-box 1.12 removed geosite database route matching');
        expect(result.decisions[0]?.kind).toBe('drop-unsupported');
        expect(result.repairs[0]?.summary).toContain('Drop GEOSITE rule cn');
    });

    test('approximates simple domain regex as domain keyword rule', () => {
        const rules: NormalizedRule[] = [{
            id: 'r4',
            stableKey: 'rule:rules[3]:DOMAIN-REGEX,^.*openai.*$,NodeA',
            raw: 'DOMAIN-REGEX,^.*openai.*$,NodeA',
            sourcePath: 'rules[3]',
            matcher: { type: 'domain_regex', value: '^.*openai.*$' },
            target: { kind: 'proxy', name: 'NodeA' },
            options: { extra: {} },
        }];

        const result = planRouteRules(rules, [], {}, analysis);

        expect(result.rules).toHaveLength(1);
        expect(result.rules[0]?.status).toBe('degraded');
        expect(result.rules[0]?.notes).toContain('degraded:domain-regex->domain_keyword');
        expect(result.rules[0]?.payload).toEqual({
            domain_keyword: ['openai'],
            outbound: 'NodeA',
        });
        expect(result.decisions[0]?.kind).toBe('fallback-map');
    });

    test('approximates anchored domain regex as exact domain rule', () => {
        const strategy = buildRuleStrategyFromMatcher(
            { type: 'domain_regex', value: '^api.openai.com$' },
            'NodeA'
        );

        expect(strategy).not.toBeNull();
        expect(strategy?.notes).toContain('degraded:domain-regex->domain');
        expect(strategy?.payload).toEqual({
            domain: ['api.openai.com'],
            outbound: 'NodeA',
        });
    });

    test('approximates suffix domain regex as domain_suffix rule', () => {
        const strategy = buildRuleStrategyFromMatcher(
            { type: 'domain_regex', value: '^.*\\.openai.com$' },
            'NodeA'
        );

        expect(strategy).not.toBeNull();
        expect(strategy?.notes).toContain('degraded:domain-regex->domain_suffix');
        expect(strategy?.payload).toEqual({
            domain_suffix: ['openai.com'],
            outbound: 'NodeA',
        });
    });

    test('approximates process path as process name rule', () => {
        const rules: NormalizedRule[] = [{
            id: 'r5',
            stableKey: 'rule:rules[4]:PROCESS-PATH,/Applications/Arc.app/Contents/MacOS/Arc,NodeA',
            raw: 'PROCESS-PATH,/Applications/Arc.app/Contents/MacOS/Arc,NodeA',
            sourcePath: 'rules[4]',
            matcher: { type: 'process_path', value: '/Applications/Arc.app/Contents/MacOS/Arc' },
            target: { kind: 'proxy', name: 'NodeA' },
            options: { extra: {} },
        }];

        const result = planRouteRules(rules, [], {}, analysis);

        expect(result.rules).toHaveLength(1);
        expect(result.rules[0]?.notes).toContain('degraded:process-path->process-name');
        expect(result.rules[0]?.payload).toEqual({
            process_name: 'Arc',
            outbound: 'NodeA',
        });
    });

    test('approximates process path list as process name list', () => {
        const strategy = buildRuleStrategyFromMatcher(
            {
                type: 'process_path',
                value: [
                    '/Applications/Arc.app/Contents/MacOS/Arc',
                    'C:\\Program Files\\Chrome\\chrome.exe',
                ],
            },
            'NodeA'
        );

        expect(strategy).not.toBeNull();
        expect(strategy?.payload).toEqual({
            process_name: ['Arc', 'chrome'],
            outbound: 'NodeA',
        });
    });

    test('drops unapproximable domain regex rule', () => {
        const rules: NormalizedRule[] = [{
            id: 'r6',
            stableKey: 'rule:rules[5]:DOMAIN-REGEX,^(foo|bar)\\\\.com$,NodeA',
            raw: 'DOMAIN-REGEX,^(foo|bar)\\\\.com$,NodeA',
            sourcePath: 'rules[5]',
            matcher: { type: 'domain_regex', value: '^(foo|bar)\\\\.com$' },
            target: { kind: 'proxy', name: 'NodeA' },
            options: { extra: {} },
        }];

        const result = planRouteRules(rules, [], {}, analysis);

        expect(result.rules).toHaveLength(0);
        expect(result.issues[0]?.code).toBe('UNSUPPORTED_RULE_TYPE');
        expect(result.decisions[0]?.kind).toBe('drop-unsupported');
    });

    test('emits known RULE-SET rules as provider-backed route rules', () => {
        const rules: NormalizedRule[] = [{
            id: 'r7',
            stableKey: 'rule:rules[6]:RULE-SET,google,Proxy',
            raw: 'RULE-SET,google,Proxy',
            sourcePath: 'rules[6]',
            matcher: { type: 'rule_set', value: 'google' },
            target: { kind: 'group', name: 'Proxy' },
            options: { extra: {} },
        }];

        const result = planRouteRules(rules, [{
            id: 'rp1',
            stableKey: 'provider:rule-providers[0]:google',
            name: 'google',
            type: 'rule',
            vehicle: 'http',
            url: 'https://example.com/google.txt',
            intervalSeconds: 86400,
            behavior: 'domain',
            sourcePath: 'rule-providers.google',
            raw: {},
        }], {}, {
            ...analysis,
            graph: {
                ...analysis.graph,
                ruleProviderNames: ['google'],
            },
            objectStatuses: {
                ...analysis.objectStatuses,
                rules: {
                    ...analysis.objectStatuses.rules,
                    r7: 'exact',
                },
            },
        });

        expect(result.ruleSets).toHaveLength(1);
        expect(result.ruleSets[0]?.payload).toEqual({
            type: 'remote',
            tag: 'google',
            format: 'source',
            url: 'https://example.com/google.txt',
            update_interval: '86400s',
        });
        expect(result.rules).toHaveLength(1);
        expect(result.rules[0]?.payload).toEqual({
            rule_set: 'google',
            outbound: 'Proxy',
        });
        expect(result.decisions[0]?.kind).toBe('normalized-map');
    });

    test('expands local cached rule-provider content into inline rule_set when cache exists', () => {
        const rules: NormalizedRule[] = [{
            id: 'r8',
            stableKey: 'rule:rules[7]:RULE-SET,cached,Proxy',
            raw: 'RULE-SET,cached,Proxy',
            sourcePath: 'rules[7]',
            matcher: { type: 'rule_set', value: 'cached' },
            target: { kind: 'group', name: 'Proxy' },
            options: { extra: {} },
        }];

        const localPath = join(process.cwd(), 'tests/fixtures/rules/local-domain.txt');
        const result = planRouteRules(rules, [{
            id: 'rp2',
            stableKey: 'provider:rule-providers[1]:cached',
            name: 'cached',
            type: 'rule',
            vehicle: 'http',
            url: 'https://example.com/cached.txt',
            path: './rules/cached.txt',
            resolvedPath: localPath,
            intervalSeconds: 86400,
            behavior: 'domain',
            sourcePath: 'rule-providers.cached',
            raw: {},
        }], {}, {
            ...analysis,
            graph: {
                ...analysis.graph,
                ruleProviderNames: ['cached'],
            },
            objectStatuses: {
                ...analysis.objectStatuses,
                rules: {
                    ...analysis.objectStatuses.rules,
                    r8: 'exact',
                },
            },
        });

        expect(result.ruleSets[0]?.payload).toEqual({
            type: 'inline',
            tag: 'cached',
            rules: [{ domain_suffix: ['example.com'] }],
        });
        expect(result.ruleSets[0]?.notes).toContain('expanded:inline-rules:1');
    });

    test('expands classical rule-provider payload and reports dropped entries', () => {
        const rules: NormalizedRule[] = [{
            id: 'r8b',
            stableKey: 'rule:rules[7]:RULE-SET,classical,Proxy',
            raw: 'RULE-SET,classical,Proxy',
            sourcePath: 'rules[7]',
            matcher: { type: 'rule_set', value: 'classical' },
            target: { kind: 'group', name: 'Proxy' },
            options: { extra: {} },
        }];

        const localPath = join(process.cwd(), 'tests/fixtures/rules/local-classical.yaml');
        const result = planRouteRules(
            rules,
            [{
                id: 'rp2b',
                stableKey: 'provider:rule-providers[2]:classical',
                name: 'classical',
                type: 'rule',
                vehicle: 'http',
                url: 'https://example.com/classical.yaml',
                path: './rules/classical.yaml',
                resolvedPath: localPath,
                intervalSeconds: 86400,
                behavior: 'classical',
                sourcePath: 'rule-providers.classical',
                raw: {},
            }],
            {},
            {
                ...analysis,
                graph: {
                    ...analysis.graph,
                    ruleProviderNames: ['classical'],
                },
                objectStatuses: {
                    ...analysis.objectStatuses,
                    rules: {
                        ...analysis.objectStatuses.rules,
                        r8b: 'exact',
                    },
                },
            }
        );

        expect(result.ruleSets[0]?.payload).toEqual({
            type: 'inline',
            tag: 'classical',
            rules: [
                { domain_suffix: ['example.com'] },
                { ip_cidr: ['1.1.1.0/24'] },
                { process_name: 'chrome' },
            ],
        });
        expect(result.ruleSets[0]?.status).toBe('degraded');
        expect(
            result.issues.some((issue) =>
                issue.message.includes('dropped 1 unsupported entries')
            )
        ).toBe(true);
    });

    test('statically lowers simple SCRIPT shortcuts into route rules', () => {
        const rules: NormalizedRule[] = [{
            id: 'r9',
            stableKey: 'rule:rules[8]:SCRIPT,QUIC,REJECT,NO-RESOLVE',
            raw: 'SCRIPT,QUIC,REJECT,NO-RESOLVE',
            sourcePath: 'rules[8]',
            matcher: { type: 'script', value: 'QUIC' },
            target: { kind: 'special', name: 'REJECT' },
            options: { disableResolve: true, extra: {} },
        }];

        const result = planRouteRules(rules, [], {
            QUIC: "network == 'udp' and dst_port == 443",
        }, {
            ...analysis,
            objectStatuses: {
                ...analysis.objectStatuses,
                rules: {
                    ...analysis.objectStatuses.rules,
                    r9: 'degraded',
                },
            },
        });

        expect(result.ruleSets).toHaveLength(0);
        expect(result.rules).toHaveLength(1);
        expect(result.rules[0]?.payload).toEqual({
            network: ['udp'],
            port: 443,
            outbound: 'block',
        });
        expect(result.rules[0]?.notes).toContain('degraded:script-shortcut->static-route');
        expect(result.decisions[0]?.kind).toBe('fallback-map');
    });

    test('keeps complex SCRIPT shortcuts as placeholders', () => {
        const rules: NormalizedRule[] = [{
            id: 'r10',
            stableKey: 'rule:rules[9]:SCRIPT,BilibiliP2P,REJECT',
            raw: 'SCRIPT,BilibiliP2P,REJECT',
            sourcePath: 'rules[9]',
            matcher: { type: 'script', value: 'BilibiliP2P' },
            target: { kind: 'special', name: 'REJECT' },
            options: { extra: {} },
        }];

        const result = planRouteRules(rules, [], {
            BilibiliP2P: "network == 'udp' and match_provider(\"Bilibili\")",
        }, {
            ...analysis,
            objectStatuses: {
                ...analysis.objectStatuses,
                rules: {
                    ...analysis.objectStatuses.rules,
                    r10: 'degraded',
                },
            },
        });

        expect(result.ruleSets).toHaveLength(1);
        expect(result.ruleSets[0]?.payload).toEqual({
            type: 'inline',
            tag: 'script:BilibiliP2P',
            rules: [],
        });
        expect(result.rules[0]?.payload).toEqual({
            rule_set: 'script:BilibiliP2P',
            outbound: 'block',
        });
    });
});
