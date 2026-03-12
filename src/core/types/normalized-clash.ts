import type { RawProxy } from './raw-clash';

export interface ClashGeneral {
    mode: 'rule' | 'global' | 'direct' | 'script' | 'unknown';
    logLevel?: string;
    allowLan?: boolean;
    ipv6?: boolean;
    unifiedDelay?: boolean;
    tcpConcurrent?: boolean;
    findProcessMode?: string;
    ports: {
        http?: number;
        socks?: number;
        mixed?: number;
        redir?: number;
        tproxy?: number;
    };
}

export interface NormalizedMeta {
    sourceFormat: 'clash' | 'clash-meta';
    sourceVersion?: string;
    migratorVersion: string;
    sourceName?: string;
    parserWarnings: string[];
}

export interface NormalizedProxyBase {
    id: string;
    stableKey: string;
    name: string;
    type: 'ss' | 'vmess' | 'trojan' | 'vless' | 'hysteria2' | 'http' | 'unknown';
    server: string;
    port: number;
    udp?: boolean;
    sourcePath: string;
    raw: Record<string, unknown>;
    transport?: NormalizedTransport;
    tls?: NormalizedTls;
    plugin?: NormalizedPlugin;
    features: string[];
}

export interface NormalizedShadowsocksProxy extends NormalizedProxyBase {
    type: 'ss';
    method: string;
    password: string;
}

export interface NormalizedVMessProxy extends NormalizedProxyBase {
    type: 'vmess';
    uuid: string;
    alterId?: number;
    security?: string;
    packetEncoding?: 'xudp' | 'packetaddr';
}

export interface NormalizedTrojanProxy extends NormalizedProxyBase {
    type: 'trojan';
    password: string;
}

export interface NormalizedVlessProxy extends NormalizedProxyBase {
    type: 'vless';
    uuid: string;
    flow?: string;
    packetEncoding?: string;
    reality?: {
        publicKey: string;
        shortId?: string;
    };
}

export interface NormalizedHysteria2Proxy extends NormalizedProxyBase {
    type: 'hysteria2';
    password: string;
    obfs?: {
        type: string;
        password?: string;
    };
    bandwidth?: {
        upMbps?: number;
        downMbps?: number;
    };
}

export interface NormalizedHttpProxy extends NormalizedProxyBase {
    type: 'http';
    username?: string;
    password?: string;
    path?: string;
    headers?: Record<string, string | string[]>;
}

export interface NormalizedUnknownProxy extends NormalizedProxyBase {
    type: 'unknown';
    originalType: string;
}

export type NormalizedProxy =
    | NormalizedShadowsocksProxy
    | NormalizedVMessProxy
    | NormalizedTrojanProxy
    | NormalizedVlessProxy
    | NormalizedHysteria2Proxy
    | NormalizedHttpProxy
    | NormalizedUnknownProxy;

export interface NormalizedTls {
    enabled: boolean;
    insecure?: boolean;
    serverName?: string;
    alpn?: string[];
    fingerprint?: string;
    clientFingerprint?: string;
}

export type NormalizedTransport =
    | { type: 'tcp' }
    | {
          type: 'ws';
          path?: string;
          headers?: Record<string, string>;
          maxEarlyData?: number;
          earlyDataHeaderName?: string;
      }
    | { type: 'grpc'; serviceName?: string }
    | {
          type: 'http';
          method?: string;
          path?: string;
          headers?: Record<string, string | string[]>;
          host?: string | string[];
      }
    | { type: 'h2'; path?: string; host?: string | string[] };

export interface NormalizedPlugin {
    type: string;
    options: Record<string, unknown>;
}

export interface NormalizedGroup {
    id: string;
    stableKey: string;
    name: string;
    type: 'select' | 'url-test' | 'fallback' | 'load-balance' | 'relay' | 'unknown';
    members: GroupMemberRef[];
    strategy?: GroupStrategy;
    sourcePath: string;
    raw: Record<string, unknown>;
}

export type GroupMemberRef =
    | { kind: 'proxy'; name: string }
    | { kind: 'group'; name: string }
    | { kind: 'provider'; name: string }
    | { kind: 'unknown'; name: string };

export interface GroupStrategy {
    testUrl?: string;
    intervalSeconds?: number;
    tolerance?: number;
    lazy?: boolean;
    expectedBehavior?: 'manual' | 'latency-test' | 'fallback' | 'load-balance' | 'relay';
}

export interface NormalizedRule {
    id: string;
    stableKey: string;
    raw: string;
    sourcePath: string;
    matcher: RuleMatcher;
    target: RuleTargetRef;
    options: RuleOptions;
}

export type RuleMatcher =
    | { type: 'domain'; value: string }
    | { type: 'domain_suffix'; value: string }
    | { type: 'domain_keyword'; value: string }
    | { type: 'domain_regex'; value: string }
    | { type: 'rule_set'; value: string }
    | { type: 'script'; value: string }
    | { type: 'ip_cidr'; value: string; noResolve?: boolean }
    | { type: 'src_ip_cidr'; value: string }
    | { type: 'geoip'; value: string }
    | { type: 'geosite'; value: string }
    | { type: 'port'; value: number }
    | { type: 'port_range'; start: number; end: number }
    | { type: 'src_port'; value: number }
    | { type: 'src_port_range'; start: number; end: number }
    | { type: 'process_name'; value: string | string[] }
    | { type: 'process_path'; value: string | string[] }
    | { type: 'network'; value: 'tcp' | 'udp' | 'both' }
    | { type: 'match' };

export type RuleTargetRef =
    | { kind: 'proxy'; name: string }
    | { kind: 'group'; name: string }
    | { kind: 'special'; name: 'DIRECT' | 'REJECT' | 'GLOBAL' | 'PASS' }
    | { kind: 'unknown'; name: string };

export interface RuleOptions {
    disableResolve?: boolean;
    sourceIpCidr?: string[];
    extra: Record<string, unknown>;
}

export interface NormalizedDns {
    enabled: boolean;
    listen?: string;
    ipv6?: boolean;
    enhancedMode?: 'fake-ip' | 'redir-host' | 'none';
    fakeIpRange?: string;
    nameservers: NormalizedDnsServer[];
    fallback?: NormalizedDnsServer[];
    defaultNameserver?: NormalizedDnsServer[];
    nameserverPolicy?: Record<string, NormalizedDnsServer[]>;
    fakeIpFilter?: string[];
    fallbackFilter?: {
        geoip?: boolean;
        geoipCode?: string;
        ipcidr?: string[];
    };
    respectRules?: boolean;
    useHosts?: boolean;
    sourcePath: string;
}

export type NormalizedDnsServer =
    | { type: 'system' | 'dhcp'; source: 'nameserver' | 'fallback' | 'default' | 'policy' }
    | {
          type: 'udp' | 'tcp' | 'tls' | 'https' | 'quic';
          address: string;
          port?: number;
          detour?: string;
          source: 'nameserver' | 'fallback' | 'default' | 'policy';
      };

export interface NormalizedTun {
    enabled: boolean;
    stack?: string;
    autoRoute?: boolean;
    autoDetectInterface?: boolean;
    dnsHijack?: string[];
    strictRoute?: boolean;
    mtu?: number;
    sourcePath: string;
}

export interface NormalizedProviderRef {
    id: string;
    stableKey: string;
    name: string;
    type: 'rule' | 'proxy';
    vehicle?: 'http' | 'file' | 'inline' | 'unknown';
    path?: string;
    url?: string;
    resolvedPath?: string;
    intervalSeconds?: number;
    behavior?: string;
    expandedProxyNames?: string[];
    sourcePath: string;
    raw: Record<string, unknown>;
}

export interface NormalizedClashConfig {
    general: ClashGeneral;
    proxies: NormalizedProxy[];
    groups: NormalizedGroup[];
    rules: NormalizedRule[];
    scriptShortcuts: Record<string, string>;
    dns?: NormalizedDns;
    tun?: NormalizedTun;
    providers: {
        ruleProviders: NormalizedProviderRef[];
        proxyProviders: NormalizedProviderRef[];
    };
    meta: NormalizedMeta;
}

export function isRawProxy(value: unknown): value is RawProxy {
    return typeof value === 'object' && value !== null;
}
