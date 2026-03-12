import type { ValidationResult } from '../types/migration-report';
import type { MigrationPlan } from '../types/migration-plan';
import type { SingBoxConfig } from '../types/singbox';
import { validateLogicalReferences } from './logic';
import { validateRunnableConfig } from './runnable';
import { validateSchema } from './schema';

export function validateMigrationResult(
    config: SingBoxConfig,
    plan: MigrationPlan
): ValidationResult {
    const schema = validateSchema(config);
    const logic = validateLogicalReferences(config);
    const runnable = validateRunnableConfig(config, plan);

    return {
        runnable: schema.valid && logic.valid && runnable.valid,
        schemaValid: schema.valid,
        referenceValid: logic.valid,
        runtimeValid: runnable.valid,
        issues: [...schema.issues, ...logic.issues, ...runnable.issues],
    };
}
