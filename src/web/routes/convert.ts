import { Hono } from 'hono';
import { runPipeline } from '../../core/build/pipeline';
import { validateSingboxConfig } from '../../core/validator/index';
import { assertSafeRemoteUrlWithDns } from '../../utils/url-safety';

const app = new Hono();

interface ConvertBody {
    source: string;
    sourceType?: 'yaml' | 'url';
    validate?: boolean;
}

app.post('/', async (c) => {
    let body: ConvertBody;
    try {
        body = await c.req.json<ConvertBody>();
    } catch {
        return c.json({ success: false, error: 'Invalid JSON body' }, 400);
    }

    if (!body.source) {
        return c.json({ success: false, error: 'Missing required field: source' }, 400);
    }

    if (body.sourceType === 'url') {
        // URL 模式：先做 SSRF 检查，再通过 pipeline 的 inputs 拉取
        try {
            await assertSafeRemoteUrlWithDns(body.source, { allowDataUrl: true });
        } catch (e) {
            return c.json({ success: false, error: (e as Error).message }, 400);
        }

        try {
            const result = await runPipeline({
                inputs: [body.source],
                validateUrl: (url) => assertSafeRemoteUrlWithDns(url, { allowDataUrl: true }),
            });

            const config = JSON.parse(result.output) as Record<string, unknown>;

            const validationPayload =
                body.validate === true ? validateSingboxConfig(config as never) : undefined;

            return c.json({
                success: true,
                convertedCount: result.convertedCount,
                skippedCount: result.skippedCount,
                config,
                validation: validationPayload,
                danglingRefs: result.danglingRefs.length > 0 ? result.danglingRefs : undefined,
            });
        } catch (e) {
            return c.json({ success: false, error: (e as Error).message }, 500);
        }
    }

    // YAML 文本模式（默认）：将 source 视为内联 YAML 内容，不走文件系统
    try {
        const result = await runPipeline({
            inputs: [],
            inlineInputs: [{ name: 'inline', content: body.source }],
        });

        const config = JSON.parse(result.output) as Record<string, unknown>;

        const validationPayload =
            body.validate === true ? validateSingboxConfig(config as never) : undefined;

        return c.json({
            success: true,
            convertedCount: result.convertedCount,
            skippedCount: result.skippedCount,
            config,
            validation: validationPayload,
            danglingRefs: result.danglingRefs.length > 0 ? result.danglingRefs : undefined,
        });
    } catch (e) {
        return c.json({ success: false, error: (e as Error).message }, 500);
    }
});

export default app;
