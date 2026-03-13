import { describe, expect, test } from 'bun:test';
import { auditSeoContent } from '../../src/utils/seo-check';

const GOOD_INPUT = {
    readme: `# SubBridge: Clash / Clash.Meta YAML to sing-box Converter

SubBridge 是一个面向 Clash / Clash.Meta YAML 的工具，适合需要做 Clash 转 sing-box、Clash 订阅转换、Clash 配置迁移 的用户，并生成可运行的 sing-box 配置。

更多说明见 ./docs/how-to-convert-clash-to-sing-box.md
`,
    docsIndex: `1. [how-to-convert-clash-to-sing-box.md](./how-to-convert-clash-to-sing-box.md)`,
    topicDoc: `# 如何将 Clash / Clash.Meta YAML 转换为 sing-box 配置

\`\`\`bash
subbridge convert -i clash.yaml -o singbox.json
subbridge verify -i singbox.json
\`\`\`
`,
    webIndex: `<title>SubBridge: Clash / Clash.Meta YAML to sing-box Converter</title>
<p>Clash 转 sing-box</p>`,
    packageJson: {
        description: 'SubBridge: Clash / Clash.Meta YAML to sing-box Converter with verify workflow',
        keywords: [
            'clash',
            'clash-meta',
            'sing-box',
            'clash-to-sing-box',
            'subscription-converter',
            'sing-box-config',
        ],
    },
};

describe('auditSeoContent', () => {
    test('passes when all SEO surfaces are present', () => {
        expect(auditSeoContent(GOOD_INPUT)).toEqual([]);
    });

    test('reports missing README keyword in intro', () => {
        const errors = auditSeoContent({
            ...GOOD_INPUT,
            readme: GOOD_INPUT.readme.replace('Clash 订阅转换、', ''),
        });
        expect(errors).toContain('README 首屏缺少核心关键词：Clash 订阅转换');
    });

    test('reports missing package keyword', () => {
        const errors = auditSeoContent({
            ...GOOD_INPUT,
            packageJson: {
                ...GOOD_INPUT.packageJson,
                keywords: ['clash', 'clash-meta', 'sing-box'],
            },
        });
        expect(errors).toContain('package.json keywords 缺少：clash-to-sing-box');
    });

    test('reports missing topic document link', () => {
        const errors = auditSeoContent({
            ...GOOD_INPUT,
            readme: GOOD_INPUT.readme.replace('./docs/how-to-convert-clash-to-sing-box.md', './docs/other.md'),
        });
        expect(errors).toContain(
            'README 缺少专题文档入口：./docs/how-to-convert-clash-to-sing-box.md'
        );
    });
});
