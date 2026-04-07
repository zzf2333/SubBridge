import { describe, test, expect, afterEach } from 'bun:test';
import { WarningCollector } from '@/core/observe/warnings';

// ─── 辅助：临时捕获 stderr 输出 ───────────────────────────────────────────────

function captureStderr(fn: () => void): string {
    let output = '';
    const origWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as unknown as { write: (s: string) => boolean }).write = (s: string) => {
        output += s;
        return true;
    };
    fn();
    (process.stderr as unknown as { write: typeof origWrite }).write = origWrite;
    return output;
}

// ─── hasWarnings ─────────────────────────────────────────────────────────────

describe('WarningCollector.hasWarnings', () => {
    test('初始状态为 false', () => {
        expect(new WarningCollector().hasWarnings).toBe(false);
    });

    test('addProtocolUnsupported → true', () => {
        const c = new WarningCollector();
        c.addProtocolUnsupported('NodeA', 'wireguard');
        expect(c.hasWarnings).toBe(true);
    });

    test('addFieldMissing → true', () => {
        const c = new WarningCollector();
        c.addFieldMissing('NodeB', ['server', 'port']);
        expect(c.hasWarnings).toBe(true);
    });

    test('addFetchFailed → true', () => {
        const c = new WarningCollector();
        c.addFetchFailed('https://sub.example.com', 'timeout');
        expect(c.hasWarnings).toBe(true);
    });

    test('addValidationWarning → true', () => {
        const c = new WarningCollector();
        c.addValidationWarning('outbound 引用未闭合: proxy');
        expect(c.hasWarnings).toBe(true);
    });
});

// ─── printToStderr ────────────────────────────────────────────────────────────

describe('WarningCollector.printToStderr', () => {
    test('无警告时输出统计行（跳过 0 个）', () => {
        const c = new WarningCollector();
        const out = captureStderr(() => c.printToStderr(10));
        expect(out).toContain('已转换 10 个节点，跳过 0 个');
    });

    test('输出协议不支持行', () => {
        const c = new WarningCollector();
        c.addProtocolUnsupported('NodeA', 'wireguard');
        const out = captureStderr(() => c.printToStderr(3));
        expect(out).toContain('"NodeA" 协议不支持: wireguard');
    });

    test('输出缺失字段行（多字段用逗号分隔）', () => {
        const c = new WarningCollector();
        c.addFieldMissing('NodeB', ['uuid', 'server']);
        const out = captureStderr(() => c.printToStderr(0));
        expect(out).toContain('"NodeB" 缺失字段: uuid, server');
    });

    test('输出拉取失败行', () => {
        const c = new WarningCollector();
        c.addFetchFailed('https://sub.example.com', 'timeout');
        const out = captureStderr(() => c.printToStderr(0));
        expect(out).toContain('订阅源 https://sub.example.com 拉取失败: timeout');
    });

    test('跳过数量 = protocolUnsupported + fieldMissing 之和', () => {
        const c = new WarningCollector();
        c.addProtocolUnsupported('A', 'wireguard');
        c.addFieldMissing('B', ['uuid']);
        c.addFieldMissing('C', ['server']);
        const out = captureStderr(() => c.printToStderr(5));
        expect(out).toContain('已转换 5 个节点，跳过 3 个');
    });

    test('多条警告全部出现在输出中', () => {
        const c = new WarningCollector();
        c.addProtocolUnsupported('A', 'wireguard');
        c.addFieldMissing('B', ['uuid']);
        c.addFetchFailed('https://sub.example.com', 'network error');
        c.addValidationWarning('outbound 引用未闭合: proxy');

        const out = captureStderr(() => c.printToStderr(2));
        expect(out).toContain('"A" 协议不支持: wireguard');
        expect(out).toContain('"B" 缺失字段: uuid');
        expect(out).toContain('订阅源 https://sub.example.com 拉取失败: network error');
        expect(out).toContain('验证警告');
    });
});
