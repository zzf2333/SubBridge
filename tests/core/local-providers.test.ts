import { describe, expect, test } from 'bun:test';
import { join } from 'path';
import { migrateClashConfig } from '../../src/core/migrate';

const FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/test-configs');

describe('local proxy-provider expansion', () => {
    test('expands local provider cache into concrete group members', () => {
        const input = `
proxy-providers:
  local-cache:
    type: file
    path: ../providers/local-cache.yaml

proxy-groups:
  - name: HK
    type: url-test
    use:
      - local-cache
    filter: ".*HK.*"
    url: https://www.gstatic.com/generate_204
    interval: 300

rules:
  - MATCH,HK
`;

        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
            emitIntermediateArtifacts: true,
            sourceBaseDir: FIXTURE_DIR,
        });

        expect(result.runnable).toBe(true);
        expect(result.config?.outbounds?.some((outbound) => outbound.tag === 'HK-Provider-01')).toBe(true);
        expect(result.config?.outbounds?.some((outbound) => outbound.tag === 'US-Provider-01')).toBe(true);
        expect(result.config?.outbounds?.some((outbound) => outbound.tag === 'local-cache')).toBe(false);
        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'HK')).toMatchObject({
            type: 'urltest',
            outbounds: ['HK-Provider-01'],
            url: 'https://www.gstatic.com/generate_204',
            interval: '300s',
        });
        expect(result.artifacts?.normalized?.providers.proxyProviders[0]?.expandedProxyNames).toEqual([
            'HK-Provider-01',
            'US-Provider-01',
        ]);
    });

    test('falls back to placeholder behavior when local provider cache is missing', () => {
        const input = `
proxy-providers:
  missing-cache:
    type: file
    path: ../providers/missing.yaml

proxy-groups:
  - name: Proxy
    type: select
    use:
      - missing-cache

rules:
  - MATCH,Proxy
`;

        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
            sourceBaseDir: FIXTURE_DIR,
        });

        expect(result.runnable).toBe(true);
        expect(result.config?.outbounds?.find((outbound) => outbound.tag === 'missing-cache')).toMatchObject({
            type: 'selector',
            outbounds: ['direct'],
            default: 'direct',
        });
    });
});
