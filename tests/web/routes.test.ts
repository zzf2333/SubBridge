import { describe, test, expect } from 'bun:test';
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

const PROVIDER_UNSAFE_URL_YAML = `
proxies:
  - name: test-ss
    type: ss
    server: example.com
    port: 8388
    cipher: aes-256-gcm
    password: testpass
proxy-groups:
  - name: Proxy
    type: select
    proxies:
      - test-ss
rule-providers:
  unsafe:
    type: http
    behavior: domain
    url: http://127.0.0.1:9090/rules.txt
    path: ./profiles/rules/unsafe.txt
rules:
  - RULE-SET,unsafe,Proxy
  - MATCH,Proxy
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
        expect(data.runnable).toBe(true);
        expect(data.config).toBeDefined();
        expect(data.providerRefresh).toBeDefined();
        expect(data.providerRefresh.fetched).toBeDefined();
        expect(data.providerRefresh.skipped).toBeDefined();
        expect(data.providerRefresh.failed).toBeDefined();
        expect(data.report).toBeDefined();
        expect(data.reportDisplay).toBeDefined();
        expect(data.reportDisplay.status).not.toBe('failed');
    });

    test('omits provider refresh payload when fetchProviders is false', async () => {
        const res = await convertRoute.request('/', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                source: SAMPLE_YAML,
                sourceType: 'yaml',
                fetchProviders: false,
            }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.providerRefresh).toBeUndefined();
    });

    test('can omit report payload when includeReport is false', async () => {
        const res = await convertRoute.request('/', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                source: SAMPLE_YAML,
                sourceType: 'yaml',
                includeReport: false,
            }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.report).toBeUndefined();
        expect(data.reportDisplay).toBeUndefined();
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
        expect(data.validation.valid).toBe(true);
        expect(Array.isArray(data.validation.errors)).toBe(true);
    });

    test('returns intermediate artifacts when includeArtifacts is true', async () => {
        const res = await convertRoute.request('/', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                source: SAMPLE_YAML,
                sourceType: 'yaml',
                includeArtifacts: true,
            }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.artifacts).toBeDefined();
        expect(data.artifacts.normalized).toBeDefined();
        expect(data.artifacts.analysis).toBeDefined();
        expect(data.artifacts.plan).toBeDefined();
    });

    test('returns runnable config even when source only contains non-migratable fields', async () => {
        const res = await convertRoute.request('/', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ source: 'rules:\n- DIRECT', sourceType: 'yaml' }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.runnable).toBe(true);
        expect(data.report).toBeDefined();
        expect(data.reportDisplay).toBeDefined();
    });

    test('omits artifacts on 422 response when migration fails before planning', async () => {
        const res = await convertRoute.request('/', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                source: 'proxies: [',
                sourceType: 'yaml',
                includeArtifacts: true,
            }),
        });

        expect(res.status).toBe(422);
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(data.artifacts).toBeUndefined();
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

    test('keeps conversion runnable when provider url is blocked by safety policy', async () => {
        const res = await convertRoute.request('/', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                source: PROVIDER_UNSAFE_URL_YAML,
                sourceType: 'yaml',
            }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.runnable).toBe(true);
        expect(data.providerRefresh?.failed).toBe(1);
        expect(
            data.issues.some((issue: { message: string }) =>
                issue.message.includes('cache refresh failed')
            )
        ).toBe(true);
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

    test('returns provider refresh summary on 422 subscribe failure', async () => {
        const badYaml = 'proxies: [';
        const sourceUrl = `data:text/plain,${encodeURIComponent(badYaml)}`;
        const res = await subscribeRoute.request(`/?url=${encodeURIComponent(sourceUrl)}`);

        expect(res.status).toBe(422);
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(data.providerRefresh).toBeDefined();
        expect(data.providerRefresh.fetched).toBeDefined();
        expect(data.providerRefresh.skipped).toBeDefined();
        expect(data.providerRefresh.failed).toBeDefined();
        expect(data.report).toBeDefined();
    });

    test('returns 400 for unsafe subscribe url', async () => {
        const res = await subscribeRoute.request('/?url=http%3A%2F%2F127.0.0.1%3A9090%2Fsub');
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(String(data.error)).toContain('Unsafe URL');
    });
});
