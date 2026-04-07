import { describe, test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadTemplate } from '@/core/template/loader';

describe('loadTemplate', () => {
    test('不传 templatePath：加载内置默认模板，返回含 outbounds 的对象', () => {
        const tpl = loadTemplate();
        expect(typeof tpl).toBe('object');
        expect(Array.isArray(tpl)).toBe(false);
        expect(tpl['outbounds']).toBeDefined();
    });

    test('传入有效外部模板：返回对应对象', () => {
        const dir = mkdtempSync(join(tmpdir(), 'loader-test-'));
        const tplPath = join(dir, 'template.json');
        const customTpl = { outbounds: [{ type: 'direct', tag: 'direct' }], customKey: true };
        writeFileSync(tplPath, JSON.stringify(customTpl), 'utf-8');

        const tpl = loadTemplate(tplPath);
        expect(tpl['customKey']).toBe(true);
        expect(tpl['outbounds']).toBeDefined();
    });

    test('模板为 JSON 数组时抛出格式错误', () => {
        const dir = mkdtempSync(join(tmpdir(), 'loader-test-'));
        const tplPath = join(dir, 'array.json');
        writeFileSync(tplPath, '[]', 'utf-8');

        expect(() => loadTemplate(tplPath)).toThrow('模板文件格式不合法');
    });

    test('模板为 null 时抛出错误', () => {
        const dir = mkdtempSync(join(tmpdir(), 'loader-test-'));
        const tplPath = join(dir, 'null.json');
        writeFileSync(tplPath, 'null', 'utf-8');

        expect(() => loadTemplate(tplPath)).toThrow();
    });

    test('模板 JSON 语法不合法时抛出错误', () => {
        const dir = mkdtempSync(join(tmpdir(), 'loader-test-'));
        const tplPath = join(dir, 'bad.json');
        writeFileSync(tplPath, '{ not valid json }', 'utf-8');

        expect(() => loadTemplate(tplPath)).toThrow();
    });

    test('模板文件不存在时抛出错误', () => {
        expect(() => loadTemplate('/nonexistent/path/no-such-template.json')).toThrow();
    });
});
