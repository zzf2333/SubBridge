import { Hono } from 'hono';
import { runPipeline } from '../../core/build/pipeline';
import { assertSafeRemoteUrlWithDns } from '../../utils/url-safety';

const app = new Hono();

// GET /api/subscribe?url=<clash-url>
// Returns sing-box JSON config directly (usable as a subscription source)
app.get('/', async (c) => {
    const url = c.req.query('url');
    if (!url) {
        return c.json({ success: false, error: 'Missing required query param: url' }, 400);
    }

    try {
        await assertSafeRemoteUrlWithDns(url, { allowDataUrl: true });
    } catch (e) {
        return c.json({ success: false, error: (e as Error).message }, 400);
    }

    try {
        const result = await runPipeline({
            inputs: [url],
            validateUrl: (u) => assertSafeRemoteUrlWithDns(u, { allowDataUrl: true }),
        });

        const config = JSON.parse(result.output) as Record<string, unknown>;

        // Return raw JSON for direct use as sing-box subscription
        return c.body(JSON.stringify(config), 200, {
            'Content-Type': 'application/json',
        });
    } catch (e) {
        return c.json(
            {
                success: false,
                error: (e as Error).message,
            },
            422
        );
    }
});

export default app;
