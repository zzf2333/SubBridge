import { describe, test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { fetchSubscription } from '@/core/fetch/providers';

const SAMPLE_YAML = `
proxies:
  - name: "HK-01"
    type: ss
    server: 1.2.3.4
    port: 443
    cipher: aes-256-gcm
    password: secret
`;

describe('fetchSubscription', () => {
    test('成功拉取：fromCache=false，返回 proxies', async () => {
        const result = await fetchSubscription('https://example.com/sub', {
            fetcher: async () => SAMPLE_YAML,
        });
        expect(result.fromCache).toBe(false);
        expect(result.proxies).toHaveLength(1);
        expect(result.proxies[0]['name']).toBe('HK-01');
        expect(result.warnings).toHaveLength(0);
    });

    test('缓存命中：有效缓存不调用 fetcher，fromCache=true', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'providers-test-'));
        const cachePath = join(dir, 'cache.yaml');
        writeFileSync(cachePath, SAMPLE_YAML, 'utf-8');

        let fetcherCalled = false;
        const result = await fetchSubscription('https://example.com/sub', {
            fetcher: async () => { fetcherCalled = true; return ''; },
            cachePath,
            nowMs: () => Date.now(), // 缓存刚写入，仍有效
        });
        expect(fetcherCalled).toBe(false);
        expect(result.fromCache).toBe(true);
        expect(result.proxies).toHaveLength(1);
    });

    test('缓存过期：超过 TTL 后重新拉取，fromCache=false', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'providers-test-'));
        const cachePath = join(dir, 'cache.yaml');
        writeFileSync(cachePath, SAMPLE_YAML, 'utf-8');

        let fetcherCalled = false;
        const result = await fetchSubscription('https://example.com/sub', {
            fetcher: async () => { fetcherCalled = true; return SAMPLE_YAML; },
            cachePath,
            cacheTtlMs: 3600 * 1000,
            nowMs: () => Date.now() + 7200 * 1000, // 2 小时后 → 缓存过期
        });
        expect(fetcherCalled).toBe(true);
        expect(result.fromCache).toBe(false);
    });

    test('force=true：强制跳过有效缓存，重新拉取', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'providers-test-'));
        const cachePath = join(dir, 'cache.yaml');
        writeFileSync(cachePath, SAMPLE_YAML, 'utf-8');

        let fetcherCalled = false;
        const result = await fetchSubscription('https://example.com/sub', {
            fetcher: async () => { fetcherCalled = true; return SAMPLE_YAML; },
            cachePath,
            force: true,
            nowMs: () => Date.now(),
        });
        expect(fetcherCalled).toBe(true);
        expect(result.fromCache).toBe(false);
    });

    test('拉取失败且有过期缓存：降级使用过期缓存，warnings 包含两条记录', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'providers-test-'));
        const cachePath = join(dir, 'cache.yaml');
        writeFileSync(cachePath, SAMPLE_YAML, 'utf-8');

        const result = await fetchSubscription('https://example.com/sub', {
            fetcher: async () => { throw new Error('network error'); },
            cachePath,
            cacheTtlMs: 3600 * 1000,
            nowMs: () => Date.now() + 7200 * 1000,
        });
        expect(result.fromCache).toBe(true);
        expect(result.proxies).toHaveLength(1);
        expect(result.warnings.some(w => w.includes('拉取失败'))).toBe(true);
        expect(result.warnings.some(w => w.includes('过期缓存'))).toBe(true);
    });

    test('拉取失败且无缓存：返回空 proxies，warnings 包含拉取失败', async () => {
        const result = await fetchSubscription('https://example.com/sub', {
            fetcher: async () => { throw new Error('network timeout'); },
        });
        expect(result.proxies).toHaveLength(0);
        expect(result.fromCache).toBe(false);
        expect(result.warnings.some(w => w.includes('拉取失败'))).toBe(true);
    });

    test('成功拉取后写入缓存（自动创建父目录）', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'providers-test-'));
        const cachePath = join(dir, 'subdir', 'cache.yaml'); // subdir 尚不存在

        await fetchSubscription('https://example.com/sub', {
            fetcher: async () => SAMPLE_YAML,
            cachePath,
        });
        expect(existsSync(cachePath)).toBe(true);
    });
});
