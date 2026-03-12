import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { migrateClashConfigWithProviderFetch, validateSingboxConfig } from '../../core/index';
import { fetchText } from '../../utils/http';
import { isSingboxInstalled, checkConfig, getSingboxVersion } from '../../utils/singbox';
import type { MigrationIssue } from '../../core/types/migration';
import type { MigrationReport } from '../../core/types/migration-report';
export interface ConvertCommandOptions {
    input?: string;
    url?: string;
    output?: string;
    report?: string;
    reportDisplay?: string;
    reportMode?: string;
    providerFetch?: boolean;
    providerFetchTimeout?: number | string;
    providerFetchScope?: string;
    providerFetchForce?: boolean;
    artifacts?: string;
    pretty?: boolean;
    check?: boolean;
}

const WARNING_AGGREGATE_THRESHOLD = 40;
const WARNING_SUMMARY_LIMIT = 12;

export async function runConvert(options: ConvertCommandOptions): Promise<void> {
    const reportMode = resolveReportMode(options.reportMode, Boolean(options.output));
    const sourceBaseDir = options.input ? dirname(resolve(options.input)) : process.cwd();
    const providerFetchTimeout = resolvePositiveIntegerOption(
        options.providerFetchTimeout,
        4_000,
        '--provider-fetch-timeout'
    );
    const providerFetchScope = resolveProviderFetchScopeOption(options.providerFetchScope);

    // 1. Get input
    let yamlContent: string;
    if (options.url) {
        console.log(`Fetching: ${options.url}`);
        yamlContent = await fetchText(options.url);
    } else if (options.input) {
        try {
            yamlContent = readFileSync(options.input, 'utf-8');
        } catch {
            console.error(`Error: Cannot read file: ${options.input}`);
            process.exit(1);
        }
    } else {
        console.error('Error: Provide --input <file> or --url <url>');
        process.exit(1);
    }

    // 2. Migrate
    const result = await migrateClashConfigWithProviderFetch(yamlContent, {
        targetProfile: 'auto',
        emitReport: true,
        emitIntermediateArtifacts: Boolean(options.artifacts),
        sourceBaseDir,
        providerFetch:
            options.providerFetch === false
                ? { enabled: false }
                : {
                      timeoutMs: providerFetchTimeout,
                      scope: providerFetchScope,
                      force: options.providerFetchForce === true,
                  },
    });

    if ((result.providerRefresh?.fetched ?? 0) > 0) {
        console.log(`Refreshed remote provider cache count: ${result.providerRefresh?.fetched}`);
    }

    if (result.issues.length > 0) {
        printIssues(result.issues, Boolean(options.report));
    }

    if (options.report) {
        writeJsonFile(options.report, result.report, options.pretty);
        console.log(`Wrote migration report → ${options.report}`);
    }

    if (options.reportDisplay) {
        writeJsonFile(options.reportDisplay, result.report.display, options.pretty);
        console.log(`Wrote report display → ${options.reportDisplay}`);
    }

    if (options.artifacts && result.artifacts) {
        mkdirSync(options.artifacts, { recursive: true });
        const files: Array<[string, unknown | undefined]> = [
            ['normalized.json', result.artifacts.normalized],
            ['analysis.json', result.artifacts.analysis],
            ['plan.json', result.artifacts.plan],
        ];

        for (const [name, value] of files) {
            if (value !== undefined) {
                writeJsonFile(join(options.artifacts, name), value, true);
            }
        }

        console.log(`Wrote intermediate artifacts → ${options.artifacts}`);
    }

    if (!result.runnable || !result.config) {
        renderReport(result.report, reportMode === 'none' ? 'summary' : reportMode, console.error);
        process.exit(1);
    }

    // 3. Output
    const json = options.pretty
        ? JSON.stringify(result.config, null, 2)
        : JSON.stringify(result.config);

    if (options.output) {
        writeFileSync(options.output, json, 'utf-8');
        console.log(`Migrated profile ${result.report.summary.profile} → ${options.output}`);
        if (reportMode !== 'none') {
            renderReport(result.report, reportMode, console.log);
        }
    } else {
        if (reportMode !== 'none') {
            renderReport(result.report, reportMode, console.error);
        }
        console.log(json);
    }

    // 4. Validate if --check is specified
    if (options.check && !options.output) {
        console.error('Error: --check requires --output <file>');
        process.exit(1);
    }

    if (options.check && options.output) {
        console.log('\nValidating configuration...');

        // Schema validation
        const validationResult = validateSingboxConfig(result.config as never);
        if (validationResult.valid) {
            console.log('✓ Schema validation passed');
        } else {
            console.error('✗ Schema validation failed:');
            for (const e of validationResult.errors) {
                console.error(`  - ${e}`);
            }
            process.exit(1);
        }

        // sing-box validation
        const installed = await isSingboxInstalled();
        if (installed) {
            const version = await getSingboxVersion();
            if (version) {
                console.log(`✓ sing-box found: ${version}`);
            }

            const checkResult = await checkConfig(options.output);
            if (checkResult.success) {
                console.log('✓ sing-box check passed');
            } else {
                console.error('✗ sing-box check failed:');
                for (const e of checkResult.errors) {
                    console.error(`  ${e}`);
                }
                process.exit(1);
            }
        } else {
            console.warn('⚠ sing-box is not installed, skipping sing-box validation');
            console.warn('  Install: brew install sing-box (macOS)');
        }

        console.log('\nConfiguration is valid and ready to use');
    }
}

function printIssues(issues: MigrationIssue[], hasReportFile: boolean): void {
    const fatalIssues = issues.filter((issue) => issue.level === 'fatal');
    const warningIssues = issues.filter((issue) => issue.level !== 'fatal');

    for (const issue of fatalIssues) {
        const object = issue.objectName ? ` [${issue.objectName}]` : '';
        console.error(`Error${object}: ${issue.message}`);
    }

    if (warningIssues.length === 0) {
        return;
    }

    if (warningIssues.length <= WARNING_AGGREGATE_THRESHOLD) {
        for (const issue of warningIssues) {
            const object = issue.objectName ? ` [${issue.objectName}]` : '';
            console.warn(`Warning${object}: ${issue.message}`);
        }
        return;
    }

    const groups = groupWarnings(warningIssues);

    console.warn(
        `Warning: ${warningIssues.length} non-fatal issues detected, grouped summary is shown below:`
    );

    const visibleGroups = groups.slice(0, WARNING_SUMMARY_LIMIT);
    for (const group of visibleGroups) {
        console.warn(`Warning summary [${group.module}] ${group.title}: ${group.count}`);
        if (group.sampleObjectName) {
            console.warn(`  Example [${group.sampleObjectName}]: ${group.sampleMessage}`);
        } else {
            console.warn(`  Example: ${group.sampleMessage}`);
        }
    }

    if (groups.length > WARNING_SUMMARY_LIMIT) {
        console.warn(
            `Warning: ${groups.length - WARNING_SUMMARY_LIMIT} additional warning groups are hidden.`
        );
    }

    if (hasReportFile) {
        console.warn('Hint: full issues are written to --report output.');
        return;
    }

    console.warn('Hint: use --report <file> to inspect the full issue list.');
}

interface WarningGroupSummary {
    key: string;
    module: string;
    title: string;
    count: number;
    sampleMessage: string;
    sampleObjectName?: string;
}

function groupWarnings(warnings: MigrationIssue[]): WarningGroupSummary[] {
    const groups = new Map<string, WarningGroupSummary>();

    for (const issue of warnings) {
        const template = classifyWarning(issue);
        const existing = groups.get(template.key);
        if (existing) {
            existing.count += 1;
            continue;
        }

        groups.set(template.key, {
            key: template.key,
            module: template.module,
            title: template.title,
            count: 1,
            sampleMessage: issue.message,
            sampleObjectName: issue.objectName,
        });
    }

    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}

function classifyWarning(issue: MigrationIssue): {
    key: string;
    module: string;
    title: string;
} {
    const module = issue.module ?? 'unknown';
    const message = issue.message;

    if (message.startsWith('Unable to parse rule: IP-CIDR6')) {
        return {
            key: 'rule:ip-cidr6-unsupported',
            module: 'rule',
            title: 'IP-CIDR6 rules are unsupported in V1 and were dropped',
        };
    }

    if (message.includes('NO-RESOLVE is ignored')) {
        return {
            key: 'rule:no-resolve-ignored',
            module: 'rule',
            title: 'IP-CIDR NO-RESOLVE option is ignored in V1',
        };
    }

    if (message.includes('was dropped because sing-box 1.12 removed geoip database route matching')) {
        return {
            key: 'rule:geoip-removed-in-sing-box',
            module: 'rule',
            title: 'GEOIP rules were dropped because sing-box 1.12 removed geoip database matching',
        };
    }

    if (message.includes('was dropped because sing-box 1.12 removed geosite database route matching')) {
        return {
            key: 'rule:geosite-removed-in-sing-box',
            module: 'rule',
            title: 'GEOSITE rules were dropped because sing-box 1.12 removed geosite database matching',
        };
    }

    if (message.includes('cache refresh failed')) {
        return {
            key: 'provider:cache-refresh-failed',
            module: issue.module,
            title: 'Remote provider cache refresh failed',
        };
    }

    return {
        key: `${module}:${issue.code}`,
        module,
        title: `${issue.code} (${module})`,
    };
}

function writeJsonFile(path: string, value: unknown, pretty = false): void {
    const json = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
    writeFileSync(path, json, 'utf-8');
}

type ReportMode = 'none' | 'summary' | 'highlights' | 'full';

function resolveReportMode(rawMode: string | undefined, hasOutputFile: boolean): ReportMode {
    const mode = (rawMode ?? 'auto').toLowerCase();
    if (mode === 'auto') {
        return hasOutputFile ? 'summary' : 'none';
    }

    if (mode === 'none' || mode === 'summary' || mode === 'highlights' || mode === 'full') {
        return mode;
    }

    console.error('Error: --report-mode must be one of auto|none|summary|highlights|full');
    process.exit(1);
}

function resolvePositiveIntegerOption(
    value: number | string | undefined,
    fallback: number,
    optionName: string
): number {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        console.error(`Error: ${optionName} must be a positive integer`);
        process.exit(1);
    }

    return Math.floor(numeric);
}

function resolveProviderFetchScopeOption(rawScope: string | undefined): 'proxy' | 'rule' | 'all' {
    const scope = (rawScope ?? 'all').toLowerCase();
    if (scope === 'proxy' || scope === 'rule' || scope === 'all') {
        return scope;
    }

    console.error('Error: --provider-fetch-scope must be one of proxy|rule|all');
    process.exit(1);
}

function renderReport(
    report: MigrationReport,
    mode: ReportMode,
    writer: (line: string) => void
): void {
    if (mode === 'none') {
        return;
    }

    writer(report.display.summaryLine);
    if (mode === 'summary') {
        return;
    }

    for (const line of report.display.highlights) {
        writer(`- ${line}`);
    }

    if (report.display.issueHighlights.fatal.length > 0) {
        writer('Fatal issues:');
        for (const issue of report.display.issueHighlights.fatal) {
            writer(`- ${issue.module ?? 'unknown'}: ${issue.summary}`);
        }
    }

    if (report.display.issueHighlights.warning.length > 0) {
        writer('Warnings:');
        for (const issue of report.display.issueHighlights.warning) {
            writer(`- ${issue.module ?? 'unknown'}: ${issue.summary}`);
        }
    }

    if (report.display.providerHighlights.length > 0) {
        writer('Provider refresh:');
        writer(
            `- stats: fetched=${report.display.providerStats.fetched}, skipped=${report.display.providerStats.skipped}, failed=${report.display.providerStats.failed}`
        );
        for (const summary of report.display.providerHighlights) {
            writer(`- ${summary}`);
        }
    }

    if (report.display.decisionHighlights.length > 0) {
        writer('Decisions:');
        for (const summary of report.display.decisionHighlights) {
            writer(`- ${summary}`);
        }
    }

    if (report.display.repairHighlights.length > 0) {
        writer('Repairs:');
        for (const summary of report.display.repairHighlights) {
            writer(`- ${summary}`);
        }
    }

    if (report.display.behaviorHighlights.length > 0) {
        writer('Behavior changes:');
        for (const summary of report.display.behaviorHighlights) {
            writer(`- ${summary}`);
        }
    }

    if (mode !== 'full') {
        return;
    }

    writer('Module summary:');
    for (const module of report.modules) {
        writer(
            `- ${module.module}: exact=${module.exact} degraded=${module.degraded} dropped=${module.dropped} fatal=${module.fatal}`
        );
    }
}
