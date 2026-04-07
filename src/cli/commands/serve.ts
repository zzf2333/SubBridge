import { Command } from 'commander';
import { createWebApp } from '../../web/app';

/**
 * serve 命令：在本机启动 SubBridge Web UI。
 *
 * 所有数据在本地处理，订阅 URL 不经过第三方服务器。
 * 适合不熟悉命令行的用户，或需要偶尔转换配置的场景。
 */
export function serveCommand(): Command {
    return new Command('serve')
        .description('在本机启动 Web UI（订阅 URL 不离开本机）')
        .option('-p, --port <number>', '监听端口', '9898')
        .option('--no-open', '不自动在浏览器中打开')
        .action(async (options: { port: string; open: boolean }) => {
            const port = parseInt(options.port, 10);
            if (isNaN(port) || port < 1 || port > 65535) {
                process.stderr.write('[SubBridge] 错误：端口号不合法\n');
                process.exit(1);
            }

            const app = createWebApp();

            try {
                // Node.js 环境：使用 @hono/node-server
                const { serve } = await import('@hono/node-server');
                const server = serve({ fetch: app.fetch, port });

                // @hono/node-server 的 serve 返回 Node.js http.Server
                // 通过 listening 事件获取实际绑定的端口
                server.on('listening', () => {
                    const addr = server.address();
                    const actualPort = typeof addr === 'object' && addr ? addr.port : port;
                    const url = `http://localhost:${actualPort}`;
                    process.stdout.write(`[SubBridge] 本地 Web UI 已启动：${url}\n`);
                    process.stdout.write('[SubBridge] 按 Ctrl+C 停止\n');
                    if (options.open) {
                        openBrowser(url);
                    }
                });

                server.on('error', (e: NodeJS.ErrnoException) => {
                    if (e.code === 'EADDRINUSE') {
                        process.stderr.write(`[SubBridge] 错误：端口 ${port} 已被占用，请用 --port 指定其他端口\n`);
                    } else {
                        process.stderr.write(`[SubBridge] 服务器错误：${e.message}\n`);
                    }
                    process.exit(1);
                });
            } catch {
                // Bun 环境：直接使用 Bun.serve
                try {
                    // @ts-expect-error Bun 全局 API
                    const server = Bun.serve({ port, fetch: app.fetch });
                    const url = `http://localhost:${server.port}`;
                    process.stdout.write(`[SubBridge] 本地 Web UI 已启动：${url}\n`);
                    process.stdout.write('[SubBridge] 按 Ctrl+C 停止\n');
                    if (options.open) {
                        openBrowser(url);
                    }
                } catch (bunErr) {
                    process.stderr.write(`[SubBridge] 启动失败：${(bunErr as Error).message}\n`);
                    process.exit(1);
                }
            }
        });
}

function openBrowser(url: string): void {
    const platform = process.platform;
    const cmd =
        platform === 'darwin' ? `open "${url}"` :
        platform === 'win32'  ? `start "" "${url}"` :
        `xdg-open "${url}"`;

    import('child_process')
        .then(({ exec }) => exec(cmd))
        .catch(() => { /* 打开浏览器失败时静默忽略 */ });
}
