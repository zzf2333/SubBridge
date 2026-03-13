import { readFileSync, writeFileSync } from 'fs';
import { validateSingboxConfig } from '../../core/index';
import { runProxySmoke, type ProxySmokeResult } from '../../utils/proxy-smoke';
import { checkConfig, getSingboxVersion, isSingboxInstalled } from '../../utils/singbox';

export interface VerifyCommandOptions {
    input: string;
    report?: string;
    singboxCheck?: boolean;
    smoke?: boolean;
    proxy?: string;
    bin?: string;
    keepTun?: boolean;
    keepTmp?: boolean;
    probe204Url?: string;
    probePageUrl?: string;
    probeIpUrl?: string;
}

export interface VerifyStepResult {
    status: 'passed' | 'failed' | 'skipped';
    errors: string[];
    details?: Record<string, unknown>;
}

export interface VerifyReport {
    summary: {
        valid: boolean;
        input: string;
    };
    schema: VerifyStepResult;
    singboxCheck: VerifyStepResult;
    proxySmoke: VerifyStepResult;
}

interface VerifyDependencies {
    readText(path: string): string;
    writeText(path: string, content: string): void;
    validateSchema(config: unknown): { valid: boolean; errors: string[] };
    isSingboxInstalled(binaryPath?: string): Promise<boolean>;
    getSingboxVersion(binaryPath?: string): Promise<string | null>;
    checkConfig(configPath: string, binaryPath?: string): Promise<{
        success: boolean;
        errors: string[];
        output: string;
    }>;
    runProxySmoke(options: {
        configPath: string;
        proxyUrl?: string;
        binaryPath?: string;
        keepTun?: boolean;
        keepTmp?: boolean;
        probe204Url?: string;
        probePageUrl?: string;
        probeIpUrl?: string;
    }): Promise<ProxySmokeResult>;
}

const defaultDependencies: VerifyDependencies = {
    readText: (path) => readFileSync(path, 'utf-8'),
    writeText: (path, content) => writeFileSync(path, content, 'utf-8'),
    validateSchema: (config) => validateSingboxConfig(config as never),
    isSingboxInstalled,
    getSingboxVersion,
    checkConfig,
    runProxySmoke,
};

export async function runVerify(
    options: VerifyCommandOptions,
    deps: VerifyDependencies = defaultDependencies
): Promise<VerifyReport> {
    const report: VerifyReport = {
        summary: {
            valid: false,
            input: options.input,
        },
        schema: { status: 'skipped', errors: [] },
        singboxCheck: { status: 'skipped', errors: [] },
        proxySmoke: { status: 'skipped', errors: [] },
    };

    let content = '';
    try {
        content = deps.readText(options.input);
    } catch {
        report.schema = {
            status: 'failed',
            errors: [`Cannot read file: ${options.input}`],
        };
        return finishVerify(report, options, deps);
    }

    let config: unknown;
    try {
        config = JSON.parse(content);
    } catch {
        report.schema = {
            status: 'failed',
            errors: ['File is not valid JSON'],
        };
        return finishVerify(report, options, deps);
    }

    const schemaResult = deps.validateSchema(config);
    if (schemaResult.valid) {
        report.schema = { status: 'passed', errors: [] };
        console.log('✓ Schema validation passed');
    } else {
        report.schema = { status: 'failed', errors: schemaResult.errors };
        printStepFailure('Schema validation failed', schemaResult.errors);
        return finishVerify(report, options, deps);
    }

    if (options.singboxCheck !== false) {
        const binaryPath = options.bin ?? 'sing-box';
        const installed = await deps.isSingboxInstalled(binaryPath);
        if (!installed) {
            report.singboxCheck = {
                status: 'failed',
                errors: [`sing-box binary not found: ${binaryPath}`],
            };
            printStepFailure('sing-box check failed', report.singboxCheck.errors);
            return finishVerify(report, options, deps);
        }

        const version = await deps.getSingboxVersion(binaryPath);
        if (version) {
            console.log(`✓ sing-box found: ${version}`);
        }

        const checkResult = await deps.checkConfig(options.input, binaryPath);
        if (checkResult.success) {
            report.singboxCheck = {
                status: 'passed',
                errors: [],
                details: version ? { version } : undefined,
            };
            console.log('✓ sing-box check passed');
        } else {
            report.singboxCheck = {
                status: 'failed',
                errors: checkResult.errors,
                details: checkResult.output ? { output: checkResult.output } : undefined,
            };
            printStepFailure('sing-box check failed', checkResult.errors);
            return finishVerify(report, options, deps);
        }
    } else {
        report.singboxCheck = { status: 'skipped', errors: [] };
    }

    if (options.smoke !== false) {
        const smokeResult = await deps.runProxySmoke({
            configPath: options.input,
            proxyUrl: options.proxy,
            binaryPath: options.bin,
            keepTun: options.keepTun,
            keepTmp: options.keepTmp,
            probe204Url: options.probe204Url,
            probePageUrl: options.probePageUrl,
            probeIpUrl: options.probeIpUrl,
        });

        if (smokeResult.success) {
            report.proxySmoke = {
                status: 'passed',
                errors: [],
                details: smokeResult.details,
            };
            console.log('✓ proxy smoke passed');
            if (smokeResult.details.gstatic) {
                console.log(`  gstatic: ${smokeResult.details.gstatic}`);
            }
            if (smokeResult.details.youtube) {
                console.log(`  youtube: ${smokeResult.details.youtube}`);
            }
            if (smokeResult.details.egressIp) {
                console.log(`  egress ip: ${smokeResult.details.egressIp}`);
            }
        } else {
            report.proxySmoke = {
                status: 'failed',
                errors: smokeResult.errors,
                details: smokeResult.output ? { output: smokeResult.output, ...smokeResult.details } : smokeResult.details,
            };
            printStepFailure('proxy smoke failed', smokeResult.errors);
            return finishVerify(report, options, deps);
        }
    } else {
        report.proxySmoke = { status: 'skipped', errors: [] };
    }

    report.summary.valid = true;
    return finishVerify(report, options, deps);
}

async function finishVerify(
    report: VerifyReport,
    options: VerifyCommandOptions,
    deps: Pick<VerifyDependencies, 'writeText'>
): Promise<VerifyReport> {
    if (options.report) {
        deps.writeText(options.report, JSON.stringify(report, null, 2));
        console.log(`Wrote verification report → ${options.report}`);
    }

    if (!report.summary.valid) {
        process.exit(1);
    }

    console.log('\nVerification passed');
    return report;
}

function printStepFailure(title: string, errors: string[]): void {
    console.error(`✗ ${title}:`);
    for (const error of errors) {
        console.error(`  - ${error}`);
    }
}
