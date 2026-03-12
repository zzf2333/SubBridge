import { describe, test, expect } from 'bun:test';
import { validateSingboxConfig } from '../../../src/core/validator/index';

describe('Config Validator', () => {
    test('accepts empty config according to schema', () => {
        const result = validateSingboxConfig({});
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    test('returns errors for invalid config shape', () => {
        const result = validateSingboxConfig({ outbounds: 'invalid' } as never);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });
});
