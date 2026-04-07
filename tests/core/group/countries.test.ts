import { describe, test, expect } from 'bun:test';
import { detectCountry, groupByCountry, buildCountryGroup } from '@/core/group/countries';
import type { SubBridgeNode } from '@/core/types/node';

// ─── 辅助函数：创建最小节点 ──────────────────────────────────────────────────

function makeNode(tag: string): SubBridgeNode {
    return {
        type: 'shadowsocks',
        tag,
        server: '127.0.0.1',
        serverPort: 1080,
        method: 'aes-256-gcm',
        password: 'test',
        raw: {},
    };
}

// ─── detectCountry ──────────────────────────────────────────────────────────

describe('detectCountry', () => {
    // 香港
    test('识别中文"香港"', () => {
        expect(detectCountry('香港 01')).toBe('HK');
    });
    test('识别英文缩写 HK', () => {
        expect(detectCountry('HK-Premium')).toBe('HK');
    });
    test('识别 HongKong', () => {
        expect(detectCountry('HongKong IPLC')).toBe('HK');
    });

    // 日本
    test('识别中文"日本"', () => {
        expect(detectCountry('日本 IPLC 01')).toBe('JP');
    });
    test('识别 JP-Tokyo', () => {
        expect(detectCountry('JP-Tokyo-Direct')).toBe('JP');
    });
    test('识别城市名 Tokyo', () => {
        expect(detectCountry('Tokyo 直连')).toBe('JP');
    });
    test('识别城市名大阪', () => {
        expect(detectCountry('大阪 BGP')).toBe('JP');
    });

    // 美国
    test('识别中文"美国"', () => {
        expect(detectCountry('美国 CN2 GIA')).toBe('US');
    });
    test('识别 US-LA', () => {
        expect(detectCountry('US-LA-Cheapo')).toBe('US');
    });
    test('识别 Los Angeles', () => {
        expect(detectCountry('Los Angeles 01')).toBe('US');
    });
    test('识别 New York', () => {
        expect(detectCountry('New York Premium')).toBe('US');
    });

    // 新加坡
    test('识别中文"新加坡"', () => {
        expect(detectCountry('新加坡 BGP')).toBe('SG');
    });
    test('识别 SG 缩写', () => {
        expect(detectCountry('SG-Optimized')).toBe('SG');
    });

    // 台湾
    test('识别中文"台湾"', () => {
        expect(detectCountry('台湾精品')).toBe('TW');
    });
    test('识别英文 Taiwan', () => {
        expect(detectCountry('Taiwan IPLC')).toBe('TW');
    });
    test('识别繁体"台灣"', () => {
        expect(detectCountry('台灣 01')).toBe('TW');
    });

    // 韩国
    test('识别中文"韩国"', () => {
        expect(detectCountry('韩国首尔 01')).toBe('KR');
    });
    test('识别 Korea', () => {
        expect(detectCountry('Korea Direct')).toBe('KR');
    });

    // 德国
    test('识别中文"德国"', () => {
        expect(detectCountry('德国 01')).toBe('DE');
    });
    test('识别 Germany', () => {
        expect(detectCountry('Germany Frankfurt')).toBe('DE');
    });

    // 英国
    test('识别中文"英国"', () => {
        expect(detectCountry('英国 London')).toBe('GB');
    });
    test('识别 UK 缩写', () => {
        expect(detectCountry('UK-Premium')).toBe('GB');
    });

    // 法国
    test('识别中文"法国"', () => {
        expect(detectCountry('法国 01')).toBe('FR');
    });
    test('识别 Paris', () => {
        expect(detectCountry('Paris Direct')).toBe('FR');
    });

    // 荷兰
    test('识别中文"荷兰"', () => {
        expect(detectCountry('荷兰 01')).toBe('NL');
    });
    test('识别 Amsterdam', () => {
        expect(detectCountry('Amsterdam BGP')).toBe('NL');
    });

    // 俄罗斯
    test('识别中文"俄罗斯"', () => {
        expect(detectCountry('俄罗斯 01')).toBe('RU');
    });
    test('识别 Russia', () => {
        expect(detectCountry('Russia Moscow')).toBe('RU');
    });

    // 澳大利亚
    test('识别中文"澳洲"', () => {
        expect(detectCountry('澳洲 01')).toBe('AU');
    });
    test('识别 Sydney', () => {
        expect(detectCountry('Sydney Direct')).toBe('AU');
    });

    // 加拿大
    test('识别中文"加拿大"', () => {
        expect(detectCountry('加拿大 01')).toBe('CA');
    });
    test('识别 Toronto', () => {
        expect(detectCountry('Toronto BGP')).toBe('CA');
    });

    // 印度
    test('识别中文"印度"', () => {
        expect(detectCountry('印度 Mumbai')).toBe('IN');
    });
    test('识别 India', () => {
        expect(detectCountry('India Direct')).toBe('IN');
    });

    // 土耳其
    test('识别中文"土耳其"', () => {
        expect(detectCountry('土耳其 01')).toBe('TR');
    });
    test('识别 Istanbul', () => {
        expect(detectCountry('Istanbul Direct')).toBe('TR');
    });

    // 泰国
    test('识别中文"泰国"', () => {
        expect(detectCountry('泰国 01')).toBe('TH');
    });
    test('识别 Bangkok', () => {
        expect(detectCountry('Bangkok Direct')).toBe('TH');
    });

    // 越南
    test('识别中文"越南"', () => {
        expect(detectCountry('越南 01')).toBe('VN');
    });
    test('识别 Vietnam', () => {
        expect(detectCountry('Vietnam Direct')).toBe('VN');
    });

    // 马来西亚
    test('识别中文"马来西亚"', () => {
        expect(detectCountry('马来西亚 01')).toBe('MY');
    });
    test('识别 Kuala Lumpur', () => {
        expect(detectCountry('Kuala Lumpur Direct')).toBe('MY');
    });

    // 菲律宾
    test('识别中文"菲律宾"', () => {
        expect(detectCountry('菲律宾 01')).toBe('PH');
    });
    test('识别 Philippines', () => {
        expect(detectCountry('Philippines Direct')).toBe('PH');
    });

    // 印度尼西亚
    test('识别中文"印尼"', () => {
        expect(detectCountry('印尼 01')).toBe('ID');
    });
    test('识别 Indonesia', () => {
        expect(detectCountry('Indonesia Direct')).toBe('ID');
    });

    // 无法识别
    test('未知节点返回 OTHER', () => {
        expect(detectCountry('Unknown Server')).toBe('OTHER');
    });
    test('订阅信息误入返回 OTHER', () => {
        expect(detectCountry('流量剩余: 100GB')).toBe('OTHER');
    });
    test('空字符串返回 OTHER', () => {
        expect(detectCountry('')).toBe('OTHER');
    });
    test('纯数字返回 OTHER', () => {
        expect(detectCountry('001')).toBe('OTHER');
    });

    // 误匹配防护
    test('"港利"不匹配 HK', () => {
        expect(detectCountry('港利通道')).toBe('OTHER');
    });
    test('"港币"不匹配 HK', () => {
        expect(detectCountry('港币汇率')).toBe('OTHER');
    });
    test('"美元"不匹配 US', () => {
        expect(detectCountry('美元汇率查询')).toBe('OTHER');
    });
    test('"印度尼西亚"不匹配 IN', () => {
        // 印度尼西亚应匹配 ID，而非 IN
        expect(detectCountry('印度尼西亚节点')).toBe('ID');
    });
});

// ─── groupByCountry ──────────────────────────────────────────────────────────

describe('groupByCountry', () => {
    test('正确按地区分组节点', () => {
        const nodes = [
            makeNode('香港 01'),
            makeNode('香港 02'),
            makeNode('日本 01'),
            makeNode('美国 LA'),
            makeNode('Unknown Node'),
        ];

        const result = groupByCountry(nodes);

        expect(result.get('HK')).toEqual(['香港 01', '香港 02']);
        expect(result.get('JP')).toEqual(['日本 01']);
        expect(result.get('US')).toEqual(['美国 LA']);
        expect(result.get('OTHER')).toEqual(['Unknown Node']);
    });

    test('原地赋值 countryCode 到节点', () => {
        const nodes = [
            makeNode('香港 01'),
            makeNode('Unknown'),
        ];

        groupByCountry(nodes);

        expect(nodes[0].countryCode).toBe('HK');
        expect(nodes[1].countryCode).toBe('OTHER');
    });

    test('空节点列表返回空 Map', () => {
        const result = groupByCountry([]);
        expect(result.size).toBe(0);
    });

    test('OTHER 分组存在并包含无法识别的节点', () => {
        const nodes = [
            makeNode('剩余流量: 200GB'),
            makeNode('到期时间: 2099-01-01'),
            makeNode('新加坡 01'),
        ];

        const result = groupByCountry(nodes);

        expect(result.has('OTHER')).toBe(true);
        const others = result.get('OTHER')!;
        expect(others).toContain('剩余流量: 200GB');
        expect(others).toContain('到期时间: 2099-01-01');
        expect(result.get('SG')).toEqual(['新加坡 01']);
    });

    test('同一地区多节点均被收入 Map', () => {
        const nodes = [
            makeNode('JP 01'),
            makeNode('JP 02'),
            makeNode('Japan Tokyo 03'),
            makeNode('东京 04'),
        ];

        const result = groupByCountry(nodes);
        expect(result.get('JP')).toHaveLength(4);
    });
});

// ─── buildCountryGroup ──────────────────────────────────────────────────────

describe('buildCountryGroup', () => {
    test('HK 分组生成正确的 selector tag', () => {
        const { selector } = buildCountryGroup('HK', ['香港 01', '香港 02']);
        expect(selector.tag).toBe('🇭🇰 香港');
        expect(selector.type).toBe('selector');
    });

    test('HK 分组生成正确的 urltest tag', () => {
        const { urltest } = buildCountryGroup('HK', ['香港 01', '香港 02']);
        expect(urltest.tag).toBe('🇭🇰 香港 - 自动');
        expect(urltest.type).toBe('urltest');
    });

    test('HK selector outbounds 以 urltest tag 开头', () => {
        const tags = ['香港 01', '香港 02'];
        const { selector, urltest } = buildCountryGroup('HK', tags);
        expect(selector.outbounds[0]).toBe(urltest.tag);
        expect(selector.outbounds.slice(1)).toEqual(tags);
    });

    test('HK urltest outbounds 包含所有节点 tag', () => {
        const tags = ['香港 01', '香港 02'];
        const { urltest } = buildCountryGroup('HK', tags);
        expect(urltest.outbounds).toEqual(tags);
    });

    test('urltest interval 为 5m', () => {
        const { urltest } = buildCountryGroup('JP', ['日本 01']);
        expect(urltest.interval).toBe('5m');
    });

    test('OTHER 分组 selector tag 为 "🌍 其他"', () => {
        const { selector } = buildCountryGroup('OTHER', ['Unknown 01']);
        expect(selector.tag).toBe('🌍 其他');
    });

    test('OTHER 分组 urltest tag 为 "🌍 其他 - 自动"', () => {
        const { urltest } = buildCountryGroup('OTHER', ['Unknown 01']);
        expect(urltest.tag).toBe('🌍 其他 - 自动');
    });

    test('US 分组生成正确 tag', () => {
        const { selector, urltest } = buildCountryGroup('US', ['美国 01']);
        expect(selector.tag).toBe('🇺🇸 美国');
        expect(urltest.tag).toBe('🇺🇸 美国 - 自动');
    });

    test('SG 分组生成正确 tag', () => {
        const { selector, urltest } = buildCountryGroup('SG', ['新加坡 01']);
        expect(selector.tag).toBe('🇸🇬 新加坡');
        expect(urltest.tag).toBe('🇸🇬 新加坡 - 自动');
    });

    test('未知 code 使用 code 本身作为 tag', () => {
        const { selector, urltest } = buildCountryGroup('ZZ', ['某节点 01']);
        expect(selector.tag).toBe('ZZ');
        expect(urltest.tag).toBe('ZZ - 自动');
    });

    test('单节点分组结构正确', () => {
        const tags = ['台湾 01'];
        const { selector, urltest } = buildCountryGroup('TW', tags);
        expect(selector.outbounds).toHaveLength(2); // urltest tag + 1 node
        expect(urltest.outbounds).toHaveLength(1);
    });
});
