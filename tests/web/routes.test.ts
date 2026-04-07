import { describe, test, expect } from 'bun:test';
import indexRoute from '../../src/web/routes/index';
import convertRoute from '../../src/web/routes/convert';
import subscribeRoute from '../../src/web/routes/subscribe';

const SAMPLE_YAML = `
proxies:
  - name: test-ss
    type: ss
    server: example.com
    port: 8388
    cipher: aes-256-gcm
    password: testpass
`;

describe('Convert Route', () => {
    test('returns 400 for invalid JSON body', async () => {
        const res = await convertRoute.request('/', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{',
        });

        expect(res.status).toBe(400);
    });

    test('returns 400 when source is missing', async () => {
        const res = await convertRoute.request('/', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sourceType: 'yaml' }),
        });

        expect(res.status).toBe(400);
    });

    test('returns converted config for yaml source', async () => {
        const res = await convertRoute.request('/', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ source: SAMPLE_YAML, sourceType: 'yaml' }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.config).toBeDefined();
        expect(data.convertedCount).toBeGreaterThanOrEqual(0);
    });

    test('returns schema validation payload when validate is true', async () => {
        const res = await convertRoute.request('/', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                source: SAMPLE_YAML,
                sourceType: 'yaml',
                validate: true,
            }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.validation).toBeDefined();
        expect(typeof data.validation.valid).toBe('boolean');
        expect(Array.isArray(data.validation.errors)).toBe(true);
    });

    test('returns 400 for unsafe remote source url', async () => {
        const res = await convertRoute.request('/', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                source: 'http://127.0.0.1:9090/sub',
                sourceType: 'url',
            }),
        });

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(String(data.error)).toContain('Unsafe URL');
    });
});

describe('Subscribe Route', () => {
    test('returns 400 when url query is missing', async () => {
        const res = await subscribeRoute.request('/');
        expect(res.status).toBe(400);
    });

    test('returns converted raw JSON for valid url', async () => {
        const sourceUrl = `data:text/plain,${encodeURIComponent(SAMPLE_YAML)}`;
        const res = await subscribeRoute.request(`/?url=${encodeURIComponent(sourceUrl)}`);

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        const json = await res.json();
        expect(json.outbounds).toBeDefined();
    });

    test('returns 400 for unsafe subscribe url', async () => {
        const res = await subscribeRoute.request('/?url=http%3A%2F%2F127.0.0.1%3A9090%2Fsub');
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(String(data.error)).toContain('Unsafe URL');
    });
});

describe('Index Route (Web UI)', () => {
    test('GET / 返回 200 HTML 页面', async () => {
        const res = await indexRoute.request('/');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
    });

    test('HTML 包含应用名称和主要 UI 元素', async () => {
        const res = await indexRoute.request('/');
        const html = await res.text();
        expect(html).toContain('SubBridge');
        expect(html).toContain('生成 sing-box 配置');
    });

    test('HTML 包含 YAML 输入和 URL 两种输入模式', async () => {
        const res = await indexRoute.request('/');
        const html = await res.text();
        expect(html).toContain('粘贴 YAML');
        expect(html).toContain('订阅 URL');
    });

    test('HTML 包含下载和复制功能', async () => {
        const res = await indexRoute.request('/');
        const html = await res.text();
        expect(html).toContain('downloadJson');
        expect(html).toContain('copyJson');
    });
});
