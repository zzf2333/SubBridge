import { MigrationErrorCode, type MigrationIssue } from '../types/migration';
import type { SingBoxConfig } from '../types/singbox';
import { validateSingboxConfig } from '../validator';

export function validateSchema(config: SingBoxConfig): {
    valid: boolean;
    issues: MigrationIssue[];
} {
    const result = validateSingboxConfig(config);
    return {
        valid: result.valid,
        issues: result.errors.map((message) => ({
            id: crypto.randomUUID(),
            code: MigrationErrorCode.VALIDATION_FAILED,
            level: 'fatal',
            module: 'general',
            message,
            impact: 'Generated sing-box config does not match the target schema.',
        })),
    };
}
