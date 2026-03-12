import type { RemoteProviderCacheRefreshResult } from '../parse/providers';
import { MigrationErrorCode, type MigrationIssue, type MigrationResult } from '../types/migration';
import type { PlanningDecision } from '../types/migration-plan';
import { refreshMigrationReportDerivedFields } from './reporter';

export function mergeProviderCacheRefreshIntoResult(
    result: MigrationResult,
    refresh: RemoteProviderCacheRefreshResult
): MigrationResult {
    if (!refresh.fetched.length && !refresh.skipped.length && !refresh.failed.length) {
        return result;
    }

    const issues = buildProviderRefreshIssues(refresh);
    const decisions = buildProviderRefreshDecisions(refresh);

    if (issues.length > 0) {
        result.issues = [...issues, ...result.issues];
        result.report.issues = [...issues, ...result.report.issues];
    }

    if (decisions.length > 0) {
        result.report.decisions = [...decisions, ...result.report.decisions];
    }

    refreshMigrationReportDerivedFields(result.report);
    return result;
}

function buildProviderRefreshIssues(refresh: RemoteProviderCacheRefreshResult): MigrationIssue[] {
    return refresh.failed.map((failure) => {
        const sourcePath = `${failure.kind === 'proxy' ? 'proxy-providers' : 'rule-providers'}.${failure.name}`;
        return {
            id: crypto.randomUUID(),
            level: 'warning',
            code: MigrationErrorCode.UNRESOLVABLE_DEPENDENCY,
            module: failure.kind === 'proxy' ? 'proxy' : 'rule',
            sourcePath,
            objectName: failure.name,
            message: `Remote ${failure.kind}-provider "${failure.name}" cache refresh failed`,
            impact: `The migrator could not refresh the local cache for ${failure.kind}-provider "${failure.name}" before migration.`,
            fallback:
                'Keep migration runnable by reusing existing local cache or existing placeholder behavior',
            suggestion: failure.reason,
        };
    });
}

function buildProviderRefreshDecisions(
    refresh: RemoteProviderCacheRefreshResult
): PlanningDecision[] {
    const decisions: PlanningDecision[] = [];

    for (const name of refresh.fetched) {
        decisions.push({
            id: crypto.randomUUID(),
            kind: 'runtime-completion',
            targetModule: 'runtime',
            targetId: `provider:refresh:${name}`,
            summary: `Refresh remote provider cache for ${name}`,
            reason: 'Download succeeded and local cache was updated before migration',
            sourcePaths: [],
        });
    }

    for (const name of refresh.skipped) {
        decisions.push({
            id: crypto.randomUUID(),
            kind: 'runtime-completion',
            targetModule: 'runtime',
            targetId: `provider:reuse:${name}`,
            summary: `Reuse fresh provider cache for ${name}`,
            reason: 'Existing local cache is still within provider interval',
            sourcePaths: [],
        });
    }

    for (const failure of refresh.failed) {
        decisions.push({
            id: crypto.randomUUID(),
            kind: 'fallback-map',
            targetModule: failure.kind === 'proxy' ? 'proxy' : 'rule',
            targetId: `provider:fallback:${failure.kind}:${failure.name}`,
            summary: `Fallback to existing cache behavior for ${failure.kind}-provider ${failure.name}`,
            reason: failure.reason,
            sourcePaths: [
                `${failure.kind === 'proxy' ? 'proxy-providers' : 'rule-providers'}.${failure.name}`,
            ],
        });
    }

    return decisions;
}
