import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runPipeline } from '@/core/build/pipeline';

// ─── Fixture YAML ─────────────────────────────────────────────────────────────

const fixtureYaml = `
proxies:
  - name: "HK-Test-01"
    type: ss
    server: 1.2.3.4
    port: 443
    cipher: aes-256-gcm
    password: testpass
  - name: "JP-Test-01"
    type: vmess
    server: 5.6.7.8
    port: 8080
    uuid: 00000000-0000-0000-0000-000000000001
    alterId: 0
    cipher: auto
`;

const fixtureYamlWithUnknown = `
proxies:
  - name: "HK-Test-01"
    type: ss
    server: 1.2.3.4
    port: 443
    cipher: aes-256-gcm
    password: testpass
  - name: "JP-Test-01"
    type: vmess
    server: 5.6.7.8
    port: 8080
    uuid: 00000000-0000-0000-0000-000000000001
    alterId: 0
    cipher: auto
  - name: "Unknown-Protocol-01"
    type: wireguard
    server: 9.10.11.12
    port: 51820
`;

const minimalCustomTemplate = JSON.stringify({
    outbounds: [
        { '$subbridge': 'nodes' },
        { type: 'direct', tag: 'direct' },
    ],
    route: { final: 'direct' },
});

// ─── 测试辅助 ─────────────────────────────────────────────────────────────────

let tmpDir: string;
let fixtureFile: string;
let fixtureFileWithUnknown: string;
let customTemplateFile: string;

beforeEach(() => {
    tmpDir = join(tmpdir(), `subbridge-pipeline-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    fixtureFile = join(tmpDir, 'fixture.yaml');
    writeFileSync(fixtureFile, fixtureYaml, 'utf-8');

    fixtureFileWithUnknown = join(tmpDir, 'fixture-unknown.yaml');
    writeFileSync(fixtureFileWithUnknown, fixtureYamlWithUnknown, 'utf-8');

    customTemplateFile = join(tmpDir, 'custom-template.json');
    writeFileSync(customTemplateFile, minimalCustomTemplate, 'utf-8');
});

afterEach(() => {
    // 清理临时文件
    const files = [fixtureFile, fixtureFileWithUnknown, customTemplateFile];
    for (const f of files) {
        try { unlinkSync(f); } catch {}
    }
    try { rmdirSync(tmpDir, { recursive: true }); } catch {}
});

// ─── 测试场景 ─────────────────────────────────────────────────────────────────

describe('runPipeline', () => {
    test('基础流水线：fixture YAML 文件输入 → 转换成功', async () => {
        const result = await runPipeline({ inputs: [fixtureFile] });

        expect(result.convertedCount).toBe(2);
        expect(result.skippedCount).toBe(0);
        expect(result.danglingRefs).toHaveLength(0);
    });

    test('默认模板：输出包含节点 tag 在 outbounds 数组中', async () => {
        const result = await runPipeline({ inputs: [fixtureFile] });

        const config = JSON.parse(result.output) as Record<string, unknown>;
        const outbounds = config['outbounds'] as Array<Record<string, unknown>>;

        expect(Array.isArray(outbounds)).toBe(true);

        const tags = outbounds.map((o) => o['tag']);
        expect(tags).toContain('HK-Test-01');
        expect(tags).toContain('JP-Test-01');
    });

    test('自定义模板：传入 templatePath，输出基于自定义模板', async () => {
        const result = await runPipeline({
            inputs: [fixtureFile],
            templatePath: customTemplateFile,
        });

        const config = JSON.parse(result.output) as Record<string, unknown>;
        const outbounds = config['outbounds'] as Array<Record<string, unknown>>;

        // 自定义模板只有 direct 和节点，不含 dns-out 等
        const tags = outbounds.map((o) => o['tag']);
        expect(tags).toContain('direct');
        expect(tags).toContain('HK-Test-01');
        expect(tags).toContain('JP-Test-01');

        // 自定义模板不含 tun inbound，配置中不应有 inbounds 字段（或为空）
        const inbounds = config['inbounds'];
        expect(inbounds).toBeUndefined();
    });

    test('URL 输入 + mock fetcher：验证订阅 URL 流程', async () => {
        const mockFetcher = async (_url: string, _timeoutMs: number): Promise<string> => {
            return fixtureYaml;
        };

        const result = await runPipeline({
            inputs: ['https://example.com/sub'],
            fetcher: mockFetcher,
        });

        expect(result.convertedCount).toBe(2);
        expect(result.skippedCount).toBe(0);

        const config = JSON.parse(result.output) as Record<string, unknown>;
        const outbounds = config['outbounds'] as Array<Record<string, unknown>>;
        const tags = outbounds.map((o) => o['tag']);
        expect(tags).toContain('HK-Test-01');
        expect(tags).toContain('JP-Test-01');
    });

    test('无效协议跳过：包含未知类型节点时 skippedCount > 0', async () => {
        const result = await runPipeline({ inputs: [fixtureFileWithUnknown] });

        expect(result.convertedCount).toBe(2);
        expect(result.skippedCount).toBe(1);
        expect(result.warnings.hasWarnings).toBe(true);
    });

    test('输出 JSON 合法：JSON.parse 不抛出且含有 outbounds 字段', async () => {
        const result = await runPipeline({ inputs: [fixtureFile] });

        let config: Record<string, unknown>;
        expect(() => {
            config = JSON.parse(result.output) as Record<string, unknown>;
        }).not.toThrow();

        expect(config!['outbounds']).toBeDefined();
        expect(Array.isArray(config!['outbounds'])).toBe(true);
    });

    test('inlineInputs：内联 YAML 内容，不依赖文件系统', async () => {
        const result = await runPipeline({
            inputs: [],
            inlineInputs: [
                { name: 'test-source', content: fixtureYaml },
            ],
        });

        expect(result.convertedCount).toBe(2);
        const config = JSON.parse(result.output) as Record<string, unknown>;
        const outbounds = config['outbounds'] as Array<Record<string, unknown>>;
        const tags = outbounds.map((o) => o['tag']);
        expect(tags).toContain('HK-Test-01');
        expect(tags).toContain('JP-Test-01');
    });

    test('danglingRefs：模板引用不存在的 outbound tag 时被检测到', async () => {
        const danglingTemplate = join(tmpDir, 'dangling.json');
        writeFileSync(
            danglingTemplate,
            JSON.stringify({
                outbounds: [
                    {
                        type: 'selector',
                        tag: 'proxy',
                        outbounds: ['nonexistent-tag', '$nodes'],
                    },
                    { $subbridge: 'nodes' },
                ],
            }),
            'utf-8'
        );

        const result = await runPipeline({
            inputs: [fixtureFile],
            templatePath: danglingTemplate,
        });

        expect(result.danglingRefs).toContain('nonexistent-tag');
        expect(result.warnings.hasWarnings).toBe(true);
    });

    test('输出到文件：指定 outputPath 时文件被写入', async () => {
        const outputFile = join(tmpDir, 'output.json');

        await runPipeline({
            inputs: [fixtureFile],
            outputPath: outputFile,
        });

        expect(existsSync(outputFile)).toBe(true);

        const { readFileSync } = await import('fs');
        const content = readFileSync(outputFile, 'utf-8');
        const config = JSON.parse(content) as Record<string, unknown>;
        expect(config['outbounds']).toBeDefined();
    });
});
