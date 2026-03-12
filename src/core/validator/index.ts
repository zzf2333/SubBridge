import Ajv from 'ajv';
import schema from '../../../schemas/singbox.schema.json';
import type { SingBoxConfig } from '../types/singbox';

const ajv = new Ajv({ strict: false, allErrors: true, validateSchema: false });
const validate = ajv.compile(schema);

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export function validateSingboxConfig(config: SingBoxConfig): ValidationResult {
    const valid = validate(config) as boolean;
    if (valid) {
        return { valid: true, errors: [] };
    }

    const errors = (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);
    return { valid: false, errors };
}
