/**
 * validate/runnable.ts — outbound 引用闭合性检查
 *
 * 检查 sing-box 配置中所有 outbound 引用是否闭合：
 * selector/urltest 的 outbounds 数组中引用的每个 tag 都必须存在于配置的 outbounds 列表中。
 */

/**
 * 检查 sing-box 配置中所有 outbound 引用是否闭合。
 * 即：selector/urltest 的 outbounds 数组中引用的每个 tag 都必须存在于配置的 outbounds 列表中。
 *
 * @returns 未解析的引用列表（为空表示通过）
 */
export function validateOutboundRefs(config: Record<string, unknown>): string[] {
    const outboundsRaw = config['outbounds'];
    if (!Array.isArray(outboundsRaw)) {
        return [];
    }

    // 步骤 1：提取所有已定义 outbound 的 tag
    const definedTags = new Set<string>();
    for (const item of outboundsRaw) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
            const tag = (item as Record<string, unknown>)['tag'];
            if (typeof tag === 'string' && tag !== '') {
                definedTags.add(tag);
            }
        }
    }

    // 步骤 2：遍历所有 selector/urltest 的 outbounds[]，找出未解析引用
    const dangling: string[] = [];
    const reported = new Set<string>();

    for (const item of outboundsRaw) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            continue;
        }

        const outbound = item as Record<string, unknown>;
        const type = outbound['type'];

        if (type !== 'selector' && type !== 'urltest') {
            continue;
        }

        const refs = outbound['outbounds'];
        if (!Array.isArray(refs)) {
            continue;
        }

        for (const ref of refs) {
            if (typeof ref !== 'string') {
                continue;
            }

            // 跳过未替换的占位符（防御性检查）
            if (ref === '$nodes' || ref.startsWith('$nodes:')) {
                continue;
            }

            if (!definedTags.has(ref) && !reported.has(ref)) {
                dangling.push(ref);
                reported.add(ref);
            }
        }
    }

    return dangling;
}
