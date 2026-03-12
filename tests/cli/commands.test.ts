import { describe, test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runConvert } from '../../src/cli/commands/convert';
import { runValidate } from '../../src/cli/commands/validate';

const SAMPLE_YAML = `
proxies:
  - name: test-ss
    type: ss
    server: example.com
    port: 8388
    cipher: aes-256-gcm
    password: testpass
`;

function patchExit(): () => void {
    const original = process.exit;
    (process as never).exit = ((code?: number) => {
        throw new Error(`EXIT:${code ?? 0}`);
    }) as never;

    return () => {
        (process as never).exit = original as never;
    };
}

describe('CLI Convert Command', () => {
    test('converts input file and writes output JSON', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'in.yaml');
        const output = join(dir, 'out.json');
        writeFileSync(input, SAMPLE_YAML, 'utf-8');

        await runConvert({ input, output, pretty: true });

        const content = readFileSync(output, 'utf-8');
        const json = JSON.parse(content);
        expect(json.outbounds).toBeDefined();
    });

    test('writes migration report when --report is provided', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'in.yaml');
        const report = join(dir, 'report.json');
        writeFileSync(input, SAMPLE_YAML, 'utf-8');

        await runConvert({ input, report, pretty: true });

        const content = readFileSync(report, 'utf-8');
        const json = JSON.parse(content);
        expect(json.summary).toBeDefined();
        expect(json.display).toBeDefined();
    });

    test('writes report display when --report-display is provided', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'in.yaml');
        const reportDisplay = join(dir, 'report-display.json');
        writeFileSync(input, SAMPLE_YAML, 'utf-8');

        await runConvert({ input, reportDisplay, pretty: true });

        const content = readFileSync(reportDisplay, 'utf-8');
        const json = JSON.parse(content);
        expect(json.summaryLine).toBeDefined();
        expect(json.highlights).toBeDefined();
    });

    test('writes intermediate artifacts when --artifacts is provided', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'in.yaml');
        const artifacts = join(dir, 'artifacts');
        writeFileSync(input, SAMPLE_YAML, 'utf-8');

        await runConvert({ input, artifacts });

        expect(JSON.parse(readFileSync(join(artifacts, 'normalized.json'), 'utf-8'))).toBeDefined();
        expect(JSON.parse(readFileSync(join(artifacts, 'analysis.json'), 'utf-8'))).toBeDefined();
        expect(JSON.parse(readFileSync(join(artifacts, 'plan.json'), 'utf-8'))).toBeDefined();
    });

    test('prints full report view when --report-mode full is set', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'in.yaml');
        const output = join(dir, 'out.json');
        writeFileSync(input, SAMPLE_YAML, 'utf-8');

        const lines: string[] = [];
        const original = console.log;
        console.log = (...args: unknown[]) => {
            lines.push(args.join(' '));
        };

        try {
            await runConvert({ input, output, reportMode: 'full' });
            expect(lines.join('\n')).toContain('Module summary:');
            expect(lines.join('\n')).toContain('proxy: exact=');
        } finally {
            console.log = original;
        }
    });

    test('aggregates warning output when warning count is high', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'in.yaml');
        const output = join(dir, 'out.json');
        const ipCidr6Rules = Array.from({ length: 60 }, (_, index) =>
            `  - IP-CIDR6,2001:db8:${index}::/64,Proxy,no-resolve`
        ).join('\n');
        const yaml = `
proxies:
  - name: test-ss
    type: ss
    server: example.com
    port: 8388
    cipher: aes-256-gcm
    password: testpass
proxy-groups:
  - name: Proxy
    type: select
    proxies:
      - test-ss
rules:
${ipCidr6Rules}
  - MATCH,Proxy
`;
        writeFileSync(input, yaml, 'utf-8');

        const warningLines: string[] = [];
        const originalWarn = console.warn;
        console.warn = (...args: unknown[]) => {
            warningLines.push(args.join(' '));
        };

        try {
            await runConvert({ input, output, reportMode: 'none' });
            const joined = warningLines.join('\n');
            expect(joined).toContain('grouped summary is shown below');
            expect(joined).toContain('IP-CIDR6 rules are unsupported in V1 and were dropped');
            expect((joined.match(/Unable to parse rule:/g) ?? []).length).toBeLessThanOrEqual(1);
        } finally {
            console.warn = originalWarn;
        }
    });

    test('exits when no input and url are provided', async () => {
        const restore = patchExit();
        try {
            await expect(runConvert({})).rejects.toThrow('EXIT:1');
        } finally {
            restore();
        }
    });

    test('exits when --check is provided without --output', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'in.yaml');
        writeFileSync(input, SAMPLE_YAML, 'utf-8');

        const restore = patchExit();
        try {
            await expect(runConvert({ input, check: true })).rejects.toThrow('EXIT:1');
        } finally {
            restore();
        }
    });

    test('exits when --report-mode value is invalid', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'in.yaml');
        writeFileSync(input, SAMPLE_YAML, 'utf-8');

        const restore = patchExit();
        try {
            await expect(runConvert({ input, reportMode: 'bad-mode' })).rejects.toThrow('EXIT:1');
        } finally {
            restore();
        }
    });

    test('exits when --provider-fetch-timeout value is invalid', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'in.yaml');
        writeFileSync(input, SAMPLE_YAML, 'utf-8');

        const restore = patchExit();
        try {
            await expect(
                runConvert({ input, providerFetchTimeout: 'invalid-ms' })
            ).rejects.toThrow('EXIT:1');
        } finally {
            restore();
        }
    });

    test('exits when --provider-fetch-scope value is invalid', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-cli-'));
        const input = join(dir, 'in.yaml');
        writeFileSync(input, SAMPLE_YAML, 'utf-8');

        const restore = patchExit();
        try {
            await expect(
                runConvert({ input, providerFetchScope: 'bad-scope' })
            ).rejects.toThrow('EXIT:1');
        } finally {
            restore();
        }
    });

});

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
