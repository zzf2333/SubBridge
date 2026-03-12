import { describe, test, expect } from 'bun:test';
import type { Context, Next } from 'hono';
import { errorMiddleware } from '../../src/web/middleware/error';
import { loggerMiddleware } from '../../src/web/middleware/logger';

describe('Error Middleware', () => {
    test('catches thrown errors and returns 500 JSON response', async () => {
        const c = {
            res: new Response('ok'),
            json(payload: unknown, status: number) {
                return new Response(JSON.stringify(payload), {
                    status,
                    headers: { 'Content-Type': 'application/json' },
                });
            },
        } as unknown as Context;

        const res = await errorMiddleware(c, (async () => {
            throw new Error('boom');
        }) as Next);

        expect(res.status).toBe(500);
        const data = await res.json();
        expect(data.error).toBe('boom');
        expect(data.success).toBe(false);
    });
});

describe('Logger Middleware', () => {
    test('logs request method/path/status', async () => {
        const { Hono } = await import('hono');
        const app = new Hono();
        app.use('*', loggerMiddleware);
        app.get('/ok', (c) => c.text('ok'));

        const logs: string[] = [];
        const original = console.log;
        console.log = (...args: unknown[]) => logs.push(args.join(' '));

        try {
            const res = await app.request('/ok');
            expect(res.status).toBe(200);
            expect(logs.length).toBeGreaterThan(0);
            expect(logs.join(' ')).toContain('GET /ok 200');
        } finally {
            console.log = original;
        }
    });
});
