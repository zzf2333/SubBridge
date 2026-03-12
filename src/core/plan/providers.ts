import { MigrationErrorCode, type MigrationIssue } from '../types/migration';
import type { PlanningDecision, PlannedOutbound, PlannedRepair } from '../types/migration-plan';
import type { NormalizedProviderRef } from '../types/normalized-clash';
import { createRepair } from './repair';

export function planProxyProviderOutbounds(providers: NormalizedProviderRef[]): {
    outbounds: PlannedOutbound[];
    issues: MigrationIssue[];
    decisions: PlanningDecision[];
    repairs: PlannedRepair[];
} {
    const outbounds: PlannedOutbound[] = [];
    const issues: MigrationIssue[] = [];
    const decisions: PlanningDecision[] = [];
    const repairs: PlannedRepair[] = [];

    for (const provider of providers) {
        if (provider.type !== 'proxy') {
            continue;
        }

        if (provider.expandedProxyNames && provider.expandedProxyNames.length > 0) {
            continue;
        }

        outbounds.push({
            id: crypto.randomUUID(),
            sourcePaths: [provider.sourcePath],
            status: 'degraded',
            decision: 'fallback-map',
            notes: collectProviderNotes(provider),
            type: 'selector',
            tag: provider.name,
            payload: {
                outbounds: ['direct'],
                default: 'direct',
            },
        });

        issues.push({
            id: crypto.randomUUID(),
            level: 'warning',
            code: MigrationErrorCode.UNRESOLVABLE_DEPENDENCY,
            module: 'group',
            sourcePath: provider.sourcePath,
            objectId: provider.id,
            objectStableKey: provider.stableKey,
            objectName: provider.name,
            message: `Proxy-provider "${provider.name}" is emitted as a direct placeholder in V1`,
            impact: 'Groups can keep the provider member structure, but provider contents are not expanded into concrete proxy outbounds.',
            fallback:
                'Emit the provider as a selector outbound with direct as the only runnable member',
            suggestion:
                'If provider contents are required, expand the provider before migration or wait for provider fetch support.',
        });

        decisions.push({
            id: crypto.randomUUID(),
            kind: 'fallback-map',
            targetModule: 'group',
            targetId: provider.id,
            summary: `Emit proxy-provider ${provider.name} as direct placeholder outbound`,
            reason: 'V1 preserves provider member references by materializing proxy-providers as runnable placeholder selector outbounds',
            sourcePaths: [provider.sourcePath],
        });

        repairs.push(
            createRepair({
                kind: 'rewrite',
                targetModule: 'group',
                targetId: provider.id,
                summary: `Rewrite proxy-provider ${provider.name} as direct placeholder outbound`,
                before: 'Clash proxy-provider member that requires remote expansion',
                after: 'Runnable selector outbound with direct as the only member',
                reason: 'V1 does not fetch or expand provider contents but preserves provider member structure',
                sourcePaths: [provider.sourcePath],
            })
        );
    }

    return { outbounds, issues, decisions, repairs };
}

function collectProviderNotes(provider: NormalizedProviderRef): string[] {
    const notes = [
        'proxy-provider emitted as placeholder',
        'provider members are not expanded in V1',
    ];

    if (provider.vehicle) {
        notes.push(`provider-vehicle:${provider.vehicle}`);
    }

    if (provider.url) {
        notes.push('provider-source:remote');
    } else if (provider.path) {
        notes.push('provider-source:file');
    }

    return notes;
}
