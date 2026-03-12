import type { RuntimeIntent } from '../types/migration-analysis';
import type { MigrationOptions } from '../types/migration';
import type { NormalizedClashConfig } from '../types/normalized-clash';

export function analyzeRuntimeIntent(
    config: NormalizedClashConfig,
    options: MigrationOptions
): RuntimeIntent {
    if (options.targetProfile && options.targetProfile !== 'auto') {
        return createIntent(options.targetProfile, ['Selected from migration options']);
    }

    if (config.tun?.enabled || config.general.ports.tproxy || config.general.ports.redir) {
        return createIntent('tun-client', [
            'Enabled tun or transparent proxy configuration detected',
        ]);
    }
    if (config.general.ports.mixed || config.general.ports.http || config.general.ports.socks) {
        return createIntent('mixed-client', ['Inbound listener ports detected']);
    }
    if (config.general.mode === 'global' || config.general.mode === 'rule') {
        return createIntent('mixed-client', [
            'Rule/global mode usually implies a local client profile',
        ]);
    }
    return createIntent('proxy-only', ['Falling back to proxy-only profile']);
}

function createIntent(profile: RuntimeIntent['profile'], reasoning: string[]): RuntimeIntent {
    return {
        profile,
        requiresDns: profile !== 'proxy-only',
        requiresTun: profile === 'tun-client',
        requiresMixedInbound: profile !== 'proxy-only',
        reasoning,
    };
}
