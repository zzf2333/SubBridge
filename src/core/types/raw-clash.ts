export interface RawClashConfig {
    port?: number;
    'socks-port'?: number;
    'mixed-port'?: number;
    'redir-port'?: number;
    'tproxy-port'?: number;
    'allow-lan'?: boolean;
    mode?: string;
    'log-level'?: string;
    ipv6?: boolean;
    'unified-delay'?: boolean;
    'tcp-concurrent'?: boolean;
    'find-process-mode'?: string;
    sniffer?: Record<string, unknown>;
    tun?: Record<string, unknown>;
    dns?: Record<string, unknown>;
    script?: Record<string, unknown>;
    proxies?: RawProxy[];
    'proxy-groups'?: RawProxyGroup[];
    rules?: string[];
    'rule-providers'?: Record<string, unknown>;
    'proxy-providers'?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface RawProxy {
    name?: string;
    type?: string;
    server?: string;
    port?: number;
    [key: string]: unknown;
}

export interface RawProxyGroup {
    name?: string;
    type?: string;
    proxies?: string[];
    use?: string[];
    url?: string;
    interval?: number;
    tolerance?: number;
    lazy?: boolean;
    strategy?: string;
    [key: string]: unknown;
}
