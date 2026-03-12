import type { SingBoxConfig } from '../types/singbox';

const DEFAULT_CLASH_CONTROLLER = '127.0.0.1:9090';
const DEFAULT_CLASH_MODE = 'rule';

export function completeSingBoxConfig(config: SingBoxConfig): SingBoxConfig {
    if (!config.route) {
        config.route = {};
    }
    ensureClashApi(config);
    return config;
}

function ensureClashApi(config: SingBoxConfig): void {
    const experimental = ensureObject(config as unknown as Record<string, unknown>, 'experimental');
    const clashApi = ensureObject(experimental, 'clash_api');

    if (typeof clashApi.external_controller !== 'string' || clashApi.external_controller.length === 0) {
        clashApi.external_controller = DEFAULT_CLASH_CONTROLLER;
    }
    if (typeof clashApi.default_mode !== 'string' || clashApi.default_mode.length === 0) {
        clashApi.default_mode = DEFAULT_CLASH_MODE;
    }
}

function ensureObject(
    container: Record<string, unknown>,
    key: string
): Record<string, unknown> {
    const value = container[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    const created: Record<string, unknown> = {};
    container[key] = created;
    return created;
}
