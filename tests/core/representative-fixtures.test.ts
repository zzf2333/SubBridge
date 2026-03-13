import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { migrateClashConfig } from '../../src/core/migrate';

const FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/verification');

function migrateFixture(name: string) {
    const input = readFileSync(join(FIXTURE_DIR, name), 'utf-8');
    return migrateClashConfig(input, {
        targetProfile: 'auto',
        emitReport: true,
        emitIntermediateArtifacts: true,
    });
}

describe('representative Clash YAML fixtures', () => {
    const fixtureNames = [
        'ss-baseline.yaml',
        'vmess-ws-tls.yaml',
        'trojan-tls.yaml',
        'vless-reality.yaml',
        'hysteria2.yaml',
        'mixed-protocols.yaml',
        'http-structure.yaml',
    ];

    for (const fixtureName of fixtureNames) {
        test(`keeps ${fixtureName} runnable`, () => {
            const result = migrateFixture(fixtureName);

            expect(result.success).toBe(true);
            expect(result.runnable).toBe(true);
            expect(result.config).toBeDefined();
            expect(result.report.summary.fatalIssues).toBe(0);
        });
    }

    test('emits vmess ws + tls fields for representative fixture', () => {
        const result = migrateFixture('vmess-ws-tls.yaml');

        expect(
            result.config?.outbounds?.find((outbound) => outbound.tag === 'VMess WS TLS')
        ).toEqual({
            type: 'vmess',
            tag: 'VMess WS TLS',
            server: '127.0.0.1',
            server_port: 21443,
            uuid: '12345678-1234-1234-1234-123456789012',
            security: 'auto',
            alter_id: 0,
            tls: {
                enabled: true,
                insecure: true,
                server_name: 'runtime.local',
                alpn: ['h2', 'http/1.1'],
                utls: {
                    enabled: true,
                    fingerprint: 'chrome',
                },
            },
            transport: {
                type: 'ws',
                path: '/vmess-ws',
                headers: {
                    Host: 'runtime.local',
                },
            },
        });
    });

    test('emits trojan tls fields for representative fixture', () => {
        const result = migrateFixture('trojan-tls.yaml');

        expect(
            result.config?.outbounds?.find((outbound) => outbound.tag === 'Trojan TLS')
        ).toEqual({
            type: 'trojan',
            tag: 'Trojan TLS',
            server: '127.0.0.1',
            server_port: 22443,
            password: 'trojan-password',
            tls: {
                enabled: true,
                insecure: true,
                server_name: 'runtime.local',
                alpn: ['h2', 'http/1.1'],
            },
        });
    });

    test('emits vless reality inside tls and keeps runtime metadata visible', () => {
        const result = migrateFixture('vless-reality.yaml');
        const outbound = result.config?.outbounds?.find((item) => item.tag === 'VLESS Reality');

        expect(outbound).toEqual({
            type: 'vless',
            tag: 'VLESS Reality',
            server: '127.0.0.1',
            server_port: 23443,
            uuid: '87654321-4321-4321-4321-210987654321',
            flow: 'xtls-rprx-vision',
            tls: {
                enabled: true,
                server_name: 'runtime.local',
                utls: {
                    enabled: true,
                    fingerprint: 'chrome',
                },
                reality: {
                    enabled: true,
                    public_key: 'xHhtVCB5ydmnJa3fzyqnZnw1clakkk5Jn4NVsbhermQ',
                    short_id: '0123456789abcdef',
                },
            },
        });
        expect(outbound && 'reality' in outbound).toBe(false);
    });

    test('emits hysteria2 obfs and bandwidth fields for representative fixture', () => {
        const result = migrateFixture('hysteria2.yaml');

        expect(
            result.config?.outbounds?.find((outbound) => outbound.tag === 'Hysteria2 TLS')
        ).toEqual({
            type: 'hysteria2',
            tag: 'Hysteria2 TLS',
            server: '127.0.0.1',
            server_port: 24443,
            password: 'hy2-password',
            up_mbps: 55,
            down_mbps: 110,
            obfs: {
                type: 'salamander',
                password: 'hy2-obfs-password',
            },
            tls: {
                enabled: true,
                insecure: true,
                server_name: 'runtime.local',
            },
        });
    });

    test('keeps mixed representative fixture runnable with groups, dns, and final route', () => {
        const result = migrateFixture('mixed-protocols.yaml');

        expect(result.report.summary.profile).toBe('mixed-client');
        expect(result.config?.inbounds?.some((inbound) => inbound.type === 'mixed')).toBe(true);
        expect((result.config?.dns?.servers ?? []).length).toBeGreaterThanOrEqual(2);
        expect(result.config?.dns?.final).toBe('dns-remote');
        expect(result.config?.route?.final).toBe('Proxy');
        expect(
            result.config?.outbounds?.find((outbound) => outbound.tag === 'Auto')
        ).toEqual({
            type: 'urltest',
            tag: 'Auto',
            outbounds: [
                'SS Baseline',
                'VMess WS TLS',
                'Trojan TLS',
                'VLESS Reality',
                'Hysteria2 TLS',
            ],
            url: 'http://127.0.0.1:18080/generate_204',
            interval: '300s',
        });
        expect(
            result.config?.outbounds?.find((outbound) => outbound.tag === 'Proxy')
        ).toEqual({
            type: 'selector',
            tag: 'Proxy',
            outbounds: ['Auto', 'Manual'],
            default: 'Auto',
        });
    });

    test('keeps http proxy fixture structurally supported without protocol warnings', () => {
        const result = migrateFixture('http-structure.yaml');

        expect(
            result.issues.some((issue) => issue.message.includes('Unsupported proxy protocol: http'))
        ).toBe(false);
        expect(
            result.config?.outbounds?.find((outbound) => outbound.tag === 'HTTP Upstream')
        ).toEqual({
            type: 'http',
            tag: 'HTTP Upstream',
            server: '127.0.0.1',
            server_port: 25080,
            username: 'runtime-user',
            password: 'runtime-pass',
            path: '/proxy',
            headers: {
                'X-Test': ['runtime', 'fixture'],
            },
        });
    });

    test('emits grpc and http transports in representative field mapping checks', () => {
        const grpcResult = migrateClashConfig(
            `
mixed-port: 7890
mode: rule
proxies:
  - name: VMess GRPC
    type: vmess
    server: 127.0.0.1
    port: 21444
    uuid: 12345678-1234-1234-1234-123456789012
    cipher: auto
    network: grpc
    grpc-opts:
      grpc-service-name: runtime-grpc
proxy-groups:
  - name: Proxy
    type: select
    proxies:
      - VMess GRPC
rules:
  - MATCH,Proxy
`,
            {
                targetProfile: 'auto',
                emitReport: true,
            }
        );
        const httpTransportResult = migrateClashConfig(
            `
mixed-port: 7890
mode: rule
proxies:
  - name: VMess HTTP
    type: vmess
    server: 127.0.0.1
    port: 21445
    uuid: 12345678-1234-1234-1234-123456789012
    cipher: auto
    network: http
    http-opts:
      method: GET
      path:
        - /http-path
      headers:
        Host:
          - runtime.local
proxy-groups:
  - name: Proxy
    type: select
    proxies:
      - VMess HTTP
rules:
  - MATCH,Proxy
`,
            {
                targetProfile: 'auto',
                emitReport: true,
            }
        );

        expect(
            grpcResult.config?.outbounds?.find((outbound) => outbound.tag === 'VMess GRPC')
        ).toMatchObject({
            type: 'vmess',
            transport: {
                type: 'grpc',
                service_name: 'runtime-grpc',
            },
        });
        expect(
            httpTransportResult.config?.outbounds?.find((outbound) => outbound.tag === 'VMess HTTP')
        ).toMatchObject({
            type: 'vmess',
            transport: {
                type: 'http',
                method: 'GET',
                path: '/http-path',
                headers: {
                    Host: ['runtime.local'],
                },
            },
        });
    });
});
