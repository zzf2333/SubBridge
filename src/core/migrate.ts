import { analyzeMigration } from './analyze';
import { completeSingBoxConfig } from './emit/completion';
import { emitSingBoxConfig } from './emit/singbox';
import { normalizeClashConfig } from './normalize';
import { parseRawClashConfig } from './parse/clash';
import {
    expandLocalProxyProviders,
    refreshRemoteProviderCachesFromYaml,
    type RemoteProviderCacheOptions,
} from './parse/providers';
import { createParseIssue, parseYamlInput } from './parse/yaml';
import { buildMigrationPlan } from './plan';
import { mergeProviderCacheRefreshIntoResult } from './report/provider-refresh';
import { buildMigrationReport } from './report/reporter';
import type { MigrationOptions, MigrationResult } from './types/migration';
import { buildFailureReport } from './utils/migration-report';
import { validateMigrationResult } from './validate';

export interface MigrateWithProviderFetchOptions extends MigrationOptions {
    providerFetch?: RemoteProviderCacheOptions;
}

export function migrateClashConfig(input: string, options: MigrationOptions = {}): MigrationResult {
    let rawConfig;
    try {
        rawConfig = parseRawClashConfig(parseYamlInput(input));
    } catch (error) {
        const code = (error as Error).message;
        const issue = createParseIssue(code as never, `Failed to parse input: ${code}`);
        return {
            success: false,
            runnable: false,
            report: buildFailureReport(issue),
            issues: [issue],
        };
    }

    const expansionResult = expandLocalProxyProviders(
        rawConfig,
        options.sourceBaseDir ?? process.cwd()
    );
    const normalizeResult = normalizeClashConfig(expansionResult.rawConfig);
    const analysis = analyzeMigration(normalizeResult.normalized, options);
    const plan = buildMigrationPlan(normalizeResult.normalized, analysis);
    const emitted = completeSingBoxConfig(emitSingBoxConfig(plan));
    const validation = validateMigrationResult(emitted, plan);
    const report = buildMigrationReport(
        normalizeResult.normalized,
        [...expansionResult.issues, ...normalizeResult.issues],
        analysis,
        plan,
        validation
    );

    return {
        success: validation.runnable,
        runnable: validation.runnable,
        config: emitted,
        report,
        issues: [
            ...expansionResult.issues,
            ...normalizeResult.issues,
            ...analysis.issues,
            ...plan.issues,
            ...validation.issues,
        ],
        artifacts: options.emitIntermediateArtifacts
            ? {
                  normalized: normalizeResult.normalized,
                  analysis,
                  plan,
              }
            : undefined,
    };
}

export async function migrateClashConfigWithProviderFetch(
    input: string,
    options: MigrateWithProviderFetchOptions = {}
): Promise<MigrationResult> {
    const { providerFetch, ...migrationOptions } = options;

    if (providerFetch?.enabled === false) {
        return migrateClashConfig(input, migrationOptions);
    }

    const refresh = await refreshRemoteProviderCachesFromYaml(
        input,
        migrationOptions.sourceBaseDir ?? process.cwd(),
        providerFetch
    );
    const result = migrateClashConfig(input, migrationOptions);
    mergeProviderCacheRefreshIntoResult(result, refresh);
    result.providerRefresh = {
        fetched: refresh.fetched.length,
        skipped: refresh.skipped.length,
        failed: refresh.failed.length,
    };
    return result;
}
