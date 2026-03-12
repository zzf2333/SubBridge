import type { ClashGeneral } from '../types/normalized-clash';
import type { RawClashConfig } from '../types/raw-clash';

export function normalizeGeneral(config: RawClashConfig): ClashGeneral {
    return {
        mode: parseMode(config.mode),
        logLevel: typeof config['log-level'] === 'string' ? config['log-level'] : undefined,
        allowLan: typeof config['allow-lan'] === 'boolean' ? config['allow-lan'] : undefined,
        ipv6: typeof config.ipv6 === 'boolean' ? config.ipv6 : undefined,
        unifiedDelay:
            typeof config['unified-delay'] === 'boolean' ? config['unified-delay'] : undefined,
        tcpConcurrent:
            typeof config['tcp-concurrent'] === 'boolean' ? config['tcp-concurrent'] : undefined,
        findProcessMode:
            typeof config['find-process-mode'] === 'string'
                ? config['find-process-mode']
                : undefined,
        ports: {
            http: toNumber(config.port),
            socks: toNumber(config['socks-port']),
            mixed: toNumber(config['mixed-port']),
            redir: toNumber(config['redir-port']),
            tproxy: toNumber(config['tproxy-port']),
        },
    };
}

function parseMode(mode: unknown): ClashGeneral['mode'] {
    if (mode === 'rule' || mode === 'global' || mode === 'direct' || mode === 'script') {
        return mode;
    }
    return 'unknown';
}

function toNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}
