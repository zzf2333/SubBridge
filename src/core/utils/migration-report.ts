import type { MigrationIssue } from '../types/migration';
import type { MigrationReport } from '../types/migration-report';

export function buildFailureReport(issue: MigrationIssue): MigrationReport {
    return {
        summary: {
            runnable: false,
            profile: 'proxy-only',
            migratorVersion: '0.1.0-dev',
            sourceFormat: 'clash',
            exactMappings: 0,
            degradedMappings: 0,
            droppedMappings: 0,
            fatalIssues: issue.level === 'fatal' ? 1 : 0,
            warningIssues: issue.level === 'warning' ? 1 : 0,
        },
        modules: [],
        issues: [issue],
        behaviorChanges: [],
        decisions: [],
        repairs: [],
        display: {
            status: 'failed',
            summaryLine: 'Migration failed before planning completed.',
            highlights: ['failed | profile=proxy-only'],
            issueHighlights: {
                fatal:
                    issue.level === 'fatal'
                        ? [{ module: issue.module, summary: issue.message }]
                        : [],
                warning:
                    issue.level === 'warning'
                        ? [{ module: issue.module, summary: issue.message }]
                        : [],
            },
            providerStats: {
                fetched: 0,
                skipped: 0,
                failed: 0,
            },
            providerHighlights: [],
            decisionHighlights: [],
            repairHighlights: [],
            behaviorHighlights: [],
        },
    };
}
