import { describe, test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { extractRawProxies } from '@/core/fetch/clash';

const SS_YAML = `
proxies:
  - name: "HK-SS-01"
    type: ss
    server: 1.2.3.4
    port: 443
    cipher: aes-256-gcm
    password: secret

  - name: "JP-VMess-01"
    type: vmess
    server: 5.6.7.8
    port: 8080
    uuid: 00000000-0000-0000-0000-000000000000
    alterId: 0
    cipher: auto
    network: ws
    ws-opts:
      path: /path
    tls: true

  - name: "US-VLESS-01"
    type: vless
    server: 9.10.11.12
    port: 443
    uuid: 11111111-1111-1111-1111-111111111111
    tls: true
    network: grpc
    grpc-opts:
      grpc-service-name: myservice

  - name: "SG-Trojan-01"
    type: trojan
    server: 13.14.15.16
    port: 443
    password: trojanpass

  - name: "TW-Hy2-01"
    type: hysteria2
    server: 17.18.19.20
    port: 443
    password: hy2pass
    up: "20 Mbps"
    down: "100 Mbps"
`;

describe('extractRawProxies', () => {
    test('从 YAML 提取代理列表', () => {
        const { proxies, warnings } = extractRawProxies(SS_YAML);
        expect(proxies).toHaveLength(5);
        expect(warnings).toHaveLength(0);
    });

    test('提取代理的基本字段', () => {
        const { proxies } = extractRawProxies(SS_YAML);
        expect(proxies[0].name).toBe('HK-SS-01');
        expect(proxies[0].type).toBe('ss');
        expect(proxies[0].server).toBe('1.2.3.4');
        expect(proxies[0].port).toBe(443);
    });

    test('空输入返回空数组和警告', () => {
        const { proxies, warnings } = extractRawProxies('');
        expect(proxies).toHaveLength(0);
        expect(warnings.length).toBeGreaterThan(0);
    });

    test('无效 YAML 返回警告', () => {
        const { proxies, warnings } = extractRawProxies('not: valid: yaml: {{{');
        expect(proxies).toHaveLength(0);
        expect(warnings.length).toBeGreaterThan(0);
    });

    test('非对象 YAML 返回警告', () => {
        const { proxies, warnings } = extractRawProxies('- just a list');
        expect(proxies).toHaveLength(0);
        expect(warnings.length).toBeGreaterThan(0);
    });

    test('去重同名节点', () => {
        const yaml = `
proxies:
  - name: "dup"
    type: ss
    server: 1.2.3.4
    port: 443
    cipher: aes-256-gcm
    password: secret
  - name: "dup"
    type: ss
    server: 5.6.7.8
    port: 443
    cipher: aes-256-gcm
    password: secret2
`;
        const { proxies } = extractRawProxies(yaml);
        expect(proxies).toHaveLength(1);
        expect(proxies[0].server).toBe('1.2.3.4');
    });

    test('无 proxies 字段时返回空数组', () => {
        const { proxies } = extractRawProxies('mode: rule\nport: 7890');
        expect(proxies).toHaveLength(0);
    });
});

// ─── proxy-providers 与安全边界 ───────────────────────────────────────────────

describe('extractRawProxies with baseDir', () => {
    test('本地 proxy-providers 正常展开', () => {
        const dir = mkdtempSync(join(tmpdir(), 'clash-test-'));
        const providerYaml = `
proxies:
  - name: "Provider-01"
    type: ss
    server: 1.2.3.4
    port: 443
    cipher: aes-256-gcm
    password: secret
`;
        writeFileSync(join(dir, 'provider.yaml'), providerYaml, 'utf-8');

        const yaml = `
proxy-providers:
  myProvider:
    type: file
    path: ./provider.yaml
proxies: []
`;
        const { proxies, warnings } = extractRawProxies(yaml, dir);
        expect(warnings).toHaveLength(0);
        expect(proxies).toHaveLength(1);
        expect(proxies[0]['name']).toBe('Provider-01');
    });

    test('路径穿越（../../../etc/passwd）被拒绝，添加警告', () => {
        const dir = mkdtempSync(join(tmpdir(), 'clash-test-'));
        const yaml = `
proxy-providers:
  evil:
    type: file
    path: ../../../etc/passwd
proxies: []
`;
        const { proxies, warnings } = extractRawProxies(yaml, dir);
        expect(proxies).toHaveLength(0);
        expect(warnings.some(w => w.includes('路径穿越被拒绝'))).toBe(true);
    });

    test('超过 10MB 的输入被拒绝，返回警告', () => {
        const bigInput = 'x'.repeat(10 * 1024 * 1024 + 1);
        const { proxies, warnings } = extractRawProxies(bigInput);
        expect(proxies).toHaveLength(0);
        expect(warnings.some(w => w.includes('10MB'))).toBe(true);
    });
});
