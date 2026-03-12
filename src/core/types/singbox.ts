// sing-box configuration types based on official JSON Schema

export interface SingBoxTLS {
    enabled?: boolean;
    disable_sni?: boolean;
    server_name?: string;
    insecure?: boolean;
    alpn?: string[];
    certificate?: string;
    certificate_path?: string;
    utls?: {
        enabled?: boolean;
        fingerprint?: string;
    };
    reality?: {
        enabled?: boolean;
        public_key?: string;
        short_id?: string;
    };
}

export type SingBoxTransportType = 'http' | 'ws' | 'quic' | 'grpc' | 'httpupgrade';

export interface SingBoxTransportWS {
    type: 'ws';
    path?: string;
    headers?: Record<string, string>;
    max_early_data?: number;
    early_data_header_name?: string;
}

export interface SingBoxTransportGRPC {
    type: 'grpc';
    service_name?: string;
}

export interface SingBoxTransportHTTP {
    type: 'http';
    host?: string | string[];
    path?: string;
    method?: string;
    headers?: Record<string, string | string[]>;
}

export type SingBoxTransport = SingBoxTransportWS | SingBoxTransportGRPC | SingBoxTransportHTTP;

export interface SingBoxOutboundBase {
    type: string;
    tag: string;
    detour?: string;
}

export interface SingBoxSSOutbound extends SingBoxOutboundBase {
    type: 'shadowsocks';
    server: string;
    server_port: number;
    method: string;
    password: string;
    plugin?: string;
    plugin_opts?: string;
    network?: 'tcp' | 'udp';
}

export interface SingBoxVMessOutbound extends SingBoxOutboundBase {
    type: 'vmess';
    server: string;
    server_port: number;
    uuid: string;
    security?: string;
    alter_id?: number;
    network?: 'tcp' | 'udp';
    tls?: SingBoxTLS;
    transport?: SingBoxTransport;
    packet_encoding?: string;
}

export interface SingBoxTrojanOutbound extends SingBoxOutboundBase {
    type: 'trojan';
    server: string;
    server_port: number;
    password: string;
    network?: 'tcp' | 'udp';
    tls?: SingBoxTLS;
    transport?: SingBoxTransport;
}

export interface SingBoxHysteria2Outbound extends SingBoxOutboundBase {
    type: 'hysteria2';
    server: string;
    server_port: number;
    password: string;
    up_mbps?: number;
    down_mbps?: number;
    obfs?: {
        type: string;
        password: string;
    };
    tls?: SingBoxTLS;
}

export interface SingBoxVLESSOutbound extends SingBoxOutboundBase {
    type: 'vless';
    server: string;
    server_port: number;
    uuid: string;
    flow?: string;
    network?: 'tcp' | 'udp';
    tls?: SingBoxTLS;
    transport?: SingBoxTransport;
    packet_encoding?: string;
}

export interface SingBoxHTTPOutbound extends SingBoxOutboundBase {
    type: 'http';
    server: string;
    server_port: number;
    username?: string;
    password?: string;
    path?: string;
    headers?: Record<string, string | string[]>;
    tls?: SingBoxTLS;
}

export interface SingBoxSelectorOutbound extends SingBoxOutboundBase {
    type: 'selector';
    outbounds: string[];
    default?: string;
}

export interface SingBoxURLTestOutbound extends SingBoxOutboundBase {
    type: 'urltest';
    outbounds: string[];
    url?: string;
    interval?: string;
    tolerance?: number;
}

export interface SingBoxDirectOutbound extends SingBoxOutboundBase {
    type: 'direct';
}

export interface SingBoxBlockOutbound extends SingBoxOutboundBase {
    type: 'block';
}

export interface SingBoxDNSOutbound extends SingBoxOutboundBase {
    type: 'dns';
}

export type SingBoxOutbound =
    | SingBoxSSOutbound
    | SingBoxVMessOutbound
    | SingBoxTrojanOutbound
    | SingBoxHysteria2Outbound
    | SingBoxVLESSOutbound
    | SingBoxHTTPOutbound
    | SingBoxSelectorOutbound
    | SingBoxURLTestOutbound
    | SingBoxDirectOutbound
    | SingBoxBlockOutbound
    | SingBoxDNSOutbound;

export type SingBoxDNSServer =
    | {
          tag: string;
          type: 'local' | 'dhcp';
      }
    | {
          tag: string;
          type: 'udp' | 'tcp' | 'tls' | 'quic' | 'https' | 'h3';
          server: string;
          server_port?: number;
          path?: string;
          detour?: string;
          domain_resolver?: string | Record<string, unknown>;
      }
    | {
          tag: string;
          type: 'fakeip';
          inet4_range?: string;
          inet6_range?: string;
      };

export interface SingBoxDNSRule {
    outbound?: string | string[];
    server: string;
    domain?: string[];
    domain_suffix?: string[];
    geosite?: string[];
    clash_mode?: string;
    invert?: boolean;
}

export interface SingBoxDNS {
    servers: SingBoxDNSServer[];
    rules?: SingBoxDNSRule[];
    final?: string;
    strategy?: string;
    independent_cache?: boolean;
    reverse_mapping?: boolean;
    fakeip?: {
        enabled?: boolean;
        inet4_range?: string;
        inet6_range?: string;
    };
}

export interface SingBoxInbound {
    type: string;
    tag: string;
    listen?: string;
    listen_port?: number;
    sniff?: boolean;
    sniff_override_destination?: boolean;
    domain_strategy?: string;
    [key: string]: unknown;
}

export interface SingBoxRouteRule {
    protocol?: string | string[];
    outbound?: string;
    action?: string | Record<string, unknown>;
    geoip?: string[];
    geosite?: string[];
    ip_cidr?: string[];
    domain?: string[];
    domain_suffix?: string[];
    rule_set?: string | string[];
    clash_mode?: string;
    invert?: boolean;
    network?: string;
}

export type SingBoxRuleSet =
    | {
          type: 'inline';
          tag: string;
          rules: Record<string, unknown>[];
      }
    | {
          type: 'local';
          tag: string;
          format?: 'source' | 'binary';
          path: string;
      }
    | {
          type: 'remote';
          tag: string;
          format?: 'source' | 'binary';
          url: string;
          download_detour?: string;
          update_interval?: string;
      };

export interface SingBoxRoute {
    rules?: SingBoxRouteRule[];
    rule_set?: SingBoxRuleSet[];
    final?: string;
    auto_detect_interface?: boolean;
    default_domain_resolver?: string | Record<string, unknown>;
    geoip?: { download_url?: string; download_detour?: string };
    geosite?: { download_url?: string; download_detour?: string };
}

export interface SingBoxConfig {
    log?: { level?: string; timestamp?: boolean };
    dns?: SingBoxDNS;
    inbounds?: SingBoxInbound[];
    outbounds?: SingBoxOutbound[];
    route?: SingBoxRoute;
    experimental?: Record<string, unknown>;
}
