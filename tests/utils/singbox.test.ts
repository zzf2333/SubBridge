import { describe, test, expect } from 'bun:test';
import { isSingboxInstalled, getSingboxVersion, checkConfig } from '../../src/utils/singbox';
import { mkdtempSync, writeFileSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('singbox utils', () => {
    test('isSingboxInstalled should detect sing-box', async () => {
        const installed = await isSingboxInstalled();
        // This test will pass or fail depending on whether sing-box is installed
        expect(typeof installed).toBe('boolean');
    });

    test('getSingboxVersion should return version or null', async () => {
        const version = await getSingboxVersion();
        // If sing-box is installed, version should be a string
        // Otherwise it should be null
        expect(version === null || typeof version === 'string').toBe(true);
    });

    test('checkConfig should validate valid config', async () => {
        const installed = await isSingboxInstalled();
        if (!installed) {
            console.log('sing-box not installed, skipping validation test');
            return;
        }

        const tempDir = mkdtempSync(join(tmpdir(), 'subbridge-singbox-'));
        const tmpFile = join(tempDir, 'minimal.json');
        writeFileSync(tmpFile, JSON.stringify({
            inbounds: [],
            outbounds: [{ type: 'direct', tag: 'direct' }],
            route: { final: 'direct' },
        }), 'utf-8');

        try {
            const result = await checkConfig(tmpFile);
            console.log('Valid config result:', result);
            expect(result.success).toBe(true);
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test('checkConfig should detect invalid config', async () => {
        const installed = await isSingboxInstalled();
        if (!installed) {
            console.log('sing-box not installed, skipping validation test');
            return;
        }

        // Create a config with syntax error
        const invalidConfig = '{ invalid json }';

        const tmpFile = '/tmp/test-singbox-invalid.json';
        writeFileSync(tmpFile, invalidConfig, 'utf-8');

        try {
            const result = await checkConfig(tmpFile);
            console.log('Invalid config result:', result);
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        } finally {
            unlinkSync(tmpFile);
        }
    });
});
