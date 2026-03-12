import { Hono } from 'hono';
import { migrateClashConfigWithProviderFetch } from '../../core/index';
import type { ProviderRefreshSummary } from '../../core/types/migration';
import { fetchText } from '../../utils/http';
import { assertSafeRemoteUrlWithDns } from '../../utils/url-safety';

const app = new Hono();

function buildProviderRefreshPayload(refresh: ProviderRefreshSummary): {
    fetched: number;
    skipped: number;
    failed: number;
} {
    return {
        fetched: refresh.fetched,
        skipped: refresh.skipped,
        failed: refresh.failed,
    };
}

// GET /api/subscribe?url=<clash-url>
// Returns sing-box JSON config directly (usable as a subscription source)
app.get('/', async (c) => {
    const url = c.req.query('url');
    if (!url) {
        return c.json({ success: false, error: 'Missing required query param: url' }, 400);
    }

    let yamlContent: string;
    try {
        yamlContent = await fetchText(url, undefined, async (nextUrl) => {
            await assertSafeRemoteUrlWithDns(nextUrl, { allowDataUrl: true });
        });
    } catch (e) {
        return c.json({ success: false, error: (e as Error).message }, 400);
    }

    const result = await migrateClashConfigWithProviderFetch(yamlContent, {
        targetProfile: 'auto',
        emitReport: false,
        providerFetch: {
            fetcher: async (providerUrl, timeoutMs) => {
                return fetchText(providerUrl, timeoutMs, assertSafeRemoteUrlWithDns);
            },
        },
    });
    const providerRefreshPayload = result.providerRefresh
        ? buildProviderRefreshPayload(result.providerRefresh)
        : undefined;

    if (!result.runnable || !result.config) {
        return c.json(
            {
                success: false,
                runnable: false,
                issues: result.issues,
                providerRefresh: providerRefreshPayload,
                report: result.report,
            },
            422
        );
    }

    // Return raw JSON for direct use as sing-box subscription
    return c.body(JSON.stringify(result.config), 200, {
        'Content-Type': 'application/json',
    });
});

export default app;
