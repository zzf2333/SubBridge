import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { RawClashConfig } from '../../../src/core/types/raw-clash';
import {
    refreshRemoteProviderCaches,
    refreshRemoteProviderCachesFromYaml,
    refreshRemoteProxyProviderCaches,
    refreshRemoteProxyProviderCachesFromYaml,
} from '../../../src/core/parse/providers';

const REMOTE_PROVIDER_CONTENT = `
proxies:
  - name: remote-ss
    type: ss
    server: remote.example.com
    port: 8388
    cipher: aes-256-gcm
    password: remote-pass
`;

function buildRemoteProviderRaw(path = './providers/remote.yaml'): RawClashConfig {
    return {
        'proxy-providers': {
            remote: {
                type: 'http',
                url: 'https://example.com/provider.yaml',
                path,
                interval: 3600,
            },
        },
    };
}

describe('refreshRemoteProxyProviderCaches', () => {
    test('fetches remote provider and writes local cache file', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-provider-'));
        const result = await refreshRemoteProxyProviderCaches(
            buildRemoteProviderRaw(),
            dir,
            {
                fetcher: async () => REMOTE_PROVIDER_CONTENT,
            }
        );

        const cachePath = join(dir, 'providers', 'remote.yaml');
        expect(result.fetched).toEqual(['remote']);
        expect(result.failed.length).toBe(0);
        expect(existsSync(cachePath)).toBe(true);
        expect(readFileSync(cachePath, 'utf-8')).toContain('remote-ss');
    });

    test('reuses fresh local cache when interval is not expired', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-provider-'));
        const cachePath = join(dir, 'providers', 'remote.yaml');
        mkdirSync(join(dir, 'providers'), { recursive: true });
        writeFileSync(cachePath, REMOTE_PROVIDER_CONTENT, 'utf-8');

        let fetchCount = 0;
        const result = await refreshRemoteProxyProviderCaches(
            buildRemoteProviderRaw(),
            dir,
            {
                fetcher: async () => {
                    fetchCount += 1;
                    return REMOTE_PROVIDER_CONTENT;
                },
            }
        );

        expect(fetchCount).toBe(0);
        expect(result.skipped).toEqual(['remote']);
        expect(result.fetched.length).toBe(0);
    });

    test('force refresh bypasses local cache reuse', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-provider-'));
        const cachePath = join(dir, 'providers', 'remote.yaml');
        mkdirSync(join(dir, 'providers'), { recursive: true });
        writeFileSync(cachePath, REMOTE_PROVIDER_CONTENT, 'utf-8');

        let fetchCount = 0;
        const result = await refreshRemoteProxyProviderCaches(
            buildRemoteProviderRaw(),
            dir,
            {
                force: true,
                fetcher: async () => {
                    fetchCount += 1;
                    return REMOTE_PROVIDER_CONTENT;
                },
            }
        );

        expect(fetchCount).toBe(1);
        expect(result.fetched).toEqual(['remote']);
    });

    test('marks remote provider as failed when path is missing', async () => {
        const result = await refreshRemoteProxyProviderCaches(
            {
                'proxy-providers': {
                    remote: {
                        type: 'http',
                        url: 'https://example.com/provider.yaml',
                    },
                },
            },
            process.cwd(),
            {
                fetcher: async () => REMOTE_PROVIDER_CONTENT,
            }
        );

        expect(result.fetched.length).toBe(0);
        expect(result.failed.length).toBe(1);
        expect(result.failed[0]?.name).toBe('remote');
        expect(result.failed[0]?.kind).toBe('proxy');
        expect(result.failed[0]?.reason).toContain('missing provider.path');
    });
});

describe('refreshRemoteProxyProviderCachesFromYaml', () => {
    test('returns empty result for invalid yaml input', async () => {
        const result = await refreshRemoteProxyProviderCachesFromYaml('not: [valid', process.cwd());
        expect(result.fetched.length).toBe(0);
        expect(result.failed.length).toBe(0);
    });
});

describe('refreshRemoteProviderCaches', () => {
    test('fetches remote rule-provider and writes local cache file', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-provider-'));
        const result = await refreshRemoteProviderCaches(
            {
                'rule-providers': {
                    apple: {
                        type: 'http',
                        behavior: 'classical',
                        url: 'https://example.com/apple.list',
                        path: './rules/apple.list',
                        interval: 3600,
                    },
                },
            },
            dir,
            {
                fetcher: async () => 'payload:\n  - DOMAIN-SUFFIX,apple.com\n',
            }
        );

        const cachePath = join(dir, 'rules', 'apple.list');
        expect(result.fetched).toEqual(['apple']);
        expect(result.failed.length).toBe(0);
        expect(existsSync(cachePath)).toBe(true);
        expect(readFileSync(cachePath, 'utf-8')).toContain('apple.com');
    });

    test('returns rule fetch failure for empty content', async () => {
        const result = await refreshRemoteProviderCaches(
            {
                'rule-providers': {
                    empty: {
                        type: 'http',
                        behavior: 'classical',
                        url: 'https://example.com/empty.list',
                        path: './rules/empty.list',
                    },
                },
            },
            process.cwd(),
            {
                fetcher: async () => '   \n',
            }
        );

        expect(result.fetched.length).toBe(0);
        expect(result.failed.length).toBe(1);
        expect(result.failed[0]?.name).toBe('empty');
        expect(result.failed[0]?.kind).toBe('rule');
        expect(result.failed[0]?.reason).toContain('empty');
    });

    test('scope proxy only fetches proxy-providers', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-provider-'));
        const result = await refreshRemoteProviderCaches(
            {
                'proxy-providers': {
                    p1: {
                        type: 'http',
                        url: 'https://example.com/p1.yaml',
                        path: './providers/p1.yaml',
                    },
                },
                'rule-providers': {
                    r1: {
                        type: 'http',
                        behavior: 'classical',
                        url: 'https://example.com/r1.list',
                        path: './rules/r1.list',
                    },
                },
            },
            dir,
            {
                scope: 'proxy',
                fetcher: async () => REMOTE_PROVIDER_CONTENT,
            }
        );

        expect(result.fetched).toContain('p1');
        expect(result.fetched).not.toContain('r1');
        expect(existsSync(join(dir, 'providers', 'p1.yaml'))).toBe(true);
        expect(existsSync(join(dir, 'rules', 'r1.list'))).toBe(false);
    });

    test('scope rule only fetches rule-providers', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-provider-'));
        const result = await refreshRemoteProviderCaches(
            {
                'proxy-providers': {
                    p1: {
                        type: 'http',
                        url: 'https://example.com/p1.yaml',
                        path: './providers/p1.yaml',
                    },
                },
                'rule-providers': {
                    r1: {
                        type: 'http',
                        behavior: 'classical',
                        url: 'https://example.com/r1.list',
                        path: './rules/r1.list',
                    },
                },
            },
            dir,
            {
                scope: 'rule',
                fetcher: async (url) => (url.includes('.list')
                    ? 'payload:\n  - DOMAIN-SUFFIX,example.com\n'
                    : REMOTE_PROVIDER_CONTENT),
            }
        );

        expect(result.fetched).toContain('r1');
        expect(result.fetched).not.toContain('p1');
        expect(existsSync(join(dir, 'providers', 'p1.yaml'))).toBe(false);
        expect(existsSync(join(dir, 'rules', 'r1.list'))).toBe(true);
    });
});

describe('refreshRemoteProviderCachesFromYaml', () => {
    test('fetches both proxy and rule providers from yaml input', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-provider-'));
        const yaml = `
proxy-providers:
  p1:
    type: http
    url: https://example.com/proxy.yaml
    path: ./providers/p1.yaml
rule-providers:
  r1:
    type: http
    behavior: classical
    url: https://example.com/r1.list
    path: ./rules/r1.list
`;
        const result = await refreshRemoteProviderCachesFromYaml(yaml, dir, {
            fetcher: async (url) => (url.includes('proxy')
                ? REMOTE_PROVIDER_CONTENT
                : 'payload:\n  - DOMAIN-SUFFIX,example.com\n'),
        });

        expect(result.fetched).toContain('p1');
        expect(result.fetched).toContain('r1');
        expect(result.failed.length).toBe(0);
    });
});
