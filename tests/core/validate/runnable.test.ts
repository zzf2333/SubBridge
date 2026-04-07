import { describe, expect, test } from 'bun:test';
import { validateOutboundRefs } from '@/core/validate/runnable';

describe('validateOutboundRefs', () => {
    test('空配置返回空数组', () => {
        const result = validateOutboundRefs({});
        expect(result).toEqual([]);
    });

    test('无 selector/urltest 时返回空数组', () => {
        const config = {
            outbounds: [
                { type: 'shadowsocks', tag: 'ss-01', server: '1.2.3.4', server_port: 443 },
                { type: 'direct', tag: 'direct' },
            ],
        };
        const result = validateOutboundRefs(config);
        expect(result).toEqual([]);
    });

    test('引用全部闭合时返回空数组', () => {
        const config = {
            outbounds: [
                {
                    type: 'selector',
                    tag: '🚀 节点',
                    outbounds: ['♻️ 自动', 'ss-01'],
                },
                {
                    type: 'urltest',
                    tag: '♻️ 自动',
                    outbounds: ['ss-01'],
                    interval: '5m',
                },
                { type: 'shadowsocks', tag: 'ss-01', server: '1.2.3.4', server_port: 443 },
            ],
        };
        const result = validateOutboundRefs(config);
        expect(result).toEqual([]);
    });

    test('存在未闭合引用时返回对应 tag', () => {
        const config = {
            outbounds: [
                {
                    type: 'selector',
                    tag: '🚀 节点',
                    outbounds: ['♻️ 自动', 'ss-01', 'missing-node'],
                },
                {
                    type: 'urltest',
                    tag: '♻️ 自动',
                    outbounds: ['ss-01'],
                },
                { type: 'shadowsocks', tag: 'ss-01', server: '1.2.3.4', server_port: 443 },
            ],
        };
        const result = validateOutboundRefs(config);
        expect(result).toContain('missing-node');
        expect(result).toHaveLength(1);
    });

    test('跳过未替换的占位符 $nodes 和 $nodes:XX', () => {
        const config = {
            outbounds: [
                {
                    type: 'selector',
                    tag: '🚀 节点',
                    outbounds: ['$nodes', '$nodes:HK'],
                },
            ],
        };
        const result = validateOutboundRefs(config);
        expect(result).toEqual([]);
    });

    test('相同未闭合引用只报告一次（去重）', () => {
        const config = {
            outbounds: [
                {
                    type: 'selector',
                    tag: 'selector-a',
                    outbounds: ['ghost-tag'],
                },
                {
                    type: 'urltest',
                    tag: 'urltest-a',
                    outbounds: ['ghost-tag'],
                },
            ],
        };
        const result = validateOutboundRefs(config);
        expect(result).toEqual(['ghost-tag']);
    });
});
