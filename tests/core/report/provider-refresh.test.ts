import { describe, expect, test } from 'bun:test';
import { migrateClashConfig } from '../../../src/core/migrate';
import { mergeProviderCacheRefreshIntoResult } from '../../../src/core/report/provider-refresh';

const SAMPLE_YAML = `
proxies:
  - name: test-ss
    type: ss
    server: example.com
    port: 8388
    cipher: aes-256-gcm
    password: testpass
rules:
  - MATCH,test-ss
`;

describe('mergeProviderCacheRefreshIntoResult', () => {
    test('appends provider refresh failures into report issues and decisions', () => {
        const result = migrateClashConfig(SAMPLE_YAML, {
            targetProfile: 'auto',
            emitReport: true,
        });

        const originalWarningCount = result.report.summary.warningIssues;
        const originalDecisionCount = result.report.decisions.length;

        mergeProviderCacheRefreshIntoResult(result, {
            rawConfig: {},
            fetched: [],
            skipped: [],
            failed: [{
                kind: 'rule',
                name: 'apple',
                reason: 'network timeout',
            }],
        });

        expect(result.report.summary.warningIssues).toBe(originalWarningCount + 1);
        expect(result.report.decisions.length).toBe(originalDecisionCount + 1);
        expect(
            result.report.issues.some((issue) =>
                issue.message.includes('Remote rule-provider "apple" cache refresh failed')
            )
        ).toBe(true);
        expect(
            result.report.decisions.some((decision) =>
                decision.summary.includes('Fallback to existing cache behavior for rule-provider apple')
            )
        ).toBe(true);
        expect(result.issues[0]?.message).toContain('Remote rule-provider "apple" cache refresh failed');
        expect(result.report.display.issueHighlights.warning.length).toBeGreaterThan(0);
        expect(result.report.display.providerHighlights.length).toBeGreaterThan(0);
        expect(result.report.display.providerHighlights[0]).toContain('rule-provider apple');
        expect(result.report.display.providerStats).toEqual({
            fetched: 0,
            skipped: 0,
            failed: 1,
        });
    });
});
