/**
 * inject/inject.ts
 *
 * 将节点数据注入到 sing-box 模板中，展开所有占位符。
 *
 * 占位符分三类：
 * 1. 对象占位符 { "$subbridge": "nodes" }        → 展开为节点 outbound 对象数组
 * 2. 对象占位符 { "$subbridge": "country_groups" } → 展开为国家 selector + urltest 对
 * 3. 字符串占位符 "$nodes"                        → 展开为所有节点 tag 列表
 * 4. 字符串占位符 "$nodes:HK"                     → 展开为 HK 国家的节点 tag 列表
 */

import type { SingBoxOutbound } from '@/core/types/singbox';
import { buildCountryGroup } from '@/core/group/countries';
import { COUNTRY_PATTERNS } from '@/core/group/patterns';
import {
    SUBBRIDGE_KEY,
    PLACEHOLDER_NODES,
    PLACEHOLDER_COUNTRY_GROUPS,
    PREFIX_NODES,
    PREFIX_NODES_COUNTRY,
} from './placeholder';

export interface InjectContext {
    /** 所有节点的 outbound 对象 */
    outbounds: SingBoxOutbound[];
    /** 国家代码 → 节点 tag 列表的映射 */
    countryMap: Map<string, string[]>;
}

/**
 * 将节点注入到模板中，展开所有占位符。
 * 返回完整的 sing-box 配置对象。
 */
export function injectIntoTemplate(
    template: Record<string, unknown>,
    ctx: InjectContext,
): Record<string, unknown> {
    // 深度克隆，不修改原始模板
    const cloned = JSON.parse(JSON.stringify(template)) as Record<string, unknown>;

    // 预计算节点 tag 列表（去重保序）
    const allNodeTags = deduplicateTags(ctx.outbounds.map((o) => o.tag));

    return processObject(cloned, ctx, allNodeTags) as Record<string, unknown>;
}

// ─── 递归处理 ─────────────────────────────────────────────────────────────────

function processValue(
    value: unknown,
    ctx: InjectContext,
    allNodeTags: string[],
): unknown {
    if (Array.isArray(value)) {
        return processArray(value, ctx, allNodeTags);
    }
    if (isPlainObject(value)) {
        return processObject(value as Record<string, unknown>, ctx, allNodeTags);
    }
    return value;
}

function processObject(
    obj: Record<string, unknown>,
    ctx: InjectContext,
    allNodeTags: string[],
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
        result[key] = processValue(val, ctx, allNodeTags);
    }
    return result;
}

/**
 * 处理数组：
 * - 遇到对象占位符 → 展开为多个元素
 * - 遇到字符串占位符 → 展开为多个字符串
 * - 其他元素 → 递归处理后原样保留
 */
function processArray(
    arr: unknown[],
    ctx: InjectContext,
    allNodeTags: string[],
): unknown[] {
    const result: unknown[] = [];

    for (const item of arr) {
        // 检查对象占位符
        if (isPlainObject(item)) {
            const obj = item as Record<string, unknown>;
            const subbridgeVal = obj[SUBBRIDGE_KEY];

            if (typeof subbridgeVal === 'string') {
                if (subbridgeVal === PLACEHOLDER_NODES) {
                    // 展开为所有节点 outbound 对象
                    result.push(...ctx.outbounds);
                    continue;
                }
                if (subbridgeVal === PLACEHOLDER_COUNTRY_GROUPS) {
                    // 展开为所有有节点的非 OTHER 国家的 selector + urltest
                    const groups = buildCountryGroupsOrdered(ctx.countryMap);
                    result.push(...groups);
                    continue;
                }
            }

            // 非占位符对象，递归处理后原样放入
            result.push(processObject(obj, ctx, allNodeTags));
            continue;
        }

        // 检查字符串占位符
        if (typeof item === 'string') {
            if (item === PREFIX_NODES) {
                // 展开为所有节点 tag
                result.push(...allNodeTags);
                continue;
            }
            if (item.startsWith(PREFIX_NODES_COUNTRY)) {
                // 展开为指定国家节点 tag
                const code = item.slice(PREFIX_NODES_COUNTRY.length).toUpperCase();
                const tags = ctx.countryMap.get(code) ?? [];
                result.push(...deduplicateTags(tags));
                continue;
            }
        }

        // 其他值，递归处理后原样保留
        result.push(processValue(item, ctx, allNodeTags));
    }

    return result;
}

// ─── 国家分组展开 ─────────────────────────────────────────────────────────────

/**
 * 按 COUNTRY_PATTERNS 顺序展开有节点的非 OTHER 国家的 selector + urltest。
 * 每个国家产出 [selector, urltest] 两个 outbound。
 */
function buildCountryGroupsOrdered(countryMap: Map<string, string[]>): SingBoxOutbound[] {
    const result: SingBoxOutbound[] = [];

    for (const pattern of COUNTRY_PATTERNS) {
        const tags = countryMap.get(pattern.code);
        if (!tags || tags.length === 0) continue;

        const { selector, urltest } = buildCountryGroup(pattern.code, tags);
        result.push(selector, urltest);
    }

    return result;
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 对 tag 列表按出现顺序去重 */
function deduplicateTags(tags: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const tag of tags) {
        if (!seen.has(tag)) {
            seen.add(tag);
            result.push(tag);
        }
    }
    return result;
}
