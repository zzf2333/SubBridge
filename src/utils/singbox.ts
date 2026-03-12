// sing-box CLI utility functions
// 提供与 sing-box 命令行工具交互的功能

import { spawn } from 'child_process';

/**
 * Result of sing-box check command
 */
export interface CheckResult {
    success: boolean;
    output: string;
    errors: string[];
}

/**
 * Check if sing-box is installed on the system
 * @returns Promise<boolean> - true if sing-box is installed
 */
export async function isSingboxInstalled(): Promise<boolean> {
    try {
        const result = await execCommand('sing-box', ['version']);
        return result.exitCode === 0;
    } catch {
        return false;
    }
}

/**
 * Get sing-box version
 * @returns Promise<string | null> - version string or null if not installed
 */
export async function getSingboxVersion(): Promise<string | null> {
    try {
        const result = await execCommand('sing-box', ['version']);
        if (result.exitCode === 0 && result.stdout) {
            // Extract version from first line
            const firstLine = result.stdout.split('\n')[0];
            return firstLine.trim();
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Run sing-box check command to validate configuration
 * @param configPath - path to configuration file
 * @returns Promise<CheckResult> - validation result
 */
export async function checkConfig(configPath: string): Promise<CheckResult> {
    try {
        const result = await execCommand('sing-box', ['check', '-c', configPath]);

        const errors: string[] = [];
        const output = result.stderr || result.stdout || '';

        // Parse errors from stderr
        if (result.stderr) {
            const lines = result.stderr.split('\n').filter((line) => line.trim());
            for (const line of lines) {
                // Extract error messages (remove ANSI codes and log level)
                // eslint-disable-next-line no-control-regex
                const cleaned = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
                if (cleaned) {
                    errors.push(cleaned);
                }
            }
        }

        return {
            success: result.exitCode === 0,
            output,
            errors,
        };
    } catch (error) {
        return {
            success: false,
            output: '',
            errors: [(error as Error).message],
        };
    }
}

/**
 * Run sing-box format command to format configuration
 * @param configPath - path to configuration file
 * @returns Promise<string> - formatted configuration or empty string on error
 */
export async function formatConfig(configPath: string): Promise<string> {
    try {
        const result = await execCommand('sing-box', ['format', '-c', configPath]);
        if (result.exitCode === 0) {
            return result.stdout || '';
        }
        return '';
    } catch {
        return '';
    }
}

/**
 * Execute a command and return the result
 */
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
                exitCode: code || 0,
                stdout,
                stderr,
            });
        });
    });
}
