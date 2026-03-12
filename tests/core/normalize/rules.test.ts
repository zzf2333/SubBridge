import { describe, expect, test } from 'bun:test';
import { normalizeRules } from '../../../src/core/normalize/rules';

describe('normalizeRules', () => {
    test('parses MATCH rule target correctly', () => {
        const result = normalizeRules(['MATCH,Proxy']);

        expect(result.issues).toHaveLength(0);
        expect(result.rules).toHaveLength(1);
        expect(result.rules[0]?.matcher.type).toBe('match');
        expect(result.rules[0]?.target).toEqual({ kind: 'unknown', name: 'Proxy' });
    });

    test('parses IP-CIDR with NO-RESOLVE option', () => {
        const result = normalizeRules(['IP-CIDR,1.1.1.0/24,DIRECT,NO-RESOLVE']);

        expect(result.rules).toHaveLength(1);
        expect(result.rules[0]?.matcher).toEqual({
            type: 'ip_cidr',
            value: '1.1.1.0/24',
            noResolve: true,
        });
        expect(result.rules[0]?.options.disableResolve).toBe(true);
    });

    test('parses port range rule', () => {
        const result = normalizeRules(['DST-PORT,1000-2000,Proxy']);

        expect(result.rules[0]?.matcher).toEqual({
            type: 'port_range',
            start: 1000,
            end: 2000,
        });
    });

    test('parses RULE-SET as a recognized matcher', () => {
        const result = normalizeRules(['RULE-SET,google,Proxy']);

        expect(result.issues).toHaveLength(0);
        expect(result.rules[0]?.matcher).toEqual({
            type: 'rule_set',
            value: 'google',
        });
        expect(result.rules[0]?.target).toEqual({ kind: 'unknown', name: 'Proxy' });
    });

    test('parses SCRIPT as a recognized matcher', () => {
        const result = normalizeRules(['SCRIPT,QUIC,REJECT,NO-RESOLVE']);

        expect(result.issues).toHaveLength(0);
        expect(result.rules[0]?.matcher).toEqual({
            type: 'script',
            value: 'QUIC',
        });
        expect(result.rules[0]?.target).toEqual({ kind: 'special', name: 'REJECT' });
        expect(result.rules[0]?.options.disableResolve).toBe(true);
    });
});
