import { describe, test, expect } from 'bun:test';
import { serveCommand } from '../../src/cli/commands/serve';

describe('serveCommand', () => {
    test('命令名称为 serve', () => {
        const cmd = serveCommand();
        expect(cmd.name()).toBe('serve');
    });

    test('有 --port 选项，默认值为 "9898"', () => {
        const cmd = serveCommand();
        const portOpt = cmd.options.find((o) => o.long === '--port');
        expect(portOpt).toBeDefined();
        expect(portOpt?.defaultValue).toBe('9898');
    });

    test('有 --no-open 选项', () => {
        const cmd = serveCommand();
        // commander 中 --no-xxx 选项的 long 为 '--no-open'
        const openOpt = cmd.options.find((o) => o.long === '--no-open');
        expect(openOpt).toBeDefined();
    });

    test('description 非空', () => {
        const cmd = serveCommand();
        expect(cmd.description()).toBeTruthy();
    });
});
