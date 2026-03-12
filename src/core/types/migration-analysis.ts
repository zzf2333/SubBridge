import type { LifecycleStatus, MigrationIssue } from './migration';

export interface GraphEdge {
    from: string;
    to: string;
    kind: 'group-member' | 'rule-target' | 'dns-detour' | 'route-final';
}

export interface MissingReference {
    source: string;
    target: string;
    kind: string;
    sourcePath?: string;
}

export interface CircularReference {
    cycle: string[];
    kind: 'group' | 'route';
}

export interface ReferenceGraph {
    proxyNames: string[];
    groupNames: string[];
    proxyProviderNames: string[];
    ruleProviderNames: string[];
    ruleTargets: string[];
    groupDependencies: GraphEdge[];
    routeDependencies: GraphEdge[];
    missingReferences: MissingReference[];
    circularReferences: CircularReference[];
}

export interface CapabilityResultBase {
    status: LifecycleStatus;
    supportedFeatures: string[];
    unsupportedFeatures: string[];
    degradations: string[];
}

export interface ProxyCapabilityResult extends CapabilityResultBase {
    proxyType: string;
}

export interface GroupCapabilityResult extends CapabilityResultBase {
    groupType: string;
    recommendedFallback?: 'selector' | 'urltest' | 'direct';
}

export interface RuleCapabilityResult extends CapabilityResultBase {
    matcherType: string;
    recommendedFallback?: string;
}

export interface DnsCapabilityResult extends CapabilityResultBase {}
export interface TunCapabilityResult extends CapabilityResultBase {}

export interface CapabilityAnalysis {
    proxies: Record<string, ProxyCapabilityResult>;
    groups: Record<string, GroupCapabilityResult>;
    rules: Record<string, RuleCapabilityResult>;
    dns?: DnsCapabilityResult;
    tun?: TunCapabilityResult;
}

export interface RuntimeIntent {
    profile: 'proxy-only' | 'mixed-client' | 'tun-client';
    requiresDns: boolean;
    requiresTun: boolean;
    requiresMixedInbound: boolean;
    reasoning: string[];
}

export interface ObjectStatusMap {
    proxies: Record<string, LifecycleStatus>;
    groups: Record<string, LifecycleStatus>;
    rules: Record<string, LifecycleStatus>;
    dns?: LifecycleStatus;
    tun?: LifecycleStatus;
}

export interface MigrationAnalysis {
    graph: ReferenceGraph;
    capabilities: CapabilityAnalysis;
    runtime: RuntimeIntent;
    objectStatuses: ObjectStatusMap;
    issues: MigrationIssue[];
}
