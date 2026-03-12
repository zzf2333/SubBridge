import { describe, test, expect, afterEach } from 'bun:test';
import { fetchText } from '../../src/utils/http';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('HTTP Utility', () => {
    test('returns response text on success', async () => {
        globalThis.fetch = (async () => new Response('hello')) as never;
        const text = await fetchText('https://example.com');
        expect(text).toBe('hello');
    });

    test('throws on non-2xx response', async () => {
        globalThis.fetch = (async () => new Response('bad', { status: 500 })) as never;
        await expect(fetchText('https://example.com')).rejects.toThrow('HTTP 500');
    });

    test('throws when content-length exceeds limit', async () => {
        globalThis.fetch = (async () =>
            new Response('small', {
                headers: { 'content-length': String(11 * 1024 * 1024) },
            })) as never;

        await expect(fetchText('https://example.com')).rejects.toThrow('exceeds 10MB');
    });

    test('throws when response body exceeds limit', async () => {
        const large = 'a'.repeat(11 * 1024 * 1024);
        globalThis.fetch = (async () => new Response(large)) as never;

        await expect(fetchText('https://example.com')).rejects.toThrow('exceeds 10MB');
    });

    test('throws timeout error on abort', async () => {
        globalThis.fetch = ((_: string, init?: RequestInit) =>
            new Promise((_, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    reject(new DOMException('Aborted', 'AbortError'));
                });
            })) as never;

        await expect(fetchText('https://example.com', 5)).rejects.toThrow('timed out');
    });

    test('follows redirects and returns final response body', async () => {
        globalThis.fetch = (async (url: string) => {
            if (url === 'https://example.com/start') {
                return new Response('', {
                    status: 302,
                    headers: { location: '/final' },
                });
            }
            if (url === 'https://example.com/final') {
                return new Response('done');
            }
            return new Response('unexpected', { status: 500 });
        }) as never;

        const text = await fetchText('https://example.com/start');
        expect(text).toBe('done');
    });

    test('validates every redirect hop when validator is provided', async () => {
        let fetchCalls = 0;
        const validatedUrls: string[] = [];

        globalThis.fetch = (async (url: string) => {
            fetchCalls += 1;
            if (url === 'https://safe.test/start') {
                return new Response('', {
                    status: 302,
                    headers: { location: 'https://blocked.test/final' },
                });
            }
            return new Response('should-not-fetch');
        }) as never;

        await expect(
            fetchText('https://safe.test/start', 1000, async (url) => {
                validatedUrls.push(url);
                if (url.includes('blocked.test')) {
                    throw new Error('Unsafe redirect target');
                }
            })
        ).rejects.toThrow('Unsafe redirect target');

        expect(fetchCalls).toBe(1);
        expect(validatedUrls).toEqual(['https://safe.test/start', 'https://blocked.test/final']);
    });

    test('throws when redirect response has no location header', async () => {
        globalThis.fetch = (async () => new Response('', { status: 302 })) as never;
        await expect(fetchText('https://example.com')).rejects.toThrow('location is missing');
    });
});
