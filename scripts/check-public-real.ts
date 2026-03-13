import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join, resolve } from 'path';
import { migrateClashConfig } from '../src/core/migrate';
import { validateSingboxConfig } from '../src/core/index';
import { checkConfig, getSingboxVersion, isSingboxInstalled } from '../src/utils/singbox';

interface ScriptOptions {
    dir: string;
    bin: string;
    report?: string;
}

interface CaseResult {
    file: string;
    passed: boolean;
    stage: 'migrate' | 'schema' | 'check';
    message: string;
}

interface PublicRealReport {
    summary: {
        fixtureDir: string;
        outputDir?: string;
        singboxVersion?: string | null;
        passed: number;
        failed: number;
    };
    cases: CaseResult[];
}

const DEFAULT_DIR = resolve(process.cwd(), 'examples/real');

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const initialReport: PublicRealReport = {
        summary: {
            fixtureDir: options.dir,
            passed: 0,
            failed: 0,
        },
        cases: [],
    };
    const files = readdirSync(options.dir)
        .filter((name) => name.endsWith('.yaml') && name.includes('public'))
        .sort();

    if (files.length === 0) {
        console.error(`No public real fixtures found in ${options.dir}`);
        writeReport(options.report, initialReport);
        process.exit(1);
    }

    const installed = await isSingboxInstalled(options.bin);
    if (!installed) {
        console.error(`sing-box binary not found: ${options.bin}`);
        writeReport(options.report, initialReport);
        process.exit(1);
    }

    const version = await getSingboxVersion(options.bin);
    if (version) {
        console.log(version);
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'subbridge-public-real-'));
    const results: CaseResult[] = [];

    for (const file of files) {
        const inputPath = join(options.dir, file);
        const outputPath = join(tempDir, `${basename(file, '.yaml')}.json`);

        console.log(`\n[public-real] ${file}`);

        const input = readFileSync(inputPath, 'utf-8');
        const migration = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
            emitIntermediateArtifacts: false,
        });

        if (!migration.runnable || !migration.config) {
            const fatal = migration.issues.find((issue) => issue.level === 'fatal');
            const message = fatal?.message ?? 'migration did not produce a runnable config';
            console.error(`✗ migrate failed: ${message}`);
            results.push({ file, passed: false, stage: 'migrate', message });
            continue;
        }

        writeFileSync(outputPath, JSON.stringify(migration.config, null, 2), 'utf-8');
        console.log(`✓ migrated -> ${outputPath}`);

        const schema = validateSingboxConfig(migration.config as never);
        if (!schema.valid) {
            const message = schema.errors[0] ?? 'schema validation failed';
            console.error(`✗ schema failed: ${message}`);
            results.push({ file, passed: false, stage: 'schema', message });
            continue;
        }
        console.log('✓ schema validation passed');

        const check = await checkConfig(outputPath, options.bin);
        if (!check.success) {
            const message = check.errors[0] ?? 'sing-box check failed';
            console.error(`✗ sing-box check failed: ${message}`);
            results.push({ file, passed: false, stage: 'check', message });
            continue;
        }

        console.log('✓ sing-box check passed');
        results.push({ file, passed: true, stage: 'check', message: 'ok' });
    }

    const passed = results.filter((result) => result.passed);
    const failed = results.filter((result) => !result.passed);

    console.log('\nPublic real fixture summary');
    console.log(`- fixture dir: ${options.dir}`);
    console.log(`- output dir: ${tempDir}`);
    console.log(`- passed: ${passed.length}`);
    console.log(`- failed: ${failed.length}`);

    const report: PublicRealReport = {
        summary: {
            fixtureDir: options.dir,
            outputDir: tempDir,
            singboxVersion: version,
            passed: passed.length,
            failed: failed.length,
        },
        cases: results,
    };
    writeReport(options.report, report);

    if (failed.length > 0) {
        for (const result of failed) {
            console.log(`  - ${result.file} [${result.stage}]: ${result.message}`);
        }
        process.exit(1);
    }
}

function parseArgs(argv: string[]): ScriptOptions {
    const options: ScriptOptions = {
        dir: DEFAULT_DIR,
        bin: 'sing-box',
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--dir') {
            options.dir = resolve(argv[index + 1] ?? '');
            index += 1;
            continue;
        }
        if (arg === '--bin') {
            options.bin = argv[index + 1] ?? 'sing-box';
            index += 1;
            continue;
        }
        if (arg === '--report') {
            options.report = resolve(argv[index + 1] ?? '');
            index += 1;
            continue;
        }
        if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        }
    }

    return options;
}

function printHelp() {
    console.log(`Usage: bun scripts/check-public-real.ts [options]

Options:
  --dir <path>   directory containing curated public Clash YAML fixtures
  --bin <path>   sing-box binary path
  --report <path>  write JSON summary report
  -h, --help     show this help message
`);
}

function writeReport(reportPath: string | undefined, report: PublicRealReport) {
    if (!reportPath) {
        return;
    }
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
}

void main();
