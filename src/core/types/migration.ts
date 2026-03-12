import type { SingBoxConfig } from './singbox';
import type { NormalizedClashConfig } from './normalized-clash';
import type { MigrationAnalysis } from './migration-analysis';
import type { MigrationPlan } from './migration-plan';
import type { MigrationReport } from './migration-report';

export type LifecycleStatus = 'exact' | 'degraded' | 'dropped' | 'fatal';
export type IssueLevel = 'info' | 'warning' | 'fatal';
export type ModuleName =
    | 'general'
    | 'proxy'
    | 'group'
    | 'rule'
    | 'dns'
    | 'tun'
    | 'inbound'
    | 'route'
    | 'runtime'
    | 'report';

export type DecisionKind =
    | 'direct-map'
    | 'normalized-map'
    | 'fallback-map'
    | 'default-fill'
    | 'drop-unsupported'
    | 'runtime-completion'
    | 'reference-rewrite';

export enum MigrationErrorCode {
    INVALID_YAML = 'INVALID_YAML',
    EMPTY_CONFIG = 'EMPTY_CONFIG',
    SIZE_LIMIT_EXCEEDED = 'SIZE_LIMIT_EXCEEDED',
    INVALID_CONFIG_SHAPE = 'INVALID_CONFIG_SHAPE',
    UNSUPPORTED_PROTOCOL = 'UNSUPPORTED_PROTOCOL',
    MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
    INVALID_FIELD_VALUE = 'INVALID_FIELD_VALUE',
    UNSUPPORTED_FIELD = 'UNSUPPORTED_FIELD',
    CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
    MISSING_REFERENCE = 'MISSING_REFERENCE',
    EMPTY_GROUP = 'EMPTY_GROUP',
    UNSUPPORTED_GROUP_TYPE = 'UNSUPPORTED_GROUP_TYPE',
    INVALID_RULE_SYNTAX = 'INVALID_RULE_SYNTAX',
    UNSUPPORTED_RULE_TYPE = 'UNSUPPORTED_RULE_TYPE',
    INVALID_RULE_TARGET = 'INVALID_RULE_TARGET',
    INVALID_DNS_SERVER = 'INVALID_DNS_SERVER',
    UNSUPPORTED_DNS_FEATURE = 'UNSUPPORTED_DNS_FEATURE',
    CONVERSION_FAILED = 'CONVERSION_FAILED',
    VALIDATION_FAILED = 'VALIDATION_FAILED',
    INCOMPLETE_CONFIG = 'INCOMPLETE_CONFIG',
    UNRESOLVABLE_DEPENDENCY = 'UNRESOLVABLE_DEPENDENCY',
}

export enum PatchKind {
    ADD_DIRECT_OUTBOUND = 'add-direct-outbound',
    ADD_BLOCK_OUTBOUND = 'add-block-outbound',
    ADD_DEFAULT_SELECTOR = 'add-default-selector',
    ADD_AUTO_URLTEST_OUTBOUND = 'add-auto-urltest-outbound',
    ADD_DNS_ROUTE_RULE = 'add-dns-route-rule',
    ADD_CLASH_MODE_RULES = 'add-clash-mode-rules',
    REPAIR_ROUTE_FINAL = 'repair-route-final',
    PRUNE_INVALID_ROUTE_RULE = 'prune-invalid-route-rule',
    REPAIR_DNS_DETOUR = 'repair-dns-detour',
    NORMALIZE_TAG = 'normalize-tag',
}

export interface SourceLocation {
    path: string;
    line?: number;
    column?: number;
}

export interface MigrationIssue {
    id: string;
    level: IssueLevel;
    code: MigrationErrorCode;
    module: ModuleName;
    sourcePath?: string;
    objectId?: string;
    objectStableKey?: string;
    objectName?: string;
    message: string;
    impact: string;
    fallback?: string;
    suggestion?: string;
}

export interface MigrationOptions {
    targetProfile?: 'auto' | 'proxy-only' | 'mixed-client' | 'tun-client';
    strictSchemaValidation?: boolean;
    emitReport?: boolean;
    emitIntermediateArtifacts?: boolean;
    debug?: boolean;
    sourceBaseDir?: string;
}

export interface IntermediateArtifacts {
    normalized?: NormalizedClashConfig;
    analysis?: MigrationAnalysis;
    plan?: MigrationPlan;
}

export interface ProviderRefreshSummary {
    fetched: number;
    skipped: number;
    failed: number;
}

export interface MigrationResult {
    success: boolean;
    runnable: boolean;
    config?: SingBoxConfig;
    report: MigrationReport;
    issues: MigrationIssue[];
    providerRefresh?: ProviderRefreshSummary;
    artifacts?: IntermediateArtifacts;
}
