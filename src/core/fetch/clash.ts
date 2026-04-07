/**
 * fetch/clash.ts — 从 Clash YAML 提取原始代理数据
 *
 * 职责：解析 YAML 文本，从 proxies: 数组提取原始代理对象，展开本地 proxy-providers。
 * 不做协议解析或格式转换，只返回原始数据供 convert 层处理。
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, sep } from 'path';
import yaml from 'js-yaml';

const MAX_INPUT_SIZE = 10 * 1024 * 1024; // 10MB

export interface ExtractResult {
    proxies: Record<string, unknown>[];
    /** 提取过程中遇到的轻微问题（不影响整体流程） */
    warnings: string[];
}

/**
 * 从 Clash YAML 文本提取原始代理对象列表。
 * @param input  YAML 文本
 * @param baseDir 用于解析本地 proxy-providers 相对路径（可选）
 */
export function extractRawProxies(input: string, baseDir?: string): ExtractResult {
    const warnings: string[] = [];

    if (!input || input.trim().length === 0) {
        return { proxies: [], warnings: ['YAML 内容为空'] };
    }

    if (Buffer.byteLength(input, 'utf8') > MAX_INPUT_SIZE) {
        return { proxies: [], warnings: ['输入超过 10MB 限制'] };
    }

    let parsed: unknown;
    try {
        parsed = yaml.load(input);
    } catch (e) {
        return { proxies: [], warnings: [`YAML 解析失败: ${(e as Error).message}`] };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { proxies: [], warnings: ['配置格式不合法，期望 YAML 对象'] };
    }

    const config = parsed as Record<string, unknown>;
    const seen = new Set<string>();
    const proxies: Record<string, unknown>[] = [];

    const addProxy = (raw: unknown) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return;
        }
        const proxy = raw as Record<string, unknown>;
        const name = typeof proxy.name === 'string' ? proxy.name : undefined;
        if (!name || seen.has(name)) {
            return;
        }
        seen.add(name);
        proxies.push(proxy);
    };

    // 主 proxies 列表
    if (Array.isArray(config.proxies)) {
        for (const p of config.proxies) {
            addProxy(p);
        }
    }

    // 展开本地 proxy-providers
    if (
        baseDir &&
        config['proxy-providers'] &&
        typeof config['proxy-providers'] === 'object' &&
        !Array.isArray(config['proxy-providers'])
    ) {
        const providers = config['proxy-providers'] as Record<string, unknown>;
        for (const [name, provider] of Object.entries(providers)) {
            if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
                continue;
            }

            const p = provider as Record<string, unknown>;
            const localPath = typeof p.path === 'string' ? p.path : undefined;
            if (!localPath) {
                continue;
            }

            const resolvedPath = resolve(baseDir, localPath);
            if (
                !resolvedPath.startsWith(baseDir + sep) &&
                resolvedPath !== baseDir
            ) {
                warnings.push(`proxy-providers.${name}: 路径穿越被拒绝`);
                continue;
            }
            if (!existsSync(resolvedPath)) {
                continue;
            }

            try {
                const content = readFileSync(resolvedPath, 'utf-8');
                const providerParsed = yaml.load(content) as Record<string, unknown>;
                if (Array.isArray(providerParsed?.proxies)) {
                    for (const p of providerParsed.proxies) {
                        addProxy(p);
                    }
                }
            } catch (e) {
                warnings.push(
                    `proxy-providers.${name}: 读取本地缓存失败: ${(e as Error).message}`
                );
            }
        }
    }

    return { proxies, warnings };
}
