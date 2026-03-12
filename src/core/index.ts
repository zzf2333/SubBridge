import { migrateClashConfig, migrateClashConfigWithProviderFetch } from './migrate';
import type { RemoteProviderCacheOptions } from './parse/providers';
import { validateSingboxConfig } from './validator/index';
import type { SingBoxConfig } from './types/singbox';

export interface ConvertOptions {
    validate?: boolean;
}

export interface ConvertAsyncOptions extends ConvertOptions {
    providerFetch?: RemoteProviderCacheOptions;
    sourceBaseDir?: string;
}

export interface ConvertResult {
    success: boolean;
    config?: SingBoxConfig;
    errors: string[];
    warnings: string[];
    providerRefresh?: {
        fetched: number;
        skipped: number;
        failed: number;
    };
}

// Main conversion entry: Clash YAML string → sing-box config
export function convertClashToSingbox(input: string, options: ConvertOptions = {}): ConvertResult {
    const result = migrateClashConfig(input, {
        targetProfile: 'auto',
        emitReport: true,
        emitIntermediateArtifacts: false,
    });
    return buildConvertResult(result.config, result.success, result.issues, options.validate);
}

export async function convertClashToSingboxAsync(
    input: string,
    options: ConvertAsyncOptions = {}
): Promise<ConvertResult> {
    const result = await migrateClashConfigWithProviderFetch(input, {
        targetProfile: 'auto',
        emitReport: true,
        emitIntermediateArtifacts: false,
        sourceBaseDir: options.sourceBaseDir,
        providerFetch: options.providerFetch,
    });

    return buildConvertResult(
        result.config,
        result.success,
        result.issues,
        options.validate,
        result.providerRefresh
    );
}

function buildConvertResult(
    config: SingBoxConfig | undefined,
    success: boolean,
    issues: Array<{ level: string; message: string }>,
    validate: boolean | undefined,
    providerRefresh?: {
        fetched: number;
        skipped: number;
        failed: number;
    }
): ConvertResult {
    const warnings = issues
        .filter((issue) => issue.level !== 'fatal')
        .map((issue) => issue.message);
    const errors = issues.filter((issue) => issue.level === 'fatal').map((issue) => issue.message);

    if (validate !== false && config) {
        const validation = validateSingboxConfig(config);
        if (!validation.valid) {
            warnings.push(...validation.errors.map((error) => `Schema warning: ${error}`));
        }
    }

    return {
        success,
        config,
        errors,
        warnings,
        providerRefresh,
    };
}

export { validateSingboxConfig } from './validator/index';
export { migrateClashConfig, migrateClashConfigWithProviderFetch } from './migrate';
export * from './types';
