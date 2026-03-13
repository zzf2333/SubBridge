interface PackageJsonLike {
    description?: string;
    keywords?: unknown;
}

export interface SeoAuditInput {
    readme: string;
    docsIndex: string;
    topicDoc: string;
    webIndex: string;
    packageJson: PackageJsonLike;
}

const README_REQUIRED_PHRASES = [
    'Clash 转 sing-box',
    'Clash 订阅转换',
    'Clash 配置迁移',
    'Clash.Meta YAML',
    'sing-box 配置',
];

const PACKAGE_KEYWORDS = [
    'clash',
    'clash-meta',
    'sing-box',
    'clash-to-sing-box',
    'subscription-converter',
    'sing-box-config',
];

const TOPIC_DOC_PATH = './docs/how-to-convert-clash-to-sing-box.md';

function normalizeKeywords(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function auditSeoContent(input: SeoAuditInput): string[] {
    const errors: string[] = [];
    const readmeIntro = input.readme.split(/\r?\n/).slice(0, 40).join('\n');

    for (const phrase of README_REQUIRED_PHRASES) {
        if (!readmeIntro.includes(phrase)) {
            errors.push(`README 首屏缺少核心关键词：${phrase}`);
        }
    }

    if (!input.readme.includes(TOPIC_DOC_PATH)) {
        errors.push(`README 缺少专题文档入口：${TOPIC_DOC_PATH}`);
    }

    if (!input.docsIndex.includes('how-to-convert-clash-to-sing-box.md')) {
        errors.push('文档索引缺少专题文档条目：how-to-convert-clash-to-sing-box.md');
    }

    if (!input.topicDoc.includes('# 如何将 Clash / Clash.Meta YAML 转换为 sing-box 配置')) {
        errors.push('专题文档缺少标准标题');
    }

    if (!input.topicDoc.includes('subbridge convert')) {
        errors.push('专题文档缺少 CLI 使用命令示例');
    }

    if (!input.topicDoc.includes('verify')) {
        errors.push('专题文档缺少 verify 验证说明');
    }

    const description = input.packageJson.description || '';
    if (!description.includes('Clash / Clash.Meta YAML') || !description.includes('sing-box')) {
        errors.push('package.json description 需要明确包含 Clash / Clash.Meta YAML 和 sing-box');
    }

    const keywords = normalizeKeywords(input.packageJson.keywords);
    for (const keyword of PACKAGE_KEYWORDS) {
        if (!keywords.includes(keyword)) {
            errors.push(`package.json keywords 缺少：${keyword}`);
        }
    }

    if (
        !input.webIndex.includes('Clash / Clash.Meta YAML to sing-box Converter')
        && !input.webIndex.includes('APP_TAGLINE')
    ) {
        errors.push('Web 首页缺少统一副标题：Clash / Clash.Meta YAML to sing-box Converter');
    }

    if (!input.webIndex.includes('Clash 转 sing-box')) {
        errors.push('Web 首页缺少中文搜索词：Clash 转 sing-box');
    }

    return errors;
}
