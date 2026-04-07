import { Command } from 'commander';
import { runPipeline } from '@/core/build/pipeline';

export function buildCommand(): Command {
    return new Command('build')
        .description('从 Clash 配置/订阅 URL 提取节点，注入到 sing-box 模板中')
        .requiredOption('-i, --input <sources...>', '输入源（Clash 文件路径或订阅 URL，可多次指定）')
        .option('-t, --template <path>', '自定义模板路径（不指定时使用内置默认模板）')
        .option('-o, --output <path>', '输出文件路径（不指定时输出到 stdout）')
        .option('--force', '强制刷新订阅缓存')
        .option('--cache-dir <dir>', '订阅缓存目录')
        .action(async (options) => {
            const { input, template, output, force, cacheDir } = options;

            try {
                const result = await runPipeline({
                    inputs: Array.isArray(input) ? input : [input],
                    templatePath: template,
                    outputPath: output,
                    forceRefresh: force,
                    cacheDir,
                    cwd: process.cwd(),
                });

                result.warnings.printToStderr(result.convertedCount);

                if (result.convertedCount === 0) {
                    process.stderr.write('[SubBridge] 警告：未转换任何节点，请检查输入源\n');
                }

                if (result.danglingRefs.length > 0) {
                    process.stderr.write(
                        `[SubBridge] 警告：${result.danglingRefs.length} 个 outbound 引用未闭合\n`
                    );
                }

                if (output) {
                    process.stdout.write(`[SubBridge] 已写出到 ${output}\n`);
                } else {
                    // 未指定 -o 时输出到 stdout（适合管道使用）
                    process.stdout.write(result.output + '\n');
                }
            } catch (e) {
                process.stderr.write(`[SubBridge] 错误：${(e as Error).message}\n`);
                process.exit(1);
            }
        });
}
