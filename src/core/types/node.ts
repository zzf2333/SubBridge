/**
 * SubBridgeNode — 统一节点结构
 *
 * 从 Clash YAML / 订阅 URL 提取的节点数据，供后续 convert/group/inject 使用。
 * 直接映射 Clash 原始字段，保留类型安全，避免过度规范化。
 */

export interface NodeTls {
    enabled: boolean;
    insecure?: boolean;
    serverName?: string;
    alpn?: string[];
    /** uTLS 客户端指纹 */
    clientFingerprint?: string;
}

export interface NodeTransportWs {
    type: 'ws';
    path?: string;
    headers?: Record<string, string>;
    maxEarlyData?: number;
    earlyDataHeaderName?: string;
}

export interface NodeTransportGrpc {
    type: 'grpc';
    serviceName?: string;
}

export interface NodeTransportHttp {
    type: 'http';
    method?: string;
    path?: string;
    headers?: Record<string, string | string[]>;
    host?: string | string[];
}

export interface NodeTransportH2 {
    type: 'h2';
    path?: string;
    host?: string | string[];
}

export type NodeTransport =
    | NodeTransportWs
    | NodeTransportGrpc
    | NodeTransportHttp
    | NodeTransportH2;

export interface NodePlugin {
    type: string;
    options: Record<string, unknown>;
}

interface SubBridgeNodeBase {
    /** 节点名称，作为 outbound tag */
    tag: string;
    server: string;
    serverPort: number;
    udp?: boolean;
    tls?: NodeTls;
    /** Reality 配置（仅 VLESS） */
    reality?: {
        publicKey: string;
        shortId?: string;
    };
    transport?: NodeTransport;
    /** 由 group/countries.ts 填充 */
    countryCode?: string;
    /** 原始 Clash 代理数据，用于调试 */
    raw: Record<string, unknown>;
}

export interface ShadowsocksNode extends SubBridgeNodeBase {
    type: 'shadowsocks';
    method: string;
    password: string;
    plugin?: NodePlugin;
}

export interface VMessNode extends SubBridgeNodeBase {
    type: 'vmess';
    uuid: string;
    alterId?: number;
    security?: string;
    packetEncoding?: 'xudp' | 'packetaddr';
}

export interface VLESSNode extends SubBridgeNodeBase {
    type: 'vless';
    uuid: string;
    flow?: string;
    packetEncoding?: string;
}

export interface TrojanNode extends SubBridgeNodeBase {
    type: 'trojan';
    password: string;
}

export interface Hysteria2Node extends SubBridgeNodeBase {
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

export interface HttpNode extends SubBridgeNodeBase {
    type: 'http';
    username?: string;
    password?: string;
    path?: string;
    headers?: Record<string, string | string[]>;
}

export type SubBridgeNode =
    | ShadowsocksNode
    | VMessNode
    | VLESSNode
    | TrojanNode
    | Hysteria2Node
    | HttpNode;
