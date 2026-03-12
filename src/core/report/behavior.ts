import type { BehaviorChange } from '../types/migration-report';
import type { MigrationPlan } from '../types/migration-plan';

export function collectBehaviorChanges(plan: MigrationPlan): BehaviorChange[] {
    const changes: BehaviorChange[] = [];

    for (const repair of plan.repairs) {
        changes.push({
            id: crypto.randomUUID(),
            module: repair.targetModule,
            summary: repair.summary,
            before: repair.before,
            after: repair.after,
            reason: repair.reason,
            sourcePaths: repair.sourcePaths,
        });
    }

    for (const outbound of plan.outbounds) {
        if (outbound.notes.some((note) => note.includes('degraded'))) {
            changes.push({
                id: crypto.randomUUID(),
                module: 'group',
                summary: `Outbound ${outbound.tag} uses degraded behavior`,
                before: 'Original Clash group semantics',
                after: outbound.notes.join('; '),
                reason: 'V1 planner lowered the original behavior to a supported sing-box construct',
                sourcePaths: outbound.sourcePaths,
            });
        }
    }

    for (const rule of plan.route.rules) {
        if (rule.status === 'degraded' || rule.notes.some((note) => note.includes('degraded'))) {
            changes.push({
                id: crypto.randomUUID(),
                module: 'rule',
                summary: `Route rule ${rule.id} uses degraded behavior`,
                before: 'Original Clash rule semantics',
                after:
                    rule.notes.length > 0
                        ? rule.notes.join('; ')
                        : 'Lowered with degraded semantics',
                reason: 'V1 planner emitted a runnable approximation for this rule',
                sourcePaths: rule.sourcePaths,
            });
        }
    }

    return changes;
}
