import { describe, test, expect } from 'bun:test';
import { parseRawProxy, nodeToOutbound } from '@/core/convert/outbounds';
import type { SingBoxSSOutbound, SingBoxVMessOutbound, SingBoxVLESSOutbound } from '@/core/types/singbox';
import type { SingBoxTrojanOutbound, SingBoxHysteria2Outbound, SingBoxHTTPOutbound } from '@/core/types/singbox';

// ─── 辅助：组合两步 ───────────────────────────────────────────────────────────

function convert(raw: Record<string, unknown>) {
    const result = parseRawProxy(raw);
    if (!result.ok) throw new Error(`parseRawProxy failed: ${JSON.stringify(result)}`);
    return nodeToOutbound(result.node);
}

// ─── 1. SS 基础节点 ───────────────────────────────────────────────────────────

describe('Shadowsocks', () => {
    test('基础 SS 节点 → shadowsocks outbound', () => {
        const raw = {
            name: 'SS-Node',
            type: 'ss',
            server: '1.2.3.4',
            port: 8388,
            cipher: 'aes-256-gcm',
            password: 'secret',
        };
        const out = convert(raw) as SingBoxSSOutbound;
        expect(out.type).toBe('shadowsocks');
        expect(out.tag).toBe('SS-Node');
        expect(out.server).toBe('1.2.3.4');
        expect(out.server_port).toBe(8388);
        expect(out.method).toBe('aes-256-gcm');
        expect(out.password).toBe('secret');
        expect(out.plugin).toBeUndefined();
    });

    test('SS + obfs 插件 → 含 plugin/plugin_opts', () => {
        const raw = {
            name: 'SS-Obfs',
            type: 'ss',
            server: '1.2.3.4',
            port: 8388,
            cipher: 'chacha20-ietf-poly1305',
            password: 'secret',
            plugin: 'obfs-local',
            'plugin-opts': { mode: 'http', 'obfs-host': 'www.example.com' },
        };
        const out = convert(raw) as SingBoxSSOutbound;
        expect(out.plugin).toBe('obfs-local');
        expect(out.plugin_opts).toBe('obfs=http;obfs-host=www.example.com');
    });

    test('SS + v2ray-plugin → 含 plugin/plugin_opts', () => {
        const raw = {
            name: 'SS-V2ray',
            type: 'ss',
            server: '1.2.3.4',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            plugin: 'v2ray-plugin',
            'plugin-opts': { mode: 'websocket', host: 'example.com', path: '/ws', tls: true },
        };
        const out = convert(raw) as SingBoxSSOutbound;
        expect(out.plugin).toBe('v2ray-plugin');
        expect(out.plugin_opts).toContain('mode=websocket');
        expect(out.plugin_opts).toContain('host=example.com');
        expect(out.plugin_opts).toContain('tls=true');
    });
});

// ─── 2. VMess + WS + TLS ─────────────────────────────────────────────────────

describe('VMess', () => {
    test('VMess + WS + TLS → 含 transport 和 tls', () => {
        const raw = {
            name: 'VMess-WS',
            type: 'vmess',
            server: 'proxy.example.com',
            port: 443,
            uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            alterId: 0,
            cipher: 'auto',
            tls: true,
            sni: 'proxy.example.com',
            'skip-cert-verify': false,
            network: 'ws',
            'ws-opts': {
                path: '/ws',
                headers: { Host: 'proxy.example.com' },
            },
        };
        const out = convert(raw) as SingBoxVMessOutbound;
        expect(out.type).toBe('vmess');
        expect(out.uuid).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
        expect(out.security).toBe('auto');
        expect(out.alter_id).toBe(0);
        expect(out.tls?.enabled).toBe(true);
        expect(out.tls?.server_name).toBe('proxy.example.com');
        expect(out.tls?.insecure).toBe(false);
        expect(out.transport?.type).toBe('ws');
        if (out.transport?.type === 'ws') {
            expect(out.transport.path).toBe('/ws');
            expect(out.transport.headers?.['Host']).toBe('proxy.example.com');
        }
    });

    test('VMess + packet-encoding=xudp', () => {
        const raw = {
            name: 'VMess-Xudp',
            type: 'vmess',
            server: '1.2.3.4',
            port: 1234,
            uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            'packet-encoding': 'xudp',
        };
        const out = convert(raw) as SingBoxVMessOutbound;
        expect(out.packet_encoding).toBe('xudp');
    });
});

// ─── 3. VLESS + gRPC ─────────────────────────────────────────────────────────

describe('VLESS', () => {
    test('VLESS + gRPC → vless outbound', () => {
        const raw = {
            name: 'VLESS-GRPC',
            type: 'vless',
            server: 'grpc.example.com',
            port: 443,
            uuid: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
            tls: true,
            network: 'grpc',
            'grpc-opts': { 'grpc-service-name': 'my.service' },
        };
        const out = convert(raw) as SingBoxVLESSOutbound;
        expect(out.type).toBe('vless');
        expect(out.uuid).toBe('bbbbbbbb-cccc-dddd-eeee-ffffffffffff');
        expect(out.tls?.enabled).toBe(true);
        expect(out.transport?.type).toBe('grpc');
        if (out.transport?.type === 'grpc') {
            expect(out.transport.service_name).toBe('my.service');
        }
    });

    // ─── 4. VLESS + Reality ───────────────────────────────────────────────────

    test('VLESS + Reality → 含 reality 配置', () => {
        const raw = {
            name: 'VLESS-Reality',
            type: 'vless',
            server: 'reality.example.com',
            port: 443,
            uuid: 'cccccccc-dddd-eeee-ffff-000000000000',
            flow: 'xtls-rprx-vision',
            tls: true,
            'client-fingerprint': 'chrome',
            'reality-opts': {
                'public-key': 'PUBKEY123',
                'short-id': 'SHORTID456',
            },
        };
        const out = convert(raw) as SingBoxVLESSOutbound;
        expect(out.type).toBe('vless');
        expect(out.flow).toBe('xtls-rprx-vision');
        expect(out.tls?.enabled).toBe(true);
        expect(out.tls?.reality?.enabled).toBe(true);
        expect(out.tls?.reality?.public_key).toBe('PUBKEY123');
        expect(out.tls?.reality?.short_id).toBe('SHORTID456');
        expect(out.tls?.utls?.fingerprint).toBe('chrome');
    });
});

// ─── 5. Trojan ────────────────────────────────────────────────────────────────

describe('Trojan', () => {
    test('Trojan → trojan outbound', () => {
        const raw = {
            name: 'Trojan-Node',
            type: 'trojan',
            server: 'trojan.example.com',
            port: 443,
            password: 'trojanpass',
            tls: true,
            sni: 'trojan.example.com',
        };
        const out = convert(raw) as SingBoxTrojanOutbound;
        expect(out.type).toBe('trojan');
        expect(out.password).toBe('trojanpass');
        expect(out.tls?.enabled).toBe(true);
        expect(out.tls?.server_name).toBe('trojan.example.com');
    });
});

// ─── 6. Hysteria2（含带宽）────────────────────────────────────────────────────

describe('Hysteria2', () => {
    test('Hysteria2 含带宽 → up_mbps / down_mbps', () => {
        const raw = {
            name: 'HY2-Node',
            type: 'hysteria2',
            server: 'hy2.example.com',
            port: 443,
            password: 'hy2pass',
            up: '20 Mbps',
            down: '100 Mbps',
            tls: true,
            sni: 'hy2.example.com',
        };
        const out = convert(raw) as SingBoxHysteria2Outbound;
        expect(out.type).toBe('hysteria2');
        expect(out.password).toBe('hy2pass');
        expect(out.up_mbps).toBe(20);
        expect(out.down_mbps).toBe(100);
        expect(out.tls?.enabled).toBe(true);
    });

    test('Hysteria2 含 obfs', () => {
        const raw = {
            name: 'HY2-Obfs',
            type: 'hysteria2',
            server: '1.2.3.4',
            port: 5000,
            password: 'pass',
            obfs: 'salamander',
            'obfs-password': 'obfspass',
        };
        const out = convert(raw) as SingBoxHysteria2Outbound;
        expect(out.obfs?.type).toBe('salamander');
        expect(out.obfs?.password).toBe('obfspass');
    });

    test('Hysteria2 带宽 Gbps 单位转换', () => {
        const raw = {
            name: 'HY2-Gbps',
            type: 'hysteria2',
            server: '1.2.3.4',
            port: 443,
            password: 'pass',
            up: '1 Gbps',
            down: '2 Gbps',
        };
        const out = convert(raw) as SingBoxHysteria2Outbound;
        expect(out.up_mbps).toBe(1000);
        expect(out.down_mbps).toBe(2000);
    });
});

// ─── 7. HTTP ──────────────────────────────────────────────────────────────────

describe('HTTP', () => {
    test('HTTP → http outbound', () => {
        const raw = {
            name: 'HTTP-Node',
            type: 'http',
            server: 'proxy.example.com',
            port: 8080,
            username: 'user',
            password: 'pass',
        };
        const out = convert(raw) as SingBoxHTTPOutbound;
        expect(out.type).toBe('http');
        expect(out.server).toBe('proxy.example.com');
        expect(out.server_port).toBe(8080);
        expect(out.username).toBe('user');
        expect(out.password).toBe('pass');
        expect(out.tls).toBeUndefined();
    });

    test('HTTPS 类型自动启用 TLS', () => {
        const raw = {
            name: 'HTTPS-Node',
            type: 'https',
            server: 'proxy.example.com',
            port: 443,
        };
        const out = convert(raw) as SingBoxHTTPOutbound;
        expect(out.type).toBe('http');
        expect(out.tls?.enabled).toBe(true);
    });
});

// ─── 8. 未知协议 → unsupported ────────────────────────────────────────────────

describe('ParseResult 错误场景', () => {
    test('未知协议 → ok: false, reason: unsupported', () => {
        const raw = {
            name: 'Weird-Node',
            type: 'snell',
            server: '1.2.3.4',
            port: 1234,
        };
        const result = parseRawProxy(raw);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe('unsupported');
            expect(result.tag).toBe('Weird-Node');
            expect(result.type).toBe('snell');
        }
    });

    // ─── 9. 缺少 server/port → missing-fields ────────────────────────────────

    test('缺少 server → ok: false, reason: missing-fields', () => {
        const raw = {
            name: 'No-Server',
            type: 'ss',
            port: 8388,
            cipher: 'aes-256-gcm',
            password: 'secret',
        };
        const result = parseRawProxy(raw);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe('missing-fields');
            expect(result.fields).toContain('server');
        }
    });

    test('缺少 port → ok: false, reason: missing-fields', () => {
        const raw = {
            name: 'No-Port',
            type: 'vmess',
            server: '1.2.3.4',
            uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        };
        const result = parseRawProxy(raw);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe('missing-fields');
            expect(result.fields).toContain('port');
        }
    });

    test('VMess 缺少 uuid → ok: false, reason: missing-fields', () => {
        const raw = {
            name: 'VMess-NoUUID',
            type: 'vmess',
            server: '1.2.3.4',
            port: 1234,
        };
        const result = parseRawProxy(raw);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe('missing-fields');
            expect(result.fields).toContain('uuid');
        }
    });
});

// ─── 补充场景：端口和服务器字段边界校验 ──────────────────────────────────────

describe('端口和服务器字段边界校验', () => {
    const baseRaw = { name: 'A', type: 'ss', cipher: 'aes-256-gcm', password: 'p' };

    test('port=0（越界）→ missing-fields 含 port', () => {
        const result = parseRawProxy({ ...baseRaw, server: '1.2.3.4', port: 0 });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.fields).toContain('port');
    });

    test('port=65536（越界）→ missing-fields 含 port', () => {
        const result = parseRawProxy({ ...baseRaw, server: '1.2.3.4', port: 65536 });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.fields).toContain('port');
    });

    test('port="abc"（NaN）→ missing-fields 含 port', () => {
        const result = parseRawProxy({ ...baseRaw, server: '1.2.3.4', port: 'abc' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.fields).toContain('port');
    });

    test('port=-1（负数）→ missing-fields 含 port', () => {
        const result = parseRawProxy({ ...baseRaw, server: '1.2.3.4', port: -1 });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.fields).toContain('port');
    });

    test('server=""（空字符串）→ missing-fields 含 server', () => {
        const result = parseRawProxy({ ...baseRaw, server: '', port: 443 });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.fields).toContain('server');
    });

    test('port=1（最小有效值）→ ok', () => {
        const result = parseRawProxy({ ...baseRaw, server: '1.2.3.4', port: 1 });
        expect(result.ok).toBe(true);
    });

    test('port=65535（最大有效值）→ ok', () => {
        const result = parseRawProxy({ ...baseRaw, server: '1.2.3.4', port: 65535 });
        expect(result.ok).toBe(true);
    });
});

// ─── 补充场景：字段不输出 undefined ──────────────────────────────────────────

describe('输出不含 undefined 字段', () => {
    test('无插件 SS outbound 不含 plugin/plugin_opts 键', () => {
        const raw = {
            name: 'SS-Plain',
            type: 'ss',
            server: '1.2.3.4',
            port: 8388,
            cipher: 'aes-256-gcm',
            password: 'secret',
        };
        const out = convert(raw);
        expect('plugin' in out).toBe(false);
        expect('plugin_opts' in out).toBe(false);
    });

    test('无 TLS 的 VMess outbound 不含 tls 键', () => {
        const raw = {
            name: 'VMess-Plain',
            type: 'vmess',
            server: '1.2.3.4',
            port: 1234,
            uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        };
        const out = convert(raw);
        expect('tls' in out).toBe(false);
    });
});
