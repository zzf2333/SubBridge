import yaml from 'js-yaml';
import { MigrationErrorCode, type MigrationIssue } from '../types/migration';

const MAX_INPUT_SIZE = 10 * 1024 * 1024;

export function parseYamlInput(input: string): unknown {
    if (!input || input.trim().length === 0) {
        throw new Error(MigrationErrorCode.EMPTY_CONFIG);
    }
    if (Buffer.byteLength(input, 'utf8') > MAX_INPUT_SIZE) {
        throw new Error(MigrationErrorCode.SIZE_LIMIT_EXCEEDED);
    }

    try {
        return yaml.load(input);
    } catch {
        throw new Error(MigrationErrorCode.INVALID_YAML);
    }
}

export function createParseIssue(code: MigrationErrorCode, message: string): MigrationIssue {
    return {
        id: crypto.randomUUID(),
        level: 'fatal',
        code,
        module: 'general',
        message,
        impact: 'Unable to continue parsing the source configuration',
    };
}
