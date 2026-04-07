import { describe, test, expect } from 'bun:test';
import { injectIntoTemplate } from '@/core/inject/inject';
import type { InjectContext } from '@/core/inject/inject';
import type { SingBoxOutbound } from '@/core/types/singbox';

// ─── Fixture 数据 ─────────────────────────────────────────────────────────────

const mockOutbounds: SingBoxOutbound[] = [
    {
        type: 'shadowsocks',
        tag: 'HK-01',
        server: '1.2.3.4',
        server_port: 8388,
        method: 'aes-256-gcm',
        password: 'pass1',
    },
    {
        type: 'vmess',
        tag: 'JP-01',
        server: '5.6.7.8',
        server_port: 443,
        uuid: 'uuid-1234',
    },
    {
        type: 'vless',
        tag: 'US-01',
        server: '9.10.11.12',
        server_port: 443,
        uuid: 'uuid-5678',
    },
];

const mockCountryMap = new Map<string, string[]>([
    ['HK', ['HK-01']],
    ['JP', ['JP-01']],
    ['US', ['US-01']],
]);

const ctx: InjectContext = {
    outbounds: mockOutbounds,
    countryMap: mockCountryMap,
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

function makeTemplate(outbounds: unknown[]): Record<string, unknown> {
    return {
        log: { level: 'info' },
        dns: { servers: [{ tag: 'local', type: 'udp', server: '223.5.5.5' }] },
        inbounds: [{ type: 'tun', tag: 'tun-in' }],
        outbounds,
        route: { final: '🚀 节点' },
    };
}

// ─── 测试：字符串占位符 $nodes ────────────────────────────────────────────────

describe('$nodes 字符串占位符', () => {
    test('$nodes 展开为所有节点 tag 列表', () => {
        const template = makeTemplate([
            { type: 'selector', tag: '🚀 节点', outbounds: ['♻️ 自动', '$nodes'] },
        ]);

        const result = injectIntoTemplate(template, ctx);
        const outbounds = result['outbounds'] as Array<{ outbounds?: string[] }>;
        const selector = outbounds[0];

        expect(selector.outbounds).toEqual(['♻️ 自动', 'HK-01', 'JP-01', 'US-01']);
    });

    test('urltest 中 $nodes 展开为所有节点 tag', () => {
        const template = makeTemplate([
            { type: 'urltest', tag: '♻️ 自动', outbounds: ['$nodes'], interval: '5m' },
        ]);

        const result = injectIntoTemplate(template, ctx);
        const outbounds = result['outbounds'] as Array<{ outbounds?: string[] }>;
        expect(outbounds[0].outbounds).toEqual(['HK-01', 'JP-01', 'US-01']);
    });
});

// ─── 测试：字符串占位符 $nodes:CODE ──────────────────────────────────────────

describe('$nodes:CODE 字符串占位符', () => {
    test('$nodes:HK 展开为香港节点 tag 列表', () => {
        const template = makeTemplate([
            { type: 'selector', tag: '🇭🇰 香港', outbounds: ['$nodes:HK'] },
        ]);

        const result = injectIntoTemplate(template, ctx);
        const outbounds = result['outbounds'] as Array<{ outbounds?: string[] }>;
        expect(outbounds[0].outbounds).toEqual(['HK-01']);
    });

    test('$nodes:XX（不存在的国家）展开为空，占位符被移除', () => {
        const template = makeTemplate([
            { type: 'selector', tag: '未知', outbounds: ['$nodes:ZZ'] },
        ]);

        const result = injectIntoTemplate(template, ctx);
        const outbounds = result['outbounds'] as Array<{ outbounds?: string[] }>;
        expect(outbounds[0].outbounds).toEqual([]);
    });
});

// ─── 测试：对象占位符 { "$subbridge": "nodes" } ───────────────────────────────

describe('对象占位符 $subbridge:nodes', () => {
    test('展开为所有节点 outbound 对象', () => {
        const template = makeTemplate([
            { '$subbridge': 'nodes' },
            { type: 'direct', tag: 'direct' },
        ]);

        const result = injectIntoTemplate(template, ctx);
        const outbounds = result['outbounds'] as SingBoxOutbound[];

        // 3 个节点 + 1 个 direct
        expect(outbounds).toHaveLength(4);
        expect(outbounds[0]).toEqual(mockOutbounds[0]);
        expect(outbounds[1]).toEqual(mockOutbounds[1]);
        expect(outbounds[2]).toEqual(mockOutbounds[2]);
        expect(outbounds[3]).toMatchObject({ type: 'direct', tag: 'direct' });
    });
});

// ─── 测试：对象占位符 { "$subbridge": "country_groups" } ─────────────────────

describe('对象占位符 $subbridge:country_groups', () => {
    test('展开为有节点国家的 selector + urltest（每国两个 outbound）', () => {
        const template = makeTemplate([
            { '$subbridge': 'country_groups' },
        ]);

        const result = injectIntoTemplate(template, ctx);
        const outbounds = result['outbounds'] as SingBoxOutbound[];

        // 3 个国家 × 2 = 6 个 outbound
        expect(outbounds).toHaveLength(6);

        // 每两个是一对 selector + urltest
        const types = outbounds.map((o) => o.type);
        // 每对应为 selector, urltest（按 buildCountryGroup 的返回顺序）
        for (let i = 0; i < outbounds.length; i += 2) {
            expect(['selector', 'urltest']).toContain(types[i]);
            expect(['selector', 'urltest']).toContain(types[i + 1]);
        }
    });

    test('OTHER 组不出现在 country_groups 展开中', () => {
        const ctxWithOther: InjectContext = {
            outbounds: [
                ...mockOutbounds,
                {
                    type: 'shadowsocks',
                    tag: 'OTHER-01',
                    server: '1.1.1.1',
                    server_port: 1080,
                    method: 'aes-128-gcm',
                    password: 'other',
                },
            ],
            countryMap: new Map([
                ['HK', ['HK-01']],
                ['JP', ['JP-01']],
                ['US', ['US-01']],
                ['OTHER', ['OTHER-01']],
            ]),
        };

        const template = makeTemplate([{ '$subbridge': 'country_groups' }]);
        const result = injectIntoTemplate(template, ctxWithOther);
        const outbounds = result['outbounds'] as SingBoxOutbound[];

        // 不应包含 OTHER 标签的 outbound
        const tags = outbounds.map((o) => o.tag);
        expect(tags.some((t) => t.includes('其他') || t === 'OTHER')).toBe(false);
        // 仍然是 3 个国家的分组
        expect(outbounds).toHaveLength(6);
    });

    test('按 COUNTRY_PATTERNS 顺序排列（HK 在 JP 之前，JP 在 US 之前）', () => {
        const template = makeTemplate([{ '$subbridge': 'country_groups' }]);
        const result = injectIntoTemplate(template, ctx);
        const outbounds = result['outbounds'] as SingBoxOutbound[];

        const tags = outbounds.map((o) => o.tag);
        // HK 相关 tag 应出现在 JP 之前，JP 在 US 之前
        const hkIdx = tags.findIndex((t) => t.includes('香港'));
        const jpIdx = tags.findIndex((t) => t.includes('日本'));
        const usIdx = tags.findIndex((t) => t.includes('美国'));

        expect(hkIdx).toBeLessThan(jpIdx);
        expect(jpIdx).toBeLessThan(usIdx);
    });
});

// ─── 测试：多种占位符同时存在 ─────────────────────────────────────────────────

describe('多种占位符组合', () => {
    test('模板中同时存在多种占位符时全部正确展开', () => {
        const template = makeTemplate([
            { type: 'selector', tag: '🚀 节点', outbounds: ['♻️ 自动', '$nodes'] },
            { type: 'urltest', tag: '♻️ 自动', outbounds: ['$nodes'], interval: '5m', tolerance: 50 },
            { '$subbridge': 'country_groups' },
            { '$subbridge': 'nodes' },
            { type: 'direct', tag: 'direct' },
            { type: 'block', tag: 'block' },
            { type: 'dns', tag: 'dns-out' },
        ]);

        const result = injectIntoTemplate(template, ctx);
        const outbounds = result['outbounds'] as SingBoxOutbound[];

        // 2 (selector/urltest) + 6 (country_groups 3×2) + 3 (nodes) + 3 (fixed)
        expect(outbounds).toHaveLength(14);

        // selector 的 outbounds 应包含所有节点 tag
        const selector = outbounds[0] as { outbounds: string[] };
        expect(selector.outbounds).toContain('HK-01');
        expect(selector.outbounds).toContain('JP-01');
        expect(selector.outbounds).toContain('US-01');
        expect(selector.outbounds[0]).toBe('♻️ 自动');

        // direct / block / dns-out 在末尾
        const lastThree = outbounds.slice(-3).map((o) => o.tag);
        expect(lastThree).toEqual(['direct', 'block', 'dns-out']);
    });
});

// ─── 测试：非 outbounds 部分原样保留 ─────────────────────────────────────────

describe('模板其余部分原样保留', () => {
    test('dns / route / inbounds 不受注入影响', () => {
        const template: Record<string, unknown> = {
            log: { level: 'info', timestamp: true },
            dns: {
                servers: [
                    { tag: 'local', type: 'udp', server: '223.5.5.5' },
                    { tag: 'remote', type: 'tls', server: '8.8.8.8', detour: '🚀 节点' },
                ],
                final: 'remote',
                independent_cache: true,
            },
            inbounds: [
                {
                    type: 'tun',
                    tag: 'tun-in',
                    address: ['172.19.0.1/30'],
                    auto_route: true,
                },
            ],
            outbounds: [{ '$subbridge': 'nodes' }],
            route: {
                auto_detect_interface: true,
                final: '🚀 节点',
            },
        };

        const result = injectIntoTemplate(template, ctx);

        // log 原样
        expect(result['log']).toEqual({ level: 'info', timestamp: true });

        // dns 原样
        const dns = result['dns'] as Record<string, unknown>;
        expect(dns['final']).toBe('remote');
        expect((dns['servers'] as unknown[]).length).toBe(2);

        // inbounds 原样
        const inbounds = result['inbounds'] as unknown[];
        expect(inbounds).toHaveLength(1);
        expect((inbounds[0] as Record<string, unknown>)['type']).toBe('tun');

        // route 原样
        const route = result['route'] as Record<string, unknown>;
        expect(route['final']).toBe('🚀 节点');
        expect(route['auto_detect_interface']).toBe(true);
    });
});
