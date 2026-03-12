import type { MigrationOptions, MigrationIssue } from '../types/migration';
import type { MigrationAnalysis, ObjectStatusMap } from '../types/migration-analysis';
import type { NormalizedClashConfig } from '../types/normalized-clash';
import { analyzeCapabilities } from './capabilities';
import { analyzeReferences } from './references';
import { analyzeRuntimeIntent } from './runtime';

export function analyzeMigration(
    config: NormalizedClashConfig,
    options: MigrationOptions
): MigrationAnalysis {
    const referenceResult = analyzeReferences(config);
    const capabilities = analyzeCapabilities(config);
    const runtime = analyzeRuntimeIntent(config, options);
    const issues: MigrationIssue[] = [...referenceResult.issues];

    return {
        graph: referenceResult.graph,
        capabilities,
        runtime,
        objectStatuses: buildObjectStatuses(config),
        issues,
    };
}

function buildObjectStatuses(config: NormalizedClashConfig): ObjectStatusMap {
    const capabilities = analyzeCapabilities(config);

    return {
        proxies: Object.fromEntries(
            config.proxies.map((proxy) => [
                proxy.id,
                capabilities.proxies[proxy.id]?.status ?? 'exact',
            ])
        ),
        groups: Object.fromEntries(
            config.groups.map((group) => [
                group.id,
                capabilities.groups[group.id]?.status ?? 'exact',
            ])
        ),
        rules: Object.fromEntries(
            config.rules.map((rule) => [rule.id, capabilities.rules[rule.id]?.status ?? 'exact'])
        ),
        dns: capabilities.dns?.status,
        tun: capabilities.tun?.status,
    };
}

export * from './references';
export * from './capabilities';
export * from './runtime';
