import type { MigrationAnalysis } from '../types/migration-analysis';
import type { MigrationPlan } from '../types/migration-plan';
import type {
    MigrationReportDisplay,
    MigrationReport,
    ModuleReport,
    ModuleReportItem,
    ValidationResult,
} from '../types/migration-report';
import type { MigrationIssue, ModuleName } from '../types/migration';
import type { NormalizedClashConfig } from '../types/normalized-clash';
import { collectBehaviorChanges } from './behavior';
import type { PlanningDecision } from '../types/migration-plan';

export function buildMigrationReport(
    normalized: NormalizedClashConfig,
    normalizeIssues: MigrationIssue[],
    analysis: MigrationAnalysis,
    plan: MigrationPlan,
    validation: ValidationResult
): MigrationReport {
    const issues = [...normalizeIssues, ...analysis.issues, ...plan.issues, ...validation.issues];

    const behaviorChanges = collectBehaviorChanges(plan);

    return {
        summary: {
            runnable: validation.runnable,
            profile: plan.profile,
            migratorVersion: normalized.meta.migratorVersion,
            sourceFormat: normalized.meta.sourceFormat,
            sourceVersion: normalized.meta.sourceVersion,
            exactMappings: countStatus(analysis.objectStatuses, 'exact'),
            degradedMappings: countStatus(analysis.objectStatuses, 'degraded'),
            droppedMappings: countStatus(analysis.objectStatuses, 'dropped'),
            fatalIssues: issues.filter((issue) => issue.level === 'fatal').length,
            warningIssues: issues.filter((issue) => issue.level === 'warning').length,
        },
        modules: buildModuleReports(normalized, analysis, issues),
        issues,
        behaviorChanges,
        decisions: plan.decisions,
        repairs: plan.repairs,
        display: buildDisplay(
            plan.profile,
            validation.runnable,
            issues,
            plan.decisions,
            plan.repairs,
            behaviorChanges
        ),
    };
}

export function refreshMigrationReportDerivedFields(report: MigrationReport): MigrationReport {
    const fatalIssues = report.issues.filter((issue) => issue.level === 'fatal');
    const warningIssues = report.issues.filter((issue) => issue.level === 'warning');

    report.summary.fatalIssues = fatalIssues.length;
    report.summary.warningIssues = warningIssues.length;
    report.display = buildDisplay(
        report.summary.profile,
        report.summary.runnable,
        report.issues,
        report.decisions,
        report.repairs,
        report.behaviorChanges
    );

    return report;
}

function countStatus(
    statuses: MigrationAnalysis['objectStatuses'],
    target: 'exact' | 'degraded' | 'dropped'
): number {
    return [
        ...Object.values(statuses.proxies),
        ...Object.values(statuses.groups),
        ...Object.values(statuses.rules),
        ...(statuses.dns ? [statuses.dns] : []),
        ...(statuses.tun ? [statuses.tun] : []),
    ].filter((status) => status === target).length;
}

function buildModuleReports(
    normalized: NormalizedClashConfig,
    analysis: MigrationAnalysis,
    issues: MigrationIssue[]
): ModuleReport[] {
    return [
        buildModuleReport(
            'proxy',
            normalized.proxies.map((proxy) => ({
                id: proxy.id,
                name: proxy.name,
                status: analysis.objectStatuses.proxies[proxy.id] ?? 'exact',
                sourcePaths: [proxy.sourcePath],
                notes: proxy.features,
            })),
            issues
        ),
        buildModuleReport(
            'group',
            normalized.groups.map((group) => ({
                id: group.id,
                name: group.name,
                status: analysis.objectStatuses.groups[group.id] ?? 'exact',
                sourcePaths: [group.sourcePath],
                notes: group.strategy?.expectedBehavior ? [group.strategy.expectedBehavior] : [],
            })),
            issues
        ),
        buildModuleReport(
            'rule',
            normalized.rules.map((rule) => ({
                id: rule.id,
                name: rule.raw,
                status: analysis.objectStatuses.rules[rule.id] ?? 'exact',
                sourcePaths: [rule.sourcePath],
                notes: [rule.matcher.type],
            })),
            issues
        ),
        buildModuleReport(
            'dns',
            normalized.dns
                ? [
                      {
                          id: normalized.dns.sourcePath,
                          name: 'dns',
                          status: analysis.objectStatuses.dns ?? 'exact',
                          sourcePaths: [normalized.dns.sourcePath],
                          notes: normalized.dns.enhancedMode ? [normalized.dns.enhancedMode] : [],
                      },
                  ]
                : [],
            issues
        ),
        buildModuleReport(
            'tun',
            normalized.tun
                ? [
                      {
                          id: normalized.tun.sourcePath,
                          name: 'tun',
                          status: analysis.objectStatuses.tun ?? 'exact',
                          sourcePaths: [normalized.tun.sourcePath],
                          notes: normalized.tun.stack ? [normalized.tun.stack] : [],
                      },
                  ]
                : [],
            issues
        ),
    ].filter((report) => report.items.length > 0);
}

function buildModuleReport(
    module: ModuleName,
    items: ModuleReportItem[],
    issues: MigrationIssue[]
): ModuleReport {
    const relevantIssues = issues.filter((issue) => issue.module === module);

    return {
        module,
        summary: `${items.length} items, ${relevantIssues.length} related issues`,
        exact: items.filter((item) => item.status === 'exact').length,
        degraded: items.filter((item) => item.status === 'degraded').length,
        dropped: items.filter((item) => item.status === 'dropped').length,
        fatal: relevantIssues.filter((issue) => issue.level === 'fatal').length,
        items,
    };
}

function buildDisplay(
    profile: MigrationPlan['profile'],
    runnable: boolean,
    issues: MigrationIssue[],
    decisions: MigrationPlan['decisions'],
    repairs: MigrationPlan['repairs'],
    behaviorChanges: MigrationReport['behaviorChanges']
): MigrationReportDisplay {
    const fatalIssues = issues.filter((issue) => issue.level === 'fatal');
    const warningIssues = issues.filter((issue) => issue.level === 'warning');
    const degraded = warningIssues.length > 0 || repairs.length > 0 || behaviorChanges.length > 0;
    const status: MigrationReportDisplay['status'] = !runnable
        ? 'failed'
        : degraded
          ? 'degraded-runnable'
          : 'runnable';

    const highlights = [
        `${status} | profile=${profile}`,
        `issues=${issues.length} (fatal=${fatalIssues.length}, warning=${warningIssues.length})`,
        `repairs=${repairs.length}, decisions=${decisions.length}, behaviorChanges=${behaviorChanges.length}`,
    ];
    const providerStats = collectProviderStats(decisions);

    return {
        status,
        summaryLine: buildSummaryLine(
            status,
            profile,
            fatalIssues.length,
            warningIssues.length,
            repairs.length
        ),
        highlights,
        issueHighlights: {
            fatal: fatalIssues.slice(0, 5).map((issue) => ({
                module: issue.module,
                summary: issue.objectName
                    ? `[${issue.objectName}] ${issue.message}`
                    : issue.message,
            })),
            warning: warningIssues.slice(0, 5).map((issue) => ({
                module: issue.module,
                summary: issue.objectName
                    ? `[${issue.objectName}] ${issue.message}`
                    : issue.message,
            })),
        },
        providerStats,
        providerHighlights: decisions
            .filter((decision) => isProviderRefreshDecision(decision))
            .slice(0, 5)
            .map((decision) => decision.summary),
        decisionHighlights: decisions.slice(0, 5).map((decision) => decision.summary),
        repairHighlights: repairs.slice(0, 5).map((repair) => repair.summary),
        behaviorHighlights: behaviorChanges.slice(0, 5).map((change) => change.summary),
    };
}

function isProviderRefreshDecision(decision: PlanningDecision): boolean {
    if (decision.targetId?.startsWith('provider:')) {
        return true;
    }

    return decision.sourcePaths.some(
        (path) => path.startsWith('proxy-providers.') || path.startsWith('rule-providers.')
    );
}

function collectProviderStats(decisions: MigrationPlan['decisions']): {
    fetched: number;
    skipped: number;
    failed: number;
} {
    let fetched = 0;
    let skipped = 0;
    let failed = 0;

    for (const decision of decisions) {
        if (decision.targetId?.startsWith('provider:refresh:')) {
            fetched += 1;
            continue;
        }
        if (decision.targetId?.startsWith('provider:reuse:')) {
            skipped += 1;
            continue;
        }
        if (decision.targetId?.startsWith('provider:fallback:')) {
            failed += 1;
        }
    }

    return { fetched, skipped, failed };
}

function buildSummaryLine(
    status: MigrationReportDisplay['status'],
    profile: MigrationPlan['profile'],
    fatalCount: number,
    warningCount: number,
    repairCount: number
): string {
    if (status === 'failed') {
        return `Migration failed for profile ${profile}: ${fatalCount} fatal issue(s), ${warningCount} warning(s).`;
    }

    if (status === 'degraded-runnable') {
        return `Migration produced a runnable ${profile} config with ${warningCount} warning(s) and ${repairCount} repair(s).`;
    }

    return `Migration produced a runnable ${profile} config without degradations.`;
}
