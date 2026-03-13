import { APP_NAME, APP_VERSION } from '../meta';

// Simple HTTP fetch with timeout and size limit
const DEFAULT_TIMEOUT = 10_000; // 10s
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_REDIRECTS = 5;

export type UrlValidator = (url: string) => Promise<void> | void;

export async function fetchText(
    url: string,
    timeoutMs = DEFAULT_TIMEOUT,
    validateUrl?: UrlValidator
): Promise<string> {
    let currentUrl = url;

    for (let redirectCount = 0; redirectCount <= DEFAULT_MAX_REDIRECTS; redirectCount += 1) {
        if (validateUrl) {
            await validateUrl(currentUrl);
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        let response: Response;
        try {
            response = await fetch(currentUrl, {
                signal: controller.signal,
                headers: { 'User-Agent': `${APP_NAME}/${APP_VERSION}` },
                redirect: 'manual',
            });
        } catch (e) {
            clearTimeout(timer);
            if ((e as Error).name === 'AbortError') {
                throw new Error(`Request timed out after ${timeoutMs}ms: ${currentUrl}`);
            }
            throw new Error(`Request failed: ${(e as Error).message}`);
        } finally {
            clearTimeout(timer);
        }

        if (isRedirectResponse(response.status)) {
            const location = response.headers.get('location');
            if (!location) {
                throw new Error(`HTTP ${response.status}: redirect location is missing`);
            }

            if (redirectCount === DEFAULT_MAX_REDIRECTS) {
                throw new Error(`Too many redirects: ${url}`);
            }

            currentUrl = new URL(location, currentUrl).toString();
            continue;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${currentUrl}`);
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
            throw new Error('Response exceeds 10MB size limit');
        }

        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_SIZE) {
            throw new Error('Response exceeds 10MB size limit');
        }

        return text;
    }

    throw new Error(`Too many redirects: ${url}`);
}

function isRedirectResponse(status: number): boolean {
    return status >= 300 && status < 400;
}
