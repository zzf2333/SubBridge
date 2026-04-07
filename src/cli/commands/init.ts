import { Command } from 'commander';
import { writeFileSync, existsSync } from 'fs';
import defaultTemplate from '../../core/template/default.json';

/**
 * 将内置默认模板写出到用户指定路径。
 * 使用 JSON import 嵌入模板数据，兼容 Node.js（无 import.meta.dir 依赖）。
 */
export function runInit(options: { output: string; force?: boolean }): void {
    const { output, force } = options;

    if (existsSync(output) && !force) {
        process.stderr.write(`[SubBridge] 文件已存在: ${output}，使用 --force 覆盖\n`);
        process.exit(1);
    }

    writeFileSync(output, JSON.stringify(defaultTemplate, null, 4), 'utf-8');
    process.stdout.write(`[SubBridge] 模板已写出到 ${output}\n`);
    process.stdout.write(
        `[SubBridge] 编辑后使用: subbridge build -i clash.yaml -t ${output} -o config.json\n`
    );
}

export function initCommand(): Command {
    return new Command('init')
        .description('将内置默认模板复制到指定路径，供用户自定义后通过 -t 覆写')
        .requiredOption('-o, --output <path>', '输出模板文件路径')
        .option('--force', '覆盖已存在的文件')
        .action((options) => {
            runInit({ output: options.output, force: options.force });
        });
}
