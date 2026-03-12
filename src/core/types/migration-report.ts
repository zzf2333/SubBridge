import type { LifecycleStatus, MigrationIssue, ModuleName } from './migration';
import type { PlannedRepair, PlanningDecision } from './migration-plan';

export interface BehaviorChange {
    id: string;
    module: ModuleName;
    summary: string;
    before: string;
    after: string;
    reason: string;
    sourcePaths: string[];
}

export interface ModuleReportItem {
    id: string;
    name: string;
    status: LifecycleStatus;
    sourcePaths: string[];
    notes: string[];
}

export interface ModuleReport {
    module: ModuleName;
    summary: string;
    exact: number;
    degraded: number;
    dropped: number;
    fatal: number;
    items: ModuleReportItem[];
}

export interface ReportDisplayEntry {
    module?: ModuleName;
    summary: string;
}

export interface MigrationReportDisplay {
    status: 'runnable' | 'degraded-runnable' | 'failed';
    summaryLine: string;
    highlights: string[];
    issueHighlights: {
        fatal: ReportDisplayEntry[];
        warning: ReportDisplayEntry[];
    };
    providerStats: {
        fetched: number;
        skipped: number;
        failed: number;
    };
    providerHighlights: string[];
    decisionHighlights: string[];
    repairHighlights: string[];
    behaviorHighlights: string[];
}

export interface MigrationReport {
    summary: {
        runnable: boolean;
        profile: 'proxy-only' | 'mixed-client' | 'tun-client';
        migratorVersion: string;
        sourceFormat: 'clash' | 'clash-meta';
        sourceVersion?: string;
        exactMappings: number;
        degradedMappings: number;
        droppedMappings: number;
        fatalIssues: number;
        warningIssues: number;
    };
    modules: ModuleReport[];
    issues: MigrationIssue[];
    behaviorChanges: BehaviorChange[];
    decisions: PlanningDecision[];
    repairs: PlannedRepair[];
    display: MigrationReportDisplay;
}

export interface ValidationResult {
    runnable: boolean;
    schemaValid: boolean;
    referenceValid: boolean;
    runtimeValid: boolean;
    issues: MigrationIssue[];
}
