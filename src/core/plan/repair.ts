import type { ModuleName } from '../types/migration';
import type { PlannedRepair, RepairKind } from '../types/migration-plan';

export function createRepair(input: {
    kind: RepairKind;
    targetModule: ModuleName;
    targetId?: string;
    summary: string;
    before: string;
    after: string;
    reason: string;
    sourcePaths?: string[];
}): PlannedRepair {
    return {
        id: crypto.randomUUID(),
        kind: input.kind,
        targetModule: input.targetModule,
        targetId: input.targetId,
        summary: input.summary,
        before: input.before,
        after: input.after,
        reason: input.reason,
        sourcePaths: input.sourcePaths ?? [],
    };
}
