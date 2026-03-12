import { describe, test, expect } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { convertClashToSingbox, convertClashToSingboxAsync } from '../../src/core/index';

const SS_YAML = `
proxies:
  - name: "HK-SS"
    type: ss
    server: example.com
    port: 8388
    cipher: aes-256-gcm
    password: testpass
`;

const HTTP_YAML = `
proxies:
  - name: "Local-HTTP"
    type: http
    server: 127.0.0.1
    port: 8080
`;

const RULE_PROVIDER_YAML = `
proxies:
  - name: NodeA
    type: ss
    server: example.com
    port: 8388
    cipher: aes-256-gcm
    password: pass
proxy-groups:
  - name: Proxy
    type: select
    proxies:
      - NodeA
rule-providers:
  rp-domain:
    type: http
    behavior: domain
    url: https://example.com/rules.txt
    path: providers/rules/rp-domain.txt
rules:
  - RULE-SET,rp-domain,Proxy
  - MATCH,Proxy
`;

describe('Core Conversion Entry', () => {
    test('converts clash yaml successfully', () => {
        const result = convertClashToSingbox(SS_YAML);

        expect(result.success).toBe(true);
        expect(result.config).toBeDefined();
        expect(result.errors).toHaveLength(0);
    });

    test('returns parse error for invalid input', () => {
        const result = convertClashToSingbox('');

        expect(result.success).toBe(false);
        expect(result.errors[0]).toContain('EMPTY_CONFIG');
    });

    test('returns warning for unsupported proxies', () => {
        const result = convertClashToSingbox(`
proxies:
  - name: supported
    type: ss
    server: example.com
    port: 8388
    cipher: aes-256-gcm
    password: pass
  - name: unsupported
    type: tuic
    server: example.com
    port: 443
`);

        expect(result.success).toBe(true);
        expect(result.warnings.join(' ')).toContain('Unsupported proxy protocol');
    });

    test('can still produce a runnable config when only unsupported proxies are present', () => {
        const result = convertClashToSingbox(`
proxies:
  - name: unsupported
    type: tuic
    server: example.com
    port: 443
`);

        expect(result.success).toBe(true);
        expect(result.config).toBeDefined();
        expect(result.warnings.join(' ')).toContain('unsupported protocol');
    });

    test('can skip schema validation warnings', () => {
        const result = convertClashToSingbox(SS_YAML, { validate: false });

        expect(result.success).toBe(true);
        expect(result.config).toBeDefined();
    });

    test('supports http proxy outbounds', () => {
        const result = convertClashToSingbox(HTTP_YAML);

        expect(result.success).toBe(true);
        expect(result.config?.outbounds?.some((outbound) => outbound.tag === 'Local-HTTP' && outbound.type === 'http')).toBe(true);
        expect(result.warnings.join(' ')).not.toContain('Unsupported proxy protocol: http');
    });

    test('supports provider fetch via async core conversion entry', async () => {
        const baseDir = mkdtempSync(join(tmpdir(), 'subbridge-convert-async-'));
        try {
            const result = await convertClashToSingboxAsync(RULE_PROVIDER_YAML, {
                sourceBaseDir: baseDir,
                providerFetch: {
                    fetcher: async () => 'example.com\n',
                },
            });

            expect(result.success).toBe(true);
            expect(result.config).toBeDefined();
            expect(result.providerRefresh).toEqual({
                fetched: 1,
                skipped: 0,
                failed: 0,
            });
            expect(
                result.config?.route?.rule_set?.find((ruleSet) => ruleSet.tag === 'rp-domain')
            ).toEqual({
                type: 'inline',
                tag: 'rp-domain',
                rules: [{ domain_suffix: ['example.com'] }],
            });
        } finally {
            rmSync(baseDir, { recursive: true, force: true });
        }
    });
});
