import { readFileSync } from 'fs';
import defaultTemplate from './default.json';

/**
 * 加载模板。未指定 templatePath 时使用内置默认模板。
 *
 * 内置默认模板通过 JSON import 嵌入，不依赖运行时文件系统路径，
 * 兼容 Node.js 和 Bun。
 *
 * @param templatePath 可选，外部模板文件路径
 * @returns 解析后的模板对象
 */
export function loadTemplate(templatePath?: string): Record<string, unknown> {
    if (templatePath) {
        const raw = readFileSync(templatePath, 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error(`模板文件格式不合法，期望 JSON 对象: ${templatePath}`);
        }
        return parsed as Record<string, unknown>;
    }

    // 内置默认模板已通过 import 嵌入，无需文件系统访问
    return defaultTemplate as unknown as Record<string, unknown>;
}
