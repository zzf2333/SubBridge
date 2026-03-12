import { describe, expect, test } from 'bun:test';
import { buildMigrationReport } from '../../../src/core/report/reporter';
import type { MigrationIssue } from '../../../src/core/types/migration';
import type { MigrationAnalysis } from '../../../src/core/types/migration-analysis';
import type { MigrationPlan } from '../../../src/core/types/migration-plan';
import type {
    NormalizedClashConfig,
    NormalizedShadowsocksProxy,
} from '../../../src/core/types/normalized-clash';
import type { ValidationResult } from '../../../src/core/types/migration-report';

function createNormalized(): NormalizedClashConfig {
    return {
        general: {
            mode: 'rule',
            ports: {},
        },
        proxies: [{
            id: 'p1',
            stableKey: 'proxy:proxies[0]:NodeA',
            name: 'NodeA',
            type: 'ss',
            server: 'example.com',
            port: 443,
            sourcePath: 'proxies[0]',
            raw: {},
            features: ['tls'],
            method: 'aes-128-gcm',
            password: 'pass',
        } as NormalizedShadowsocksProxy],
        groups: [],
        rules: [],
        scriptShortcuts: {},
        providers: {
            ruleProviders: [],
            proxyProviders: [],
        },
        meta: {
            sourceFormat: 'clash',
            migratorVersion: '0.1.0-dev',
            parserWarnings: [],
        },
    };
}

function createAnalysis(): MigrationAnalysis {
    return {
        graph: {
            proxyNames: ['NodeA'],
            groupNames: [],
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
            profile: 'proxy-only',
            requiresDns: false,
            requiresTun: false,
            requiresMixedInbound: false,
            reasoning: [],
        },
        objectStatuses: {
            proxies: { p1: 'exact' },
            groups: {},
            rules: {},
        },
        issues: [],
    };
}

function createPlan(): MigrationPlan {
    return {
        profile: 'proxy-only',
        inbounds: [],
        outbounds: [],
        dns: undefined,
        route: {
            id: 'route',
            sourcePaths: [],
            status: 'exact',
            decision: 'normalized-map',
            notes: [],
            rules: [],
            ruleSets: [],
            final: 'direct',
        },
        patches: [{
            id: 'patch-1',
            kind: 'add-direct-outbound',
            summary: 'Add default direct outbound',
            reason: 'Provide a safe fallback outbound',
        }],
        repairs: [{
            id: 'repair-1',
            kind: 'runtime-patch',
            targetModule: 'runtime',
            summary: 'Insert default direct outbound',
            before: 'No explicit direct outbound was available',
            after: 'A default direct outbound was inserted',
            reason: 'Provide a safe fallback outbound',
            sourcePaths: [],
        }],
        issues: [],
        decisions: [{
            id: 'decision-1',
            kind: 'runtime-completion',
            targetModule: 'runtime',
            summary: 'Add direct fallback',
            reason: 'Need runnable config',
            sourcePaths: [],
        }],
    };
}

function createValidation(): ValidationResult {
    return {
        runnable: true,
        schemaValid: true,
        referenceValid: true,
        runtimeValid: true,
        issues: [],
    };
}

describe('buildMigrationReport', () => {
    test('includes normalize issues and module summaries', () => {
        const normalizeIssues: MigrationIssue[] = [{
            id: 'issue-1',
            level: 'warning',
            code: 'UNSUPPORTED_FIELD',
            module: 'proxy',
            message: 'Ignored unsupported field',
            impact: 'Behavior may differ slightly',
        }];

        const report = buildMigrationReport(
            createNormalized(),
            normalizeIssues,
            createAnalysis(),
            createPlan(),
            createValidation()
        );

        expect(report.issues).toHaveLength(1);
        expect(report.modules[0]?.module).toBe('proxy');
        expect(report.modules[0]?.items).toHaveLength(1);
        expect(report.summary.warningIssues).toBe(1);
        expect(report.display.status).toBe('degraded-runnable');
        expect(report.display.issueHighlights.warning).toHaveLength(1);
        expect(report.display.providerStats).toEqual({
            fetched: 0,
            skipped: 0,
            failed: 0,
        });
    });

    test('collects behavior changes from repairs', () => {
        const report = buildMigrationReport(
            createNormalized(),
            [],
            createAnalysis(),
            createPlan(),
            createValidation()
        );

        expect(report.behaviorChanges).toHaveLength(1);
        expect(report.behaviorChanges[0]?.summary).toContain('direct outbound');
        expect(report.repairs).toHaveLength(1);
        expect(report.display.repairHighlights[0]).toContain('direct outbound');
    });
});
