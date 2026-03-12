import type {
    DecisionKind,
    LifecycleStatus,
    MigrationIssue,
    ModuleName,
    PatchKind,
} from './migration';

export interface PlanningDecision {
    id: string;
    kind: DecisionKind;
    targetModule: ModuleName;
    targetId?: string;
    summary: string;
    reason: string;
    sourcePaths: string[];
}

export interface PlannedBase {
    id: string;
    sourcePaths: string[];
    status: LifecycleStatus;
    decision: DecisionKind;
    notes: string[];
}

export interface PlannedInbound extends PlannedBase {
    type: 'mixed' | 'tun' | 'http' | 'socks';
    tag: string;
    listen?: string;
    listenPort?: number;
    options: Record<string, unknown>;
}

export interface PlannedOutbound extends PlannedBase {
    type: string;
    tag: string;
    payload: Record<string, unknown>;
}

export interface PlannedDnsServer {
    tag: string;
    type: string;
    payload: Record<string, unknown>;
    sourcePaths: string[];
}

export interface PlannedDnsRule {
    type: string;
    payload: Record<string, unknown>;
    sourcePaths: string[];
}

export interface PlannedDns extends PlannedBase {
    servers: PlannedDnsServer[];
    rules: PlannedDnsRule[];
    final?: string;
    defaultDomainResolver?: string;
    strategy?: string;
    independentCache?: boolean;
    reverseMapping?: boolean;
    fakeip?: {
        enabled: boolean;
        inet4Range?: string;
        inet6Range?: string;
    };
}

export interface PlannedRouteRule {
    id: string;
    sourcePaths: string[];
    status: LifecycleStatus;
    notes: string[];
    payload: Record<string, unknown>;
}

export interface PlannedRuleSet {
    id: string;
    tag: string;
    sourcePaths: string[];
    status: LifecycleStatus;
    notes: string[];
    payload: Record<string, unknown>;
}

export interface PlannedRoute extends PlannedBase {
    rules: PlannedRouteRule[];
    ruleSets: PlannedRuleSet[];
    final?: string;
    autoDetectInterface?: boolean;
    geoip?: {
        enabled: boolean;
        downloadDetour?: string;
    };
    geosite?: {
        enabled: boolean;
        downloadDetour?: string;
    };
}

export interface PlannedPatch {
    id: string;
    kind: PatchKind;
    summary: string;
    reason: string;
}

export type RepairKind = 'rewrite' | 'prune' | 'drop' | 'runtime-patch';

export interface PlannedRepair {
    id: string;
    kind: RepairKind;
    targetModule: ModuleName;
    targetId?: string;
    summary: string;
    before: string;
    after: string;
    reason: string;
    sourcePaths: string[];
}

export interface MigrationPlan {
    profile: 'proxy-only' | 'mixed-client' | 'tun-client';
    inbounds: PlannedInbound[];
    outbounds: PlannedOutbound[];
    dns?: PlannedDns;
    route: PlannedRoute;
    patches: PlannedPatch[];
    repairs: PlannedRepair[];
    issues: MigrationIssue[];
    decisions: PlanningDecision[];
}
