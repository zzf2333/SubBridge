/**
 * fetch/providers.ts — 从订阅 URL 拉取节点
 *
 * 职责：HTTP 拉取订阅内容（Clash YAML 格式），带文件缓存。
 * 移植自 parse/providers.ts，大幅简化：只保留 proxy 订阅拉取，
 * 不处理 rule-providers，不做本地 provider 展开（由 fetch/clash.ts 负责）。
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { fetchText, type UrlValidator } from '../../utils/http';
import { extractRawProxies } from './clash';

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_TTL_MS = 3600 * 1000; // 1 小时

export interface FetchOptions {
    /** 缓存文件路径（不传则不缓存） */
    cachePath?: string;
    /** 缓存有效期（毫秒），默认 1 小时 */
    cacheTtlMs?: number;
    /** 强制重新拉取，忽略缓存 */
    force?: boolean;
    /** 请求超时（毫秒），默认 10 秒 */
    timeoutMs?: number;
    /** 自定义 fetcher（测试用） */
    fetcher?: (url: string, timeoutMs: number) => Promise<string>;
    /** URL 安全验证回调，每次重定向都会调用（可选） */
    validateUrl?: UrlValidator;
    /** 当前时间戳（测试用） */
    nowMs?: () => number;
}

export interface FetchSubscriptionResult {
    proxies: Record<string, unknown>[];
    fromCache: boolean;
    warnings: string[];
}

/**
 * 从订阅 URL 拉取 Clash 格式节点列表，支持文件缓存。
 */
export async function fetchSubscription(
    url: string,
    options: FetchOptions = {}
): Promise<FetchSubscriptionResult> {
    const warnings: string[] = [];
    const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    const validateUrl = options.validateUrl;
    // 将 validateUrl 透传给 fetchText，确保重定向时也验证目标 URL
    const fetcher = options.fetcher ?? ((u: string, t: number) => fetchText(u, t, validateUrl));
    const nowMs = options.nowMs ?? (() => Date.now());
    const cachePath = options.cachePath;

    // 检查缓存
    if (cachePath && !options.force && isCacheValid(cachePath, cacheTtlMs, nowMs)) {
        try {
            const cached = readFileSync(cachePath, 'utf-8');
            const { proxies, warnings: parseWarnings } = extractRawProxies(cached);
            return { proxies, fromCache: true, warnings: parseWarnings };
        } catch {
            // 缓存读取失败，继续远程拉取
        }
    }

    // 远程拉取
    let content: string;
    try {
        content = await fetcher(url, timeoutMs);
    } catch (e) {
        const msg = `拉取失败: ${(e as Error).message}`;
        warnings.push(msg);

        // 降级：尝试使用过期缓存
        if (cachePath && existsSync(cachePath)) {
            try {
                const cached = readFileSync(cachePath, 'utf-8');
                const { proxies, warnings: parseWarnings } = extractRawProxies(cached);
                warnings.push('使用过期缓存');
                return { proxies, fromCache: true, warnings: [...warnings, ...parseWarnings] };
            } catch {
                // 缓存也读不到
            }
        }

        return { proxies: [], fromCache: false, warnings };
    }

    // 写入缓存
    if (cachePath) {
        try {
            mkdirSync(dirname(cachePath), { recursive: true });
            writeFileSync(cachePath, content, 'utf-8');
        } catch (e) {
            warnings.push(`写缓存失败: ${(e as Error).message}`);
        }
    }

    const { proxies, warnings: parseWarnings } = extractRawProxies(content);
    return { proxies, fromCache: false, warnings: [...warnings, ...parseWarnings] };
}

function isCacheValid(cachePath: string, ttlMs: number, nowMs: () => number): boolean {
    if (!existsSync(cachePath)) {
        return false;
    }
    try {
        const mtimeMs = statSync(cachePath).mtimeMs;
        const ageMs = Math.max(0, nowMs() - mtimeMs);
        return ageMs <= ttlMs;
    } catch {
        return false;
    }
}
