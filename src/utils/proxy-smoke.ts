import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

export interface ProxySmokeOptions {
    configPath: string;
    proxyUrl?: string;
    binaryPath?: string;
    keepTun?: boolean;
    keepTmp?: boolean;
    probe204Url?: string;
    probePageUrl?: string;
    probeIpUrl?: string;
    scriptPath?: string;
}

export interface ProxySmokeResult {
    success: boolean;
    output: string;
    errors: string[];
    details: {
        gstatic?: string;
        youtube?: string;
        egressIp?: string;
        routeLog?: string;
    };
}

const DEFAULT_SCRIPT_PATH = fileURLToPath(new URL('../../scripts/proxy-smoke.sh', import.meta.url));

export async function runProxySmoke(options: ProxySmokeOptions): Promise<ProxySmokeResult> {
    const args = ['-c', options.configPath];
    const proxyUrl = options.proxyUrl ?? 'http://127.0.0.1:7893';
    const binaryPath = options.binaryPath ?? 'sing-box';

    args.push('-p', proxyUrl, '-b', binaryPath);

    if (options.keepTun) {
        args.push('--keep-tun');
    }
    if (options.keepTmp) {
        args.push('--keep-tmp');
    }
    if (options.probe204Url) {
        args.push('--probe-204-url', options.probe204Url);
    }
    if (options.probePageUrl) {
        args.push('--probe-page-url', options.probePageUrl);
    }
    if (options.probeIpUrl) {
        args.push('--probe-ip-url', options.probeIpUrl);
    }

    const result = await execCommand(options.scriptPath ?? DEFAULT_SCRIPT_PATH, args);
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();

    return {
        success: result.exitCode === 0,
        output,
        errors: collectErrors(result),
        details: parseDetails(output),
    };
}

interface ExecResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

function execCommand(command: string, args: string[]): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args);

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('error', (error) => {
            reject(error);
        });

        proc.on('close', (code) => {
            resolve({
                exitCode: code ?? 0,
                stdout,
                stderr,
            });
        });
    });
}

function collectErrors(result: ExecResult): string[] {
    const combined = [result.stderr, result.stdout].filter(Boolean).join('\n');
    const lines = combined
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    if (result.exitCode === 0) {
        return [];
    }

    return lines.length > 0 ? lines : ['proxy smoke failed'];
}

function parseDetails(output: string): ProxySmokeResult['details'] {
    return {
        gstatic: matchLineValue(output, /^gstatic generate_204 ->\s*(.+)$/m),
        youtube: matchLineValue(output, /^youtube homepage ->\s*(.+)$/m),
        egressIp: matchLineValue(output, /^egress ip ->\s*(.+)$/m),
        routeLog: matchLineValue(output, /^route log\s*->\s*(.+)$/m),
    };
}

function matchLineValue(output: string, pattern: RegExp): string | undefined {
    return output.match(pattern)?.[1]?.trim();
}
