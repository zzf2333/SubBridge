import { chmodSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, test } from 'bun:test';
import { runProxySmoke } from '../../src/utils/proxy-smoke';

describe('runProxySmoke', () => {
    test('parses successful smoke output details', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-smoke-'));
        const script = join(dir, 'proxy-smoke.sh');
        writeFileSync(
            script,
            `#!/bin/sh
echo "gstatic generate_204 -> 204"
echo "youtube homepage -> 200"
echo "egress ip -> 127.0.0.1"
echo "route log  -> matched YouTube route"
`,
            'utf-8'
        );
        chmodSync(script, 0o755);

        const result = await runProxySmoke({
            configPath: '/tmp/test.json',
            scriptPath: script,
        });

        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.details).toEqual({
            gstatic: '204',
            youtube: '200',
            egressIp: '127.0.0.1',
            routeLog: 'matched YouTube route',
        });
    });

    test('surfaces failure output as errors', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'subbridge-smoke-'));
        const script = join(dir, 'proxy-smoke.sh');
        writeFileSync(
            script,
            `#!/bin/sh
echo "gstatic generate_204 -> 000"
echo "gstatic probe failed." >&2
exit 1
`,
            'utf-8'
        );
        chmodSync(script, 0o755);

        const result = await runProxySmoke({
            configPath: '/tmp/test.json',
            scriptPath: script,
        });

        expect(result.success).toBe(false);
        expect(result.errors).toContain('gstatic probe failed.');
        expect(result.details.gstatic).toBe('000');
    });
});
