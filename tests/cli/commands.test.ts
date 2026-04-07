import { describe, test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runValidate } from '../../src/cli/commands/validate';
import { runVerify } from '../../src/cli/commands/verify';
import { runInit } from '../../src/cli/commands/init';
import { buildCommand } from '../../src/cli/commands/build';

function patchExit(): () => void {
    const original = process.exit;
    (process as never).exit = ((code?: number) => {
        throw new Error(`EXIT:${code ?? 0}`);
    }) as never;

    return () => {
        (process as never).exit = original as never;
    };
}

describe('CLI Validate Command', () => {
    test('prints success for valid JSON config', () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'config.json');
        writeFileSync(input, JSON.stringify({}), 'utf-8');

        runValidate({ input });
    });

    test('exits for invalid JSON file', () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'bad.json');
        writeFileSync(input, '{ bad-json }', 'utf-8');

        const restore = patchExit();
        try {
            expect(() => runValidate({ input })).toThrow('EXIT:1');
        } finally {
            restore();
        }
    });

    test('exits for schema-invalid config', () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'bad-shape.json');
        writeFileSync(input, JSON.stringify({ outbounds: 'bad' }), 'utf-8');

        const restore = patchExit();
        try {
            expect(() => runValidate({ input })).toThrow('EXIT:1');
        } finally {
            restore();
        }
    });
});

describe('CLI Verify Command', () => {
    test('writes verification report when all selected checks pass', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'config.json');
        const report = join(dir, 'verify-report.json');
        writeFileSync(input, JSON.stringify({ outbounds: [], route: {} }), 'utf-8');

        const verifyReport = await runVerify(
            {
                input,
                report,
            },
            {
                readText: (path) => readFileSync(path, 'utf-8'),
                writeText: (path, content) => writeFileSync(path, content, 'utf-8'),
                validateSchema: () => ({ valid: true, errors: [] }),
                isSingboxInstalled: async () => true,
                getSingboxVersion: async () => 'sing-box version test',
                checkConfig: async () => ({ success: true, errors: [], output: '' }),
                runProxySmoke: async () => ({
                    success: true,
                    output: '',
                    errors: [],
                    details: {
                        gstatic: '204',
                        youtube: '200',
                        egressIp: '127.0.0.1',
                    },
                }),
            }
        );

        expect(verifyReport.summary.valid).toBe(true);
        expect(JSON.parse(readFileSync(report, 'utf-8'))).toMatchObject({
            summary: {
                valid: true,
            },
            schema: { status: 'passed' },
            singboxCheck: { status: 'passed' },
            proxySmoke: { status: 'passed' },
        });
    });

    test('skips optional checks when disabled', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'config.json');
        writeFileSync(input, JSON.stringify({ outbounds: [], route: {} }), 'utf-8');

        let singboxChecked = false;
        let smokeChecked = false;

        const verifyReport = await runVerify(
            {
                input,
                singboxCheck: false,
                smoke: false,
            },
            {
                readText: (path) => readFileSync(path, 'utf-8'),
                writeText: () => {},
                validateSchema: () => ({ valid: true, errors: [] }),
                isSingboxInstalled: async () => {
                    singboxChecked = true;
                    return true;
                },
                getSingboxVersion: async () => null,
                checkConfig: async () => ({ success: true, errors: [], output: '' }),
                runProxySmoke: async () => {
                    smokeChecked = true;
                    return {
                        success: true,
                        output: '',
                        errors: [],
                        details: {},
                    };
                },
            }
        );

        expect(verifyReport.summary.valid).toBe(true);
        expect(verifyReport.singboxCheck.status).toBe('skipped');
        expect(verifyReport.proxySmoke.status).toBe('skipped');
        expect(singboxChecked).toBe(false);
        expect(smokeChecked).toBe(false);
    });

    test('exits when sing-box is required but unavailable', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'config.json');
        writeFileSync(input, JSON.stringify({ outbounds: [], route: {} }), 'utf-8');

        const restore = patchExit();
        try {
            await expect(
                runVerify(
                    {
                        input,
                    },
                    {
                        readText: (path) => readFileSync(path, 'utf-8'),
                        writeText: () => {},
                        validateSchema: () => ({ valid: true, errors: [] }),
                        isSingboxInstalled: async () => false,
                        getSingboxVersion: async () => null,
                        checkConfig: async () => ({ success: true, errors: [], output: '' }),
                        runProxySmoke: async () => ({
                            success: true,
                            output: '',
                            errors: [],
                            details: {},
                        }),
                    }
                )
            ).rejects.toThrow('EXIT:1');
        } finally {
            restore();
        }
    });
});

// ─── init 命令 ────────────────────────────────────────────────────────────────

describe('CLI Init Command', () => {
    test('成功写出内置模板到指定路径', () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-init-'));
        const output = join(dir, 'my-template.json');

        runInit({ output });

        expect(existsSync(output)).toBe(true);
        const content = readFileSync(output, 'utf-8');
        const parsed = JSON.parse(content);
        expect(typeof parsed).toBe('object');
        expect(Array.isArray(parsed)).toBe(false);
        expect(parsed['outbounds']).toBeDefined();
    });

    test('文件已存在且未传 --force 时退出', () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-init-'));
        const output = join(dir, 'existing.json');
        writeFileSync(output, '{}', 'utf-8');

        const restore = patchExit();
        try {
            expect(() => runInit({ output })).toThrow('EXIT:1');
        } finally {
            restore();
        }
    });

    test('文件已存在且传 --force 时覆盖成功', () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-init-'));
        const output = join(dir, 'existing.json');
        writeFileSync(output, '{"old": true}', 'utf-8');

        runInit({ output, force: true });

        const parsed = JSON.parse(readFileSync(output, 'utf-8'));
        expect(parsed['old']).toBeUndefined();
        expect(parsed['outbounds']).toBeDefined();
    });
});

// ─── build 命令（结构验证）────────────────────────────────────────────────────

describe('CLI Build Command', () => {
    test('命令名称为 build', () => {
        const cmd = buildCommand();
        expect(cmd.name()).toBe('build');
    });

    test('有 -i/--input 选项', () => {
        const cmd = buildCommand();
        const opt = cmd.options.find((o) => o.long === '--input');
        expect(opt).toBeDefined();
    });

    test('-o/--output 为可选（不再是 requiredOption）', () => {
        const cmd = buildCommand();
        const opt = cmd.options.find((o) => o.long === '--output');
        expect(opt).toBeDefined();
        // mandatory 为 false 意味着该选项是可选的
        expect(opt?.mandatory).toBe(false);
    });

    test('有 --force 和 --cache-dir 选项', () => {
        const cmd = buildCommand();
        const opts = cmd.options.map((o) => o.long);
        expect(opts).toContain('--force');
        expect(opts).toContain('--cache-dir');
    });
});
