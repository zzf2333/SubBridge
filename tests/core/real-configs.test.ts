import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { migrateClashConfig } from '../../src/core/migrate';

const REAL_DIR = join(process.cwd(), 'examples/real');

const cases = [
    '1-pure-proxies.yaml',
    '2-with-groups-rules.yaml',
    '2-template-with-groups.yaml',
    '3-with-providers.yaml',
    '4-with-dns-fakeip.yaml',
    '5-with-tun.yaml',
    '6-public-ss-subset.yaml',
    '7-public-vmess-trojan-vless-subset.yaml',
    '8-public-vless-reality-subset.yaml',
    '9-public-hysteria2-subset.yaml',
    '10-public-http-subset.yaml',
    '11-public-vless-grpc-subset.yaml',
    '12-public-vmess-variants-subset.yaml',
    '13-public-vmess-grpc-subset.yaml',
    '14-public-trojan-tls-subset.yaml',
    '15-public-vless-ws-subset.yaml',
];

describe('real Clash configs', () => {
    for (const file of cases) {
        test(`keeps ${file} runnable`, () => {
            const input = readFileSync(join(REAL_DIR, file), 'utf-8');
            const result = migrateClashConfig(input, {
                targetProfile: 'auto',
                emitReport: true,
                emitIntermediateArtifacts: true,
            });

            expect(result.runnable).toBe(true);
            expect(result.config).toBeDefined();
            expect(result.report.summary.fatalIssues).toBe(0);
        });
    }

    test('supports common Shadowsocks obfs plugin emission', () => {
        const input = readFileSync(join(REAL_DIR, '1-pure-proxies.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        expect(
            result.issues.some((issue) => issue.message.includes('plugin "obfs"'))
        ).toBe(false);
        expect(
            result.config?.outbounds?.find((outbound) => outbound.tag === '🇩🇪 德国-01')
        ).toMatchObject({
            type: 'shadowsocks',
            plugin: 'obfs-local',
            plugin_opts: 'obfs=tls;obfs-host=cloudflare.com',
        });
    });

    test('keeps provider-backed route.final runnable by preserving the PROXY group', () => {
        const input = readFileSync(join(REAL_DIR, '3-with-providers.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        expect(result.runnable).toBe(true);
        expect(result.config?.route?.final).toBe('PROXY');
        expect(result.config?.outbounds?.some((outbound) => outbound.tag === 'PROXY')).toBe(true);
        expect(
            result.config?.outbounds?.find((outbound) => outbound.tag === 'suba')
        ).toMatchObject({
            type: 'selector',
            outbounds: ['direct'],
            default: 'direct',
        });
        expect(
            result.report.repairs.some((repair) =>
                repair.summary.includes('Rewrite proxy-provider suba as direct placeholder outbound')
            )
        ).toBe(true);
    });

    test('emits provider-backed RULE-SET definitions instead of empty placeholders', () => {
        const input = readFileSync(join(REAL_DIR, '3-with-providers.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        expect(result.config?.route?.rule_set?.find((ruleSet) => ruleSet.tag === 'applications')).toMatchObject({
            type: 'remote',
            tag: 'applications',
            format: 'source',
            url: 'https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/applications.txt',
            update_interval: '86400s',
        });
        expect(
            result.config?.route?.rules?.some((rule) =>
                rule.rule_set === 'applications' && rule.outbound === 'direct'
            )
        ).toBe(true);
        expect(
            result.issues.some((issue) => issue.message.includes('RULE-SET "applications"'))
        ).toBe(false);
    });

    test('lowers simple SCRIPT shortcuts and keeps complex ones as placeholders', () => {
        const input = readFileSync(join(REAL_DIR, '2-template-with-groups.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        expect(
            result.config?.route?.rules?.some((rule) =>
                Array.isArray(rule.network)
                && rule.network.includes('udp')
                && rule.port === 443
                && rule.outbound === 'block'
            )
        ).toBe(true);
        expect(
            result.config?.route?.rule_set?.some((ruleSet) => ruleSet.tag === 'script:BilibiliP2P')
        ).toBe(true);
        expect(
            result.issues.some((issue) =>
                issue.message.includes('SCRIPT rule "QUIC" was statically lowered from script.shortcuts in V1')
            )
        ).toBe(true);
    });

    test('supports http proxies in real group-heavy configs', () => {
        const input = readFileSync(join(REAL_DIR, '2-template-with-groups.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        expect(
            result.issues.some((issue) =>
                issue.message.includes('Unsupported proxy protocol: http')
            )
        ).toBe(false);
        expect(result.config?.outbounds?.some((outbound) => outbound.tag === 'Local' && outbound.type === 'http')).toBe(true);
        expect(result.config?.outbounds?.some((outbound) => outbound.tag === 'Hotspot' && outbound.type === 'http')).toBe(true);
    });

    test('keeps provider-backed groups runnable by preserving provider placeholders', () => {
        const input = readFileSync(join(REAL_DIR, '2-template-with-groups.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        const hkGroup = result.config?.outbounds?.find((outbound) => outbound.tag === 'HK');
        const remoteProvider = result.config?.outbounds?.find((outbound) => outbound.tag === 'Remote');
        const proxyGroup = result.config?.outbounds?.find((outbound) => outbound.tag === 'PROXY');

        expect(hkGroup).toBeDefined();
        expect(hkGroup).toMatchObject({
            type: 'urltest',
            outbounds: ['Remote'],
        });
        expect(remoteProvider).toMatchObject({
            type: 'selector',
            outbounds: ['direct'],
            default: 'direct',
        });
        expect(proxyGroup).toBeDefined();
        expect(result.report.repairs.some((repair) =>
            repair.summary.includes('Rewrite proxy-provider Remote as direct placeholder outbound')
        )).toBe(true);
    });

    test('keeps curated public SS subset runnable as shadowsocks outbounds', () => {
        const input = readFileSync(join(REAL_DIR, '6-public-ss-subset.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        expect(result.runnable).toBe(true);
        expect(result.config?.outbounds?.some((outbound) => outbound.type === 'shadowsocks')).toBe(true);
    });

    test('keeps curated public vmess trojan vless subset runnable', () => {
        const input = readFileSync(join(REAL_DIR, '7-public-vmess-trojan-vless-subset.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        const types = new Set(
            (result.config?.outbounds ?? []).map((outbound) => outbound.type)
        );

        expect(result.runnable).toBe(true);
        expect(types.has('vmess')).toBe(true);
        expect(types.has('trojan')).toBe(true);
        expect(types.has('vless')).toBe(true);
    });

    test('keeps curated public vless reality subset runnable with tls.reality', () => {
        const input = readFileSync(join(REAL_DIR, '8-public-vless-reality-subset.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        const vlessOutbound = result.config?.outbounds?.find((outbound) => outbound.type === 'vless');

        expect(result.runnable).toBe(true);
        expect(vlessOutbound).toMatchObject({
            tls: {
                reality: {
                    enabled: true,
                },
            },
        });
    });

    test('keeps curated public hysteria2 subset runnable', () => {
        const input = readFileSync(join(REAL_DIR, '9-public-hysteria2-subset.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        expect(result.runnable).toBe(true);
        expect(result.config?.outbounds?.some((outbound) => outbound.type === 'hysteria2')).toBe(true);
    });

    test('keeps curated public http subset runnable', () => {
        const input = readFileSync(join(REAL_DIR, '10-public-http-subset.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        expect(result.runnable).toBe(true);
        expect(result.config?.outbounds?.filter((outbound) => outbound.type === 'http')).toHaveLength(2);
    });

    test('keeps curated public vless grpc subset runnable', () => {
        const input = readFileSync(join(REAL_DIR, '11-public-vless-grpc-subset.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        const grpcOutbounds = (result.config?.outbounds ?? []).filter(
            (outbound) => outbound.type === 'vless' && outbound.transport?.type === 'grpc'
        );

        expect(result.runnable).toBe(true);
        expect(grpcOutbounds).toHaveLength(2);
        expect(grpcOutbounds[0]).toMatchObject({
            tls: {
                reality: {
                    enabled: true,
                },
            },
        });
    });

    test('keeps curated public vmess variants subset runnable', () => {
        const input = readFileSync(join(REAL_DIR, '12-public-vmess-variants-subset.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        const vmessOutbounds = (result.config?.outbounds ?? []).filter(
            (outbound) => outbound.type === 'vmess'
        );

        expect(result.runnable).toBe(true);
        expect(vmessOutbounds).toHaveLength(2);
        expect(vmessOutbounds.some((outbound) => outbound.transport?.type === 'ws')).toBe(true);
        expect(vmessOutbounds.some((outbound) => outbound.transport === undefined)).toBe(true);
    });

    test('keeps curated public vmess grpc subset runnable', () => {
        const input = readFileSync(join(REAL_DIR, '13-public-vmess-grpc-subset.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        const grpcOutbounds = (result.config?.outbounds ?? []).filter(
            (outbound) => outbound.type === 'vmess' && outbound.transport?.type === 'grpc'
        );

        expect(result.runnable).toBe(true);
        expect(grpcOutbounds).toHaveLength(2);
        expect(grpcOutbounds.map((outbound) => outbound.transport?.service_name)).toEqual([
            'webinar',
            'web',
        ]);
    });

    test('keeps curated public trojan tls subset runnable', () => {
        const input = readFileSync(join(REAL_DIR, '14-public-trojan-tls-subset.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        const trojanOutbounds = (result.config?.outbounds ?? []).filter(
            (outbound) => outbound.type === 'trojan'
        );

        expect(result.runnable).toBe(true);
        expect(trojanOutbounds).toHaveLength(2);
        expect(trojanOutbounds.every((outbound) => outbound.tls?.enabled === true)).toBe(true);
    });

    test('keeps curated public vless ws subset runnable', () => {
        const input = readFileSync(join(REAL_DIR, '15-public-vless-ws-subset.yaml'), 'utf-8');
        const result = migrateClashConfig(input, {
            targetProfile: 'auto',
            emitReport: true,
        });

        const wsOutbounds = (result.config?.outbounds ?? []).filter(
            (outbound) => outbound.type === 'vless' && outbound.transport?.type === 'ws'
        );
        const alpnOutbound = wsOutbounds.find((outbound) => outbound.tag === 'KR_speednode_0011');

        expect(result.runnable).toBe(true);
        expect(wsOutbounds).toHaveLength(2);
        expect(alpnOutbound).toMatchObject({
            tls: {
                alpn: ['http/1.1'],
                utls: {
                    enabled: true,
                    fingerprint: 'random',
                },
            },
            transport: {
                type: 'ws',
                path: '/danfeng',
            },
        });
    });
});
