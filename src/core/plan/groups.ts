import { MigrationErrorCode, type MigrationIssue } from '../types/migration';
import type { PlanningDecision, PlannedOutbound, PlannedRepair } from '../types/migration-plan';
import type { MigrationAnalysis } from '../types/migration-analysis';
import type { NormalizedGroup } from '../types/normalized-clash';
import { createRepair } from './repair';

export function planGroupOutbounds(
    groups: NormalizedGroup[],
    analysis: MigrationAnalysis,
    plannedProxyTags: Set<string>
): {
    outbounds: PlannedOutbound[];
    issues: MigrationIssue[];
    decisions: PlanningDecision[];
    repairs: PlannedRepair[];
} {
    const outbounds: PlannedOutbound[] = [];
    const issues: MigrationIssue[] = [];
    const decisions: PlanningDecision[] = [];
    const repairs: PlannedRepair[] = [];
    const proxyTags = new Set(plannedProxyTags);
    const providerTags = new Set(analysis.graph.proxyProviderNames);
    const cycleEdges = collectCycleEdges(analysis);
    const filteredMembersByGroup = new Map<string, string[]>();
    const resolvableGroups = resolveGroupTags(groups, proxyTags, providerTags, cycleEdges);

    for (const group of groups) {
        const status = analysis.objectStatuses.groups[group.id] ?? 'exact';
        const mappedType = mapGroupType(group.type);
        const providerMembers = group.members.filter(
            (member) => member.kind === 'provider' && providerTags.has(member.name)
        );
        const memberTags =
            filteredMembersByGroup.get(group.name) ??
            group.members
                .map((member) => normalizeGroupMemberTag(member.name))
                .filter(
                    (name) =>
                        proxyTags.has(name) ||
                        providerTags.has(name) ||
                        name === 'direct' ||
                        name === 'block' ||
                        resolvableGroups.has(name)
                );
        filteredMembersByGroup.set(group.name, memberTags);
        const originalMemberNames = group.members.map((member) => member.name);

        if (
            providerMembers.length > 0 &&
            providerMembers.some((member) => !memberTags.includes(member.name))
        ) {
            issues.push({
                id: crypto.randomUUID(),
                level: 'info',
                code: MigrationErrorCode.UNRESOLVABLE_DEPENDENCY,
                module: 'group',
                sourcePath: group.sourcePath,
                objectId: group.id,
                objectStableKey: group.stableKey,
                objectName: group.name,
                message: `Group "${group.name}" references provider members that are not expanded in V1`,
                impact: 'Provider-backed members are excluded from the planned outbound members until provider expansion is implemented.',
                fallback: 'Keep concrete members and drop unresolved provider placeholders',
            });
            decisions.push({
                id: crypto.randomUUID(),
                kind: 'fallback-map',
                targetModule: 'group',
                targetId: group.id,
                summary: `Exclude provider members from group ${group.name}`,
                reason: 'Only unresolved provider placeholders are pruned in V1 planner',
                sourcePaths: [group.sourcePath],
            });
            repairs.push(
                createRepair({
                    kind: 'prune',
                    targetModule: 'group',
                    targetId: group.id,
                    summary: `Prune provider-backed members from group ${group.name}`,
                    before: `Members: ${originalMemberNames.join(', ')}`,
                    after: `Members: ${memberTags.join(', ') || '(empty)'}`,
                    reason: 'Only unresolved provider placeholders are pruned in V1',
                    sourcePaths: [group.sourcePath],
                })
            );
        }

        if (group.type === 'relay') {
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.UNSUPPORTED_GROUP_TYPE,
                module: 'group',
                sourcePath: group.sourcePath,
                objectId: group.id,
                objectStableKey: group.stableKey,
                objectName: group.name,
                message: `Group "${group.name}" uses relay semantics that are not implemented in V1`,
                impact: 'The planner keeps the group runnable, but the original relay chain behavior is not preserved.',
                fallback:
                    'Lower the relay group to a selector outbound and keep the same member order for manual selection',
                suggestion:
                    'If chained forwarding is required, rewrite this group as explicit manual selection or wait for a future relay-chain implementation.',
            });
            decisions.push({
                id: crypto.randomUUID(),
                kind: 'fallback-map',
                targetModule: 'group',
                targetId: group.id,
                summary: `Degrade relay group ${group.name} to selector`,
                reason: 'V1 does not implement chained relay semantics, so relay groups are emitted as runnable selector outbounds',
                sourcePaths: [group.sourcePath],
            });
            repairs.push(
                createRepair({
                    kind: 'rewrite',
                    targetModule: 'group',
                    targetId: group.id,
                    summary: `Rewrite relay group ${group.name} as selector`,
                    before: 'Clash relay chain semantics',
                    after: 'Runnable selector outbound with preserved member order',
                    reason: 'V1 does not implement chained relay semantics',
                    sourcePaths: [group.sourcePath],
                })
            );
        }

        if (group.type === 'unknown') {
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.UNSUPPORTED_GROUP_TYPE,
                module: 'group',
                sourcePath: group.sourcePath,
                objectId: group.id,
                objectStableKey: group.stableKey,
                objectName: group.name,
                message: `Group "${group.name}" uses unsupported type`,
                impact: 'The group is dropped from planned outbounds',
                fallback: 'Unsupported group types are skipped in V1 planner',
            });
            decisions.push({
                id: crypto.randomUUID(),
                kind: 'drop-unsupported',
                targetModule: 'group',
                targetId: group.id,
                summary: `Drop unsupported group ${group.name}`,
                reason: 'Group type is not supported in V1 planner',
                sourcePaths: [group.sourcePath],
            });
            repairs.push(
                createRepair({
                    kind: 'drop',
                    targetModule: 'group',
                    targetId: group.id,
                    summary: `Drop unsupported group ${group.name}`,
                    before: `Unsupported group type ${group.type}`,
                    after: 'No planned outbound emitted',
                    reason: 'Unsupported group types are skipped in V1 planner',
                    sourcePaths: [group.sourcePath],
                })
            );
            continue;
        }

        if (memberTags.length < originalMemberNames.length) {
            repairs.push(
                createRepair({
                    kind: 'prune',
                    targetModule: 'group',
                    targetId: group.id,
                    summary: `Prune unresolved members from group ${group.name}`,
                    before: `Members: ${originalMemberNames.join(', ')}`,
                    after: `Members: ${memberTags.join(', ') || '(empty)'}`,
                    reason: 'Broken references, cycle edges, or unresolvable members were removed to keep the group runnable',
                    sourcePaths: [group.sourcePath],
                })
            );
        }

        if (memberTags.length === 0 && providerMembers.length > 0) {
            memberTags.push('direct');
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.EMPTY_GROUP,
                module: 'group',
                sourcePath: group.sourcePath,
                objectId: group.id,
                objectStableKey: group.stableKey,
                objectName: group.name,
                message: `Group "${group.name}" falls back to direct because provider members are not expanded in V1`,
                impact: 'The group remains runnable, but provider-selected proxy behavior is replaced with direct traffic.',
                fallback:
                    'Emit the group with a direct member to preserve references and keep the config runnable',
            });
            decisions.push({
                id: crypto.randomUUID(),
                kind: 'fallback-map',
                targetModule: 'group',
                targetId: group.id,
                summary: `Fallback provider-only group ${group.name} to direct`,
                reason: 'Provider placeholders are recognized but not expanded, so the group is rewritten to a direct-only runnable fallback',
                sourcePaths: [group.sourcePath],
            });
            repairs.push(
                createRepair({
                    kind: 'rewrite',
                    targetModule: 'group',
                    targetId: group.id,
                    summary: `Rewrite provider-only group ${group.name} to direct fallback`,
                    before: 'No concrete members remained after provider pruning',
                    after: 'Group emitted with direct as the only runnable member',
                    reason: 'Preserve group references and keep provider-heavy configs runnable in V1',
                    sourcePaths: [group.sourcePath],
                })
            );
        }

        if (memberTags.length === 0) {
            issues.push({
                id: crypto.randomUUID(),
                level: 'warning',
                code: MigrationErrorCode.EMPTY_GROUP,
                module: 'group',
                sourcePath: group.sourcePath,
                objectId: group.id,
                objectStableKey: group.stableKey,
                objectName: group.name,
                message: `Group "${group.name}" has no valid members after reference filtering`,
                impact: 'The group is dropped from planned outbounds',
                fallback: 'The planner skips empty groups',
            });
            decisions.push({
                id: crypto.randomUUID(),
                kind: 'drop-unsupported',
                targetModule: 'group',
                targetId: group.id,
                summary: `Drop empty group ${group.name}`,
                reason: 'No valid members are available after filtering broken references',
                sourcePaths: [group.sourcePath],
            });
            repairs.push(
                createRepair({
                    kind: 'drop',
                    targetModule: 'group',
                    targetId: group.id,
                    summary: `Drop empty group ${group.name}`,
                    before: 'Group existed in input',
                    after: 'No planned outbound emitted',
                    reason: 'No valid members remain after planner repair and reference filtering',
                    sourcePaths: [group.sourcePath],
                })
            );
            continue;
        }

        const notes = collectGroupNotes(group.type, memberTags.length);
        outbounds.push({
            id: crypto.randomUUID(),
            sourcePaths: [group.sourcePath],
            status,
            decision: status === 'degraded' ? 'fallback-map' : 'direct-map',
            notes,
            type: mappedType,
            tag: group.name,
            payload: buildGroupPayload(group, mappedType, memberTags),
        });
        decisions.push({
            id: crypto.randomUUID(),
            kind: status === 'degraded' ? 'fallback-map' : 'direct-map',
            targetModule: 'group',
            targetId: group.id,
            summary: `Plan outbound group ${group.name}`,
            reason: getGroupDecisionReason(group.type, mappedType),
            sourcePaths: [group.sourcePath],
        });
    }

    return { outbounds, issues, decisions, repairs };
}

function resolveGroupTags(
    groups: NormalizedGroup[],
    proxyTags: Set<string>,
    providerTags: Set<string>,
    cycleEdges: Set<string>
): Set<string> {
    const groupMembers = new Map(
        groups.map((group) => [
            group.name,
            group.members
                .map((member) => normalizeGroupMemberTag(member.name))
                .filter((name) => !cycleEdges.has(`${group.name}->${name}`)),
        ])
    );
    const resolvable = new Set<string>();
    let changed = true;

    while (changed) {
        changed = false;

        for (const [groupName, members] of groupMembers.entries()) {
            if (resolvable.has(groupName)) {
                continue;
            }

            const group = groups.find((item) => item.name === groupName);
            const hasProviderMembers = Boolean(
                group?.members.some(
                    (member) => member.kind === 'provider' && providerTags.has(member.name)
                )
            );

            const canResolve =
                members.some(
                    (name) =>
                        proxyTags.has(name) ||
                        providerTags.has(name) ||
                        name === 'direct' ||
                        name === 'block' ||
                        resolvable.has(name)
                ) || hasProviderMembers;

            if (canResolve) {
                resolvable.add(groupName);
                changed = true;
            }
        }
    }

    return resolvable;
}

function normalizeGroupMemberTag(name: string): string {
    switch (name) {
        case 'DIRECT':
        case 'PASS':
            return 'direct';
        case 'REJECT':
            return 'block';
        case 'GLOBAL':
            return 'proxy';
        default:
            return name;
    }
}

function collectCycleEdges(analysis: MigrationAnalysis): Set<string> {
    const edges = new Set<string>();

    for (const ref of analysis.graph.circularReferences) {
        if (ref.kind !== 'group') {
            continue;
        }

        for (let index = 0; index < ref.cycle.length - 1; index += 1) {
            const from = ref.cycle[index];
            const to = ref.cycle[index + 1];
            if (from && to) {
                edges.add(`${from}->${to}`);
            }
        }
    }

    return edges;
}

function mapGroupType(type: NormalizedGroup['type']): string {
    switch (type) {
        case 'select':
        case 'load-balance':
            return 'selector';
        case 'url-test':
        case 'fallback':
            return 'urltest';
        case 'relay':
            return 'selector';
        default:
            return 'selector';
    }
}

function buildGroupPayload(
    group: NormalizedGroup,
    mappedType: string,
    outbounds: string[]
): Record<string, unknown> {
    if (mappedType === 'urltest') {
        return {
            outbounds,
            url: group.strategy?.testUrl ?? 'https://www.gstatic.com/generate_204',
            interval: group.strategy?.intervalSeconds ? `${group.strategy.intervalSeconds}s` : '3m',
            tolerance: group.strategy?.tolerance,
        };
    }

    return {
        outbounds,
        default: outbounds[0],
    };
}

function collectGroupNotes(type: NormalizedGroup['type'], memberCount: number): string[] {
    const notes = [`members:${memberCount}`];
    if (type === 'fallback') {
        notes.push('fallback degraded to urltest');
    }
    if (type === 'load-balance') {
        notes.push('load-balance degraded to selector');
    }
    if (type === 'relay') {
        notes.push('relay degraded to selector');
        notes.push('relay-chain semantics are not implemented in V1');
    }
    return notes;
}

function getGroupDecisionReason(type: NormalizedGroup['type'], mappedType: string): string {
    if (type === 'relay') {
        return 'Group type relay is lowered to selector in V1 planner because chained relay semantics are not implemented';
    }
    if (type === 'fallback' || type === 'load-balance') {
        return `Group type ${type} is lowered to ${mappedType} in V1 planner`;
    }
    return `Group type ${type} maps directly to ${mappedType}`;
}
