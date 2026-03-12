import { Hono } from 'hono';
import { migrateClashConfigWithProviderFetch, validateSingboxConfig } from '../../core/index';
import type { ProviderRefreshSummary } from '../../core/types/migration';
import { fetchText } from '../../utils/http';
import { assertSafeRemoteUrlWithDns } from '../../utils/url-safety';

const app = new Hono();

interface ConvertBody {
    source: string;
    sourceType?: 'yaml' | 'url';
    validate?: boolean;
    includeReport?: boolean;
    includeArtifacts?: boolean;
    fetchProviders?: boolean;
    providerFetchTimeoutMs?: number;
    providerFetchScope?: 'proxy' | 'rule' | 'all';
    providerFetchForce?: boolean;
}

interface ValidationPayload {
    valid: boolean;
    errors: string[];
}

function buildProviderRefreshPayload(refresh: ProviderRefreshSummary | undefined):
    | {
          fetched: number;
          skipped: number;
          failed: number;
      }
    | undefined {
    if (!refresh) {
        return undefined;
    }

    return {
        fetched: refresh.fetched,
        skipped: refresh.skipped,
        failed: refresh.failed,
    };
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

    let yamlContent = body.source;

    if (body.sourceType === 'url') {
        try {
            yamlContent = await fetchText(body.source, undefined, async (url) => {
                await assertSafeRemoteUrlWithDns(url, { allowDataUrl: true });
            });
        } catch (e) {
            return c.json({ success: false, error: (e as Error).message }, 400);
        }
    }

    const result = await migrateClashConfigWithProviderFetch(yamlContent, {
        targetProfile: 'auto',
        emitReport: body.includeReport !== false,
        emitIntermediateArtifacts: body.includeArtifacts === true,
        providerFetch:
            body.fetchProviders === false
                ? { enabled: false }
                : {
                      timeoutMs: body.providerFetchTimeoutMs,
                      scope: body.providerFetchScope,
                      force: body.providerFetchForce === true,
                      fetcher: async (url, timeoutMs) => {
                          return fetchText(url, timeoutMs, assertSafeRemoteUrlWithDns);
                      },
                  },
    });
    const providerRefreshPayload = buildProviderRefreshPayload(result.providerRefresh);

    const reportPayload =
        body.includeReport === false
            ? undefined
            : {
                  report: result.report,
                  reportDisplay: result.report.display,
              };
    const artifactsPayload =
        body.includeArtifacts === true
            ? {
                  artifacts: result.artifacts,
              }
            : undefined;
    const validationPayload =
        body.validate === true && result.config ? buildValidationPayload(result.config) : undefined;

    if (!result.runnable || !result.config) {
        return c.json(
            {
                success: false,
                runnable: false,
                issues: result.issues,
                providerRefresh: providerRefreshPayload,
                ...reportPayload,
                ...artifactsPayload,
                validation: validationPayload,
            },
            422
        );
    }

    return c.json({
        success: true,
        runnable: result.runnable,
        config: result.config,
        providerRefresh: providerRefreshPayload,
        ...reportPayload,
        ...artifactsPayload,
        validation: validationPayload,
        issues: result.issues.length > 0 ? result.issues : undefined,
    });
});

function buildValidationPayload(config: unknown): ValidationPayload {
    const validation = validateSingboxConfig(config as never);
    return {
        valid: validation.valid,
        errors: validation.errors,
    };
}

export default app;
