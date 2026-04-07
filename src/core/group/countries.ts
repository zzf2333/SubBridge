/**
 * 地区识别与分组
 *
 * - detectCountry：从节点名识别地区代码
 * - groupByCountry：给节点列表赋 countryCode，建立 country → tags 索引
 * - buildCountryGroup：生成 sing-box selector + urltest outbound 对
 */

import type { SubBridgeNode } from '../types/node';
import type {
    SingBoxSelectorOutbound,
    SingBoxURLTestOutbound,
} from '../types/singbox';
import { COUNTRY_PATTERNS } from './patterns';

/**
 * 识别节点名中的地区，返回地区代码（如 'HK'）。
 * 无法识别时返回 'OTHER'。
 */
export function detectCountry(nodeName: string): string {
    for (const pattern of COUNTRY_PATTERNS) {
        if (pattern.regex.test(nodeName)) {
            return pattern.code;
        }
    }
    return 'OTHER';
}

/**
 * 给节点列表赋 countryCode，并建立 country → tags 索引。
 * 原地修改 nodes 数组中每个节点的 countryCode 字段。
 *
 * @returns Map<countryCode, tag[]>，包含 'OTHER' 分组
 */
export function groupByCountry(nodes: SubBridgeNode[]): Map<string, string[]> {
    const result = new Map<string, string[]>();

    for (const node of nodes) {
        const code = detectCountry(node.tag);
        node.countryCode = code;

        const existing = result.get(code);
        if (existing) {
            existing.push(node.tag);
        } else {
            result.set(code, [node.tag]);
        }
    }

    return result;
}

/**
 * 根据国家代码生成 sing-box selector + urltest outbound 对。
 * 供 inject 层使用。
 */
export function buildCountryGroup(
    code: string,
    tags: string[],
): { selector: SingBoxSelectorOutbound; urltest: SingBoxURLTestOutbound } {
    let selectorTag: string;
    let urltestTag: string;

    if (code === 'OTHER') {
        selectorTag = '🌍 其他';
        urltestTag = '🌍 其他 - 自动';
    } else {
        const pattern = COUNTRY_PATTERNS.find((p) => p.code === code);
        if (pattern) {
            selectorTag = `${pattern.emoji} ${pattern.name}`;
            urltestTag = `${pattern.emoji} ${pattern.name} - 自动`;
        } else {
            selectorTag = code;
            urltestTag = `${code} - 自动`;
        }
    }

    const urltest: SingBoxURLTestOutbound = {
        type: 'urltest',
        tag: urltestTag,
        outbounds: [...tags],
        interval: '5m',
    };

    const selector: SingBoxSelectorOutbound = {
        type: 'selector',
        tag: selectorTag,
        outbounds: [urltestTag, ...tags],
    };

    return { selector, urltest };
}
