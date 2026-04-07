/**
 * build/pipeline.ts — 主流水线
 *
 * 编排完整的 7 步转换流程：
 *   步骤 1 — Fetch：从文件或订阅 URL 拉取原始代理数据
 *   步骤 2 — Parse：将原始代理数据解析为 SubBridgeNode
 *   步骤 3 — Group：按国家分组，给节点打上 countryCode 标签
 *   步骤 4 — Convert：SubBridgeNode → SingBoxOutbound
 *   步骤 5 — Load：加载 sing-box 模板
 *   步骤 6 — Inject：将节点数据注入模板，展开占位符
 *   步骤 7 — Validate + Output：验证引用闭合性，写出结果
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { extractRawProxies } from '@/core/fetch/clash';
import { fetchSubscription } from '@/core/fetch/providers';
import type { UrlValidator } from '@/utils/http';
import { parseRawProxy, nodeToOutbound } from '@/core/convert/outbounds';
import { groupByCountry } from '@/core/group/countries';
import { loadTemplate } from '@/core/template/loader';
import { injectIntoTemplate } from '@/core/inject/inject';
import { validateOutboundRefs } from '@/core/validate/runnable';
import { WarningCollector } from '@/core/observe/warnings';
import type { SubBridgeNode } from '@/core/types/node';

export interface PipelineOptions {
    /** 输入源列表（文件路径或订阅 URL） */
    inputs: string[];
    /** 自定义模板路径（可选，不传使用内置默认） */
    templatePath?: string;
    /** 输出文件路径（可选，不传时仅返回字符串） */
    outputPath?: string;
    /** 订阅缓存目录（可选） */
    cacheDir?: string;
    /** 是否强制刷新缓存 */
    forceRefresh?: boolean;
    /** 工作目录（用于解析本地 proxy-providers 相对路径） */
    cwd?: string;
    /** 自定义 fetcher（测试用，替代真实 HTTP 请求） */
    fetcher?: (url: string, timeoutMs: number) => Promise<string>;
    /** URL 安全验证回调（Web 场景传入，防止 SSRF 重定向绕过） */
    validateUrl?: UrlValidator;
    /**
     * 内联 YAML 内容（Web 场景使用，不触发文件系统访问）
     * 每项的 name 用于警告信息中标识来源
     */
    inlineInputs?: Array<{ name: string; content: string }>;
}

export interface PipelineResult {
    /** 最终的 sing-box 配置（JSON 字符串） */
    output: string;
    /** 成功转换的节点数 */
    convertedCount: number;
    /** 跳过的节点数 */
    skippedCount: number;
    /** 警告收集器（调用方可用于打印） */
    warnings: WarningCollector;
    /** outbound 引用未闭合的 tag 列表（通常为空） */
    danglingRefs: string[];
}

export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
    const warnings = new WarningCollector();
    const baseDir = options.cwd ?? process.cwd();

    // ─── 步骤 1：Fetch ─────────────────────────────────────────────────────────
    // 对每个 input 拉取原始代理列表，合并去重（同 name 只保留第一个）
    const allRaw: Record<string, unknown>[] = [];
    const seenNames = new Set<string>();

    const mergeProxies = (proxies: Record<string, unknown>[]) => {
        for (const proxy of proxies) {
            const name = typeof proxy['name'] === 'string' ? proxy['name'] : undefined;
            if (!name || seenNames.has(name)) {
                continue;
            }
            seenNames.add(name);
            allRaw.push(proxy);
        }
    };

    // 处理内联 YAML 内容（Web 场景，不触发文件系统访问）
    if (options.inlineInputs) {
        for (const { name, content } of options.inlineInputs) {
            const { proxies, warnings: w } = extractRawProxies(content);
            for (const warn of w) {
                warnings.addFetchFailed(name, warn);
            }
            mergeProxies(proxies);
        }
    }

    for (const input of options.inputs) {
        if (input.startsWith('http://') || input.startsWith('https://')) {
            // 订阅 URL：通过 fetchSubscription 拉取
            const cachePath = options.cacheDir
                ? resolve(
                    options.cacheDir,
                    encodeURIComponent(input).slice(0, 200) + '.yaml'
                )
                : undefined;

            const result = await fetchSubscription(input, {
                cachePath,
                force: options.forceRefresh,
                fetcher: options.fetcher,
                validateUrl: options.validateUrl,
            });

            if (result.warnings.length > 0) {
                for (const w of result.warnings) {
                    warnings.addFetchFailed(input, w);
                }
            }

            mergeProxies(result.proxies);
        } else {
            // 本地文件路径
            let content: string;
            try {
                content = readFileSync(input, 'utf-8');
            } catch (e) {
                warnings.addFetchFailed(input, `读取文件失败: ${(e as Error).message}`);
                continue;
            }

            const { proxies, warnings: extractWarnings } = extractRawProxies(content, baseDir);

            for (const w of extractWarnings) {
                warnings.addFetchFailed(input, w);
            }

            mergeProxies(proxies);
        }
    }

    // ─── 步骤 2：Parse（raw → SubBridgeNode）────────────────────────────────
    const nodes: SubBridgeNode[] = [];
    let skippedCount = 0;

    for (const raw of allRaw) {
        const result = parseRawProxy(raw);
        if (result.ok) {
            nodes.push(result.node);
        } else if (result.reason === 'unsupported') {
            warnings.addProtocolUnsupported(result.tag, result.type);
            skippedCount++;
        } else {
            warnings.addFieldMissing(result.tag, result.fields);
            skippedCount++;
        }
    }

    const convertedCount = nodes.length;

    // ─── 步骤 3：Group（识别国家，原地赋值 countryCode）──────────────────────
    const countryMap = groupByCountry(nodes);

    // ─── 步骤 4：Convert（SubBridgeNode → SingBoxOutbound）──────────────────
    const outbounds = nodes.map((n) => nodeToOutbound(n));

    // ─── 步骤 5：Load（模板）───────────────────────────────────────────────────
    const template = loadTemplate(options.templatePath);

    // ─── 步骤 6：Inject（占位符替换）─────────────────────────────────────────
    const finalConfig = injectIntoTemplate(template, { outbounds, countryMap });

    // ─── 步骤 7：Validate + Output ────────────────────────────────────────────
    const danglingRefs = validateOutboundRefs(finalConfig);

    if (danglingRefs.length > 0) {
        warnings.addValidationWarning(`outbound 引用未闭合: ${danglingRefs.join(', ')}`);
    }

    const output = JSON.stringify(finalConfig, null, 2);

    if (options.outputPath) {
        writeFileSync(options.outputPath, output, 'utf-8');
    }

    return {
        output,
        convertedCount,
        skippedCount,
        warnings,
        danglingRefs,
    };
}
