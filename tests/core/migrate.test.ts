import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { migrateClashConfig, migrateClashConfigWithProviderFetch } from '../../src/core/migrate';

const SAMPLE_YAML = `
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
rules:
  - DOMAIN-SUFFIX,google.com,Proxy
  - MATCH,Proxy
`;

const PROVIDER_YAML = `
proxy-providers:
  remote-a:
    type: http
    url: https://example.com/remote-a.yaml
    path: providers/remote-a.yaml
proxy-groups:
  - name: Proxy
    type: select
    use:
      - remote-a
rules:
  - MATCH,Proxy
`;

const PROVIDER_CACHE_YAML = `
proxies:
  - name: RemoteNode
    type: ss
    server: example.com
    port: 8388
    cipher: aes-256-gcm
    password: pass
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
    url: https://example.com/rp-domain.txt
    path: providers/rules/rp-domain.txt
rules:
  - RULE-SET,rp-domain,Proxy
  - MATCH,Proxy
`;

describe('migrateClashConfig', () => {
    test('produces runnable config and report for basic clash config', () => {
        const result = migrateClashConfig(SAMPLE_YAML, {
            targetProfile: 'auto',
            emitReport: true,
            emitIntermediateArtifacts: true,
        });

        expect(result.success).toBe(true);
        expect(result.runnable).toBe(true);
        expect(result.config).toBeDefined();
        expect(result.report.summary.profile).toBeDefined();
        expect(result.report.display.status).not.toBe('failed');
        expect(result.report.modules.some((module) => module.module === 'proxy')).toBe(true);
        expect(result.artifacts?.normalized?.proxies).toHaveLength(1);
        expect(result.artifacts?.plan?.outbounds.length).toBeGreaterThan(0);
        const clashApi = (result.config?.experimental as Record<string, unknown> | undefined)
            ?.clash_api as Record<string, unknown> | undefined;
        expect(clashApi?.external_controller).toBe('127.0.0.1:9090');
        expect(clashApi?.default_mode).toBe('rule');
    });

    test('returns failure report for empty input', () => {
        const result = migrateClashConfig('');

        expect(result.success).toBe(false);
        expect(result.runnable).toBe(false);
        expect(result.report.summary.fatalIssues).toBe(1);
        expect(result.report.display.status).toBe('failed');
        expect(result.issues[0]?.message).toContain('EMPTY_CONFIG');
    });

    test('degrades unsupported-only config into runnable fallback output', () => {
        const result = migrateClashConfig(`
proxies:
  - name: Unsupported
    type: tuic
    server: example.com
    port: 443
`);

        expect(result.runnable).toBe(true);
        expect(result.report.summary.degradedMappings).toBeGreaterThan(0);
        expect(result.issues.some((issue) => issue.code === 'UNSUPPORTED_PROTOCOL')).toBe(true);
    });

    test('can refresh provider cache in core async migration entry', async () => {
        const baseDir = mkdtempSync(join(tmpdir(), 'subbridge-migrate-provider-'));
        const providerCachePath = join(baseDir, 'providers/remote-a.yaml');
        try {
            const result = await migrateClashConfigWithProviderFetch(PROVIDER_YAML, {
                sourceBaseDir: baseDir,
                providerFetch: {
                    fetcher: async () => PROVIDER_CACHE_YAML,
                },
            });

            expect(result.runnable).toBe(true);
            expect(result.providerRefresh).toEqual({
                fetched: 1,
                skipped: 0,
                failed: 0,
            });
            expect(result.report.display.providerStats).toEqual({
                fetched: 1,
                skipped: 0,
                failed: 0,
            });
            expect(existsSync(providerCachePath)).toBe(true);
        } finally {
            rmSync(baseDir, { recursive: true, force: true });
        }
    });

    test('can disable provider cache refresh in core async migration entry', async () => {
        let fetchCalled = false;
        const result = await migrateClashConfigWithProviderFetch(PROVIDER_YAML, {
            providerFetch: {
                enabled: false,
                fetcher: async () => {
                    fetchCalled = true;
                    return PROVIDER_CACHE_YAML;
                },
            },
        });

        expect(result.runnable).toBe(true);
        expect(result.providerRefresh).toBeUndefined();
        expect(fetchCalled).toBe(false);
    });

    test('expands fetched remote rule-provider cache into inline rule_set', async () => {
        const baseDir = mkdtempSync(join(tmpdir(), 'subbridge-migrate-rule-provider-'));
        try {
            const result = await migrateClashConfigWithProviderFetch(RULE_PROVIDER_YAML, {
                sourceBaseDir: baseDir,
                providerFetch: {
                    fetcher: async () => 'example.com\n+.google.com\n',
                },
            });

            expect(result.runnable).toBe(true);
            expect(result.providerRefresh).toEqual({
                fetched: 1,
                skipped: 0,
                failed: 0,
            });
            expect(result.config?.route?.rule_set?.find((ruleSet) => ruleSet.tag === 'rp-domain'))
                .toEqual({
                    type: 'inline',
                    tag: 'rp-domain',
                    rules: [
                        { domain_suffix: ['example.com'] },
                        { domain_suffix: ['google.com'] },
                    ],
                });
        } finally {
            rmSync(baseDir, { recursive: true, force: true });
        }
    });
});
