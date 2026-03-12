import { MigrationErrorCode, type MigrationIssue } from '../types/migration';
import type { RawClashConfig } from '../types/raw-clash';

export function parseRawClashConfig(input: unknown): RawClashConfig {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error(MigrationErrorCode.INVALID_CONFIG_SHAPE);
    }

    return input as RawClashConfig;
}

export function createRawConfigIssue(message: string): MigrationIssue {
    return {
        id: crypto.randomUUID(),
        level: 'fatal',
        code: MigrationErrorCode.INVALID_CONFIG_SHAPE,
        module: 'general',
        message,
        impact: 'Unable to normalize the source configuration',
    };
}
