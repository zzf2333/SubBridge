import { spawn, type ChildProcess } from 'child_process';
import { createServer, type Server } from 'http';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { createServer as createNetServer } from 'net';
import { tmpdir } from 'os';
import { basename, join, resolve } from 'path';
import { runConvert } from '../src/cli/commands/convert';
import { runVerify } from '../src/cli/commands/verify';

interface RepresentativeFixture {
    name: string;
    input: string;
    smoke: boolean;
}

const RUNTIME_SERVER_PORTS = {
    ss: 21080,
    vmess: 21443,
    trojan: 22443,
    vless: 23443,
    hysteria2: 24443,
} as const;

const REALITY_PRIVATE_KEY = 'QGW2TBBXzxDsSpfjrgfshAv2lnuGMWw4LtCKs5e79H0';
const REALITY_SHORT_ID = '0123456789abcdef';

const FIXTURES: RepresentativeFixture[] = [
    {
        name: 'ss-baseline',
        input: resolve(process.cwd(), 'tests/fixtures/verification/ss-baseline.yaml'),
        smoke: true,
    },
    {
        name: 'vmess-ws-tls',
        input: resolve(process.cwd(), 'tests/fixtures/verification/vmess-ws-tls.yaml'),
        smoke: true,
    },
    {
        name: 'trojan-tls',
        input: resolve(process.cwd(), 'tests/fixtures/verification/trojan-tls.yaml'),
        smoke: true,
    },
    {
        name: 'vless-reality',
        input: resolve(process.cwd(), 'tests/fixtures/verification/vless-reality.yaml'),
        smoke: true,
    },
    {
        name: 'hysteria2',
        input: resolve(process.cwd(), 'tests/fixtures/verification/hysteria2.yaml'),
        smoke: true,
    },
    {
        name: 'mixed-protocols',
        input: resolve(process.cwd(), 'tests/fixtures/verification/mixed-protocols.yaml'),
        smoke: true,
    },
    {
        name: 'http-structure',
        input: resolve(process.cwd(), 'tests/fixtures/verification/http-structure.yaml'),
        smoke: false,
    },
];

interface RuntimePorts {
    target: number;
    ss: number;
    vmess: number;
    trojan: number;
    vless: number;
    hysteria2: number;
}

export async function runRepresentativeVerification(): Promise<void> {
    const tempDir = mkdtempSync(join(tmpdir(), 'subbridge-verify-fixtures-'));
    let httpServer: Server | undefined;
    let protocolServer: ChildProcess | undefined;

    const cleanup = async () => {
        if (protocolServer && protocolServer.pid) {
            protocolServer.kill('SIGTERM');
            await waitForClose(protocolServer).catch(() => undefined);
        }
        if (httpServer) {
            await new Promise<void>((resolveClose) => httpServer?.close(() => resolveClose()));
        }
    };

    const exitHandler = () => {
        void cleanup();
    };

    process.on('exit', exitHandler);
    process.on('SIGINT', exitHandler);
    process.on('SIGTERM', exitHandler);

    try {
        const ports = await allocateRuntimePorts();
        httpServer = await startTargetServer(ports.target);
        protocolServer = await startProtocolServer(tempDir, ports);

        const probe204Url = `http://127.0.0.1:${ports.target}/generate_204`;
        const probePageUrl = `http://127.0.0.1:${ports.target}/youtube`;
        const probeIpUrl = `http://127.0.0.1:${ports.target}/ip`;

        for (const fixture of FIXTURES) {
            const runtimeInput = rewriteFixtureForRuntime(fixture.input, tempDir, ports);
            const output = join(tempDir, `${fixture.name}.json`);
            const report = join(tempDir, `${fixture.name}.verify.json`);
            const proxyPort = await allocatePort();

            console.log(`\n[fixture] ${fixture.name}`);
            await runConvert({
                input: runtimeInput,
                output,
                pretty: true,
                reportMode: 'none',
            });
            await runVerify({
                input: output,
                report,
                smoke: fixture.smoke,
                proxy: `http://127.0.0.1:${proxyPort}`,
                bin: 'sing-box',
                probe204Url,
                probePageUrl,
                probeIpUrl,
            });
        }

        console.log('\nRepresentative fixture verification passed.');
    } finally {
        process.off('exit', exitHandler);
        process.off('SIGINT', exitHandler);
        process.off('SIGTERM', exitHandler);
        await cleanup();
    }
}

async function startTargetServer(targetPort: number): Promise<Server> {
    const server = createServer((req, res) => {
        if (req.url === '/generate_204') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.url === '/youtube') {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end('<html><body>ok</body></html>');
            return;
        }

        if (req.url === '/ip') {
            res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('127.0.0.1');
            return;
        }

        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
    });

    await new Promise<void>((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(targetPort, '127.0.0.1', () => {
            server.off('error', rejectListen);
            resolveListen();
        });
    });

    return server;
}

async function startProtocolServer(tempDir: string, ports: RuntimePorts): Promise<ChildProcess> {
    const configPath = join(tempDir, 'runtime-server.json');
    const logPath = join(tempDir, 'runtime-server.log');
    writeFileSync(configPath, JSON.stringify(buildRuntimeServerConfig(ports), null, 2), 'utf-8');

    const serverLog: string[] = [];
    const proc = spawn('sing-box', ['run', '-c', configPath]);
    proc.stdout?.on('data', (chunk) => {
        serverLog.push(chunk.toString());
    });
    proc.stderr?.on('data', (chunk) => {
        serverLog.push(chunk.toString());
    });

    await wait(1_000);
    if (proc.exitCode !== null) {
        writeFileSync(logPath, serverLog.join(''), 'utf-8');
        throw new Error(`runtime protocol server failed to start, see ${logPath}`);
    }

    return proc;
}

function buildRuntimeServerConfig(ports: RuntimePorts) {
    const certPath = resolve(process.cwd(), 'tests/fixtures/runtime/runtime-cert.pem');
    const keyPath = resolve(process.cwd(), 'tests/fixtures/runtime/runtime-key.pem');

    return {
        log: { level: 'warn' },
        inbounds: [
            {
                type: 'shadowsocks',
                tag: 'ss-in',
                listen: '127.0.0.1',
                listen_port: ports.ss,
                method: 'aes-256-gcm',
                password: 'ss-password',
            },
            {
                type: 'vmess',
                tag: 'vmess-in',
                listen: '127.0.0.1',
                listen_port: ports.vmess,
                users: [{ uuid: '12345678-1234-1234-1234-123456789012' }],
                tls: {
                    enabled: true,
                    certificate_path: certPath,
                    key_path: keyPath,
                },
                transport: {
                    type: 'ws',
                    path: '/vmess-ws',
                },
            },
            {
                type: 'trojan',
                tag: 'trojan-in',
                listen: '127.0.0.1',
                listen_port: ports.trojan,
                users: [{ password: 'trojan-password' }],
                tls: {
                    enabled: true,
                    certificate_path: certPath,
                    key_path: keyPath,
                },
            },
            {
                type: 'vless',
                tag: 'vless-in',
                listen: '127.0.0.1',
                listen_port: ports.vless,
                users: [
                    {
                        uuid: '87654321-4321-4321-4321-210987654321',
                        flow: 'xtls-rprx-vision',
                    },
                ],
                tls: {
                    enabled: true,
                    server_name: 'runtime.local',
                    reality: {
                        enabled: true,
                        handshake: {
                            server: '127.0.0.1',
                            server_port: ports.trojan,
                        },
                        private_key: REALITY_PRIVATE_KEY,
                        short_id: [REALITY_SHORT_ID],
                    },
                },
            },
            {
                type: 'hysteria2',
                tag: 'hy2-in',
                listen: '127.0.0.1',
                listen_port: ports.hysteria2,
                users: [{ password: 'hy2-password' }],
                obfs: {
                    type: 'salamander',
                    password: 'hy2-obfs-password',
                },
                tls: {
                    enabled: true,
                    certificate_path: certPath,
                    key_path: keyPath,
                },
            },
        ],
        outbounds: [{ type: 'direct', tag: 'direct' }],
    };
}

async function allocateRuntimePorts(): Promise<RuntimePorts> {
    return {
        target: await allocatePort(),
        ss: await allocatePort(),
        vmess: await allocatePort(),
        trojan: await allocatePort(),
        vless: await allocatePort(),
        hysteria2: await allocatePort(),
    };
}

async function allocatePort(): Promise<number> {
    return await new Promise<number>((resolvePort, rejectPort) => {
        const server = createNetServer();
        server.once('error', rejectPort);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close(() => rejectPort(new Error('failed to allocate local port')));
                return;
            }

            const port = address.port;
            server.close((error) => {
                if (error) {
                    rejectPort(error);
                    return;
                }
                resolvePort(port);
            });
        });
    });
}

function rewriteFixtureForRuntime(sourcePath: string, tempDir: string, ports: RuntimePorts): string {
    const fixtureContent = readFileSync(sourcePath, 'utf-8');
    const rewritten = fixtureContent
        .replaceAll(`port: ${RUNTIME_SERVER_PORTS.ss}`, `port: ${ports.ss}`)
        .replaceAll(`port: ${RUNTIME_SERVER_PORTS.vmess}`, `port: ${ports.vmess}`)
        .replaceAll(`port: ${RUNTIME_SERVER_PORTS.trojan}`, `port: ${ports.trojan}`)
        .replaceAll(`port: ${RUNTIME_SERVER_PORTS.vless}`, `port: ${ports.vless}`)
        .replaceAll(`port: ${RUNTIME_SERVER_PORTS.hysteria2}`, `port: ${ports.hysteria2}`)
        .replaceAll(
            'http://127.0.0.1:18080/generate_204',
            `http://127.0.0.1:${ports.target}/generate_204`
        );
    const outputPath = join(tempDir, `runtime-${fixtureNameFromPath(sourcePath)}`);
    writeFileSync(outputPath, rewritten, 'utf-8');
    return outputPath;
}

function fixtureNameFromPath(path: string): string {
    return basename(path);
}

function wait(ms: number): Promise<void> {
    return new Promise((resolveWait) => {
        setTimeout(resolveWait, ms);
    });
}

function waitForClose(proc: ChildProcess): Promise<void> {
    return new Promise((resolveClose) => {
        proc.once('close', () => resolveClose());
    });
}

if (import.meta.main) {
    await runRepresentativeVerification();
}
