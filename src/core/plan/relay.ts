import { MigrationErrorCode, type MigrationIssue } from '../types/migration';
import type { PlanningDecision, PlannedOutbound, PlannedRepair } from '../types/migration-plan';
import type { NormalizedGroup } from '../types/normalized-clash';
import { createRepair } from './repair';

const UNCHAINABLE_TYPES = new Set(['selector', 'urltest', 'direct', 'block', 'dns']);

export function materializeRelayChains(
    groups: NormalizedGroup[],
    outbounds: PlannedOutbound[]
): {
    outbounds: PlannedOutbound[];
    issues: MigrationIssue[];
    decisions: PlanningDecision[];
    repairs: PlannedRepair[];
} {
    const relayGroups = groups.filter((group) => group.type === 'relay');
    if (relayGroups.length === 0) {
        return { outbounds, issues: [], decisions: [], repairs: [] };
    }

    const outboundMap = new Map(outbounds.map((outbound) => [outbound.tag, outbound]));
    const nextOutbounds = [...outbounds];
    const issues: MigrationIssue[] = [];
    const decisions: PlanningDecision[] = [];
    const repairs: PlannedRepair[] = [];

    for (const group of relayGroups) {
        const currentGroup = outboundMap.get(group.name);
        if (!currentGroup || currentGroup.type !== 'selector') {
            continue;
        }

        const memberTags = Array.isArray(currentGroup.payload.outbounds)
            ? currentGroup.payload.outbounds.filter((tag): tag is string => typeof tag === 'string')
            : [];
        const chainMembers = memberTags
            .map((tag) => outboundMap.get(tag))
            .filter(Boolean) as PlannedOutbound[];

        if (chainMembers.length !== memberTags.length || chainMembers.length === 0) {
            continue;
        }

        if (chainMembers.some((member) => UNCHAINABLE_TYPES.has(member.type))) {
            continue;
        }

        const chainTags: string[] = [];
        let previousTag: string | undefined;

        for (let index = 0; index < chainMembers.length; index += 1) {
            const member = chainMembers[index];
            const chainTag =
                index === chainMembers.length - 1
                    ? group.name
                    : buildRelayLinkTag(group.name, index, member.tag);
            const payload = {
                ...member.payload,
                detour: previousTag,
            };

            const chainedOutbound: PlannedOutbound = {
                id: crypto.randomUUID(),
                sourcePaths: [group.sourcePath, ...member.sourcePaths],
                status: 'degraded',
                decision: 'fallback-map',
                notes: [
                    'relay partially materialized as chained detour outbounds',
                    `relay-hop:${index + 1}/${chainMembers.length}`,
                    `relay-source:${member.tag}`,
                ],
                type: member.type,
                tag: chainTag,
                payload,
            };

            if (index === chainMembers.length - 1 && currentGroup) {
                removeOutboundByTag(nextOutbounds, group.name);
            }

            nextOutbounds.push(chainedOutbound);
            outboundMap.set(chainTag, chainedOutbound);
            chainTags.push(chainTag);
            previousTag = chainTag;
        }

        issues.push({
            id: crypto.randomUUID(),
            level: 'warning',
            code: MigrationErrorCode.UNSUPPORTED_GROUP_TYPE,
            module: 'group',
            sourcePath: group.sourcePath,
            objectId: group.id,
            objectStableKey: group.stableKey,
            objectName: group.name,
            message: `Group "${group.name}" relay semantics are partially materialized in V1`,
            impact: 'Leaf relay members are emitted as a chained detour outbound, but advanced Clash relay behavior is still not fully preserved.',
            fallback:
                'Materialize the relay group as chained detour outbounds when every member is a concrete leaf outbound',
        });

        decisions.push({
            id: crypto.randomUUID(),
            kind: 'fallback-map',
            targetModule: 'group',
            targetId: group.id,
            summary: `Materialize relay group ${group.name} as chained detour outbounds`,
            reason: 'All relay members resolved to concrete leaf outbounds, so V1 can preserve a closer runnable relay chain than a selector fallback',
            sourcePaths: [group.sourcePath],
        });

        repairs.push(
            createRepair({
                kind: 'rewrite',
                targetModule: 'group',
                targetId: group.id,
                summary: `Rewrite relay group ${group.name} as chained detour outbounds`,
                before: 'Selector fallback with manual member choice',
                after: `Detour chain: ${chainTags.join(' -> ')}`,
                reason: 'Relay members resolved to concrete leaf outbounds that can be chained with detour',
                sourcePaths: [group.sourcePath],
            })
        );
    }

    return {
        outbounds: nextOutbounds,
        issues,
        decisions,
        repairs,
    };
}

function buildRelayLinkTag(groupTag: string, index: number, sourceTag: string): string {
    return `${groupTag}::relay::${index + 1}::${sourceTag}`;
}

function removeOutboundByTag(outbounds: PlannedOutbound[], tag: string): void {
    const index = outbounds.findIndex((outbound) => outbound.tag === tag);
    if (index >= 0) {
        outbounds.splice(index, 1);
    }
}
