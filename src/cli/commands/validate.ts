import { readFileSync } from 'fs';
import { validateSingboxConfig } from '../../core/index';
import { isSingboxInstalled, checkConfig, getSingboxVersion } from '../../utils/singbox';

export interface ValidateCommandOptions {
    input: string;
    withSingbox?: boolean;
}

export async function runValidate(options: ValidateCommandOptions): Promise<void> {
    let content: string;
    try {
        content = readFileSync(options.input, 'utf-8');
    } catch {
        console.error(`Error: Cannot read file: ${options.input}`);
        process.exit(1);
    }

    let config: unknown;
    try {
        config = JSON.parse(content);
    } catch {
        console.error('Error: File is not valid JSON');
        process.exit(1);
    }

    // JSON Schema validation
    const result = validateSingboxConfig(config as never);
    if (result.valid) {
        console.log('✓ Schema validation passed');
    } else {
        console.error('✗ Schema validation failed:');
        for (const e of result.errors) {
            console.error(`  - ${e}`);
        }
        process.exit(1);
    }

    // sing-box validation (if requested)
    if (options.withSingbox) {
        const installed = await isSingboxInstalled();
        if (!installed) {
            console.warn('⚠ sing-box is not installed, skipping sing-box validation');
            console.warn('  Install: brew install sing-box (macOS)');
            return;
        }

        const version = await getSingboxVersion();
        if (version) {
            console.log(`✓ sing-box found: ${version}`);
        }

        const checkResult = await checkConfig(options.input);
        if (checkResult.success) {
            console.log('✓ sing-box check passed');
        } else {
            console.error('✗ sing-box check failed:');
            for (const e of checkResult.errors) {
                console.error(`  ${e}`);
            }
            process.exit(1);
        }
    }

    console.log('\nConfiguration is valid');
}
