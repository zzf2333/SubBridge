import type { Context, Next } from 'hono';

export async function errorMiddleware(c: Context, next: Next): Promise<Response> {
    try {
        await next();
        return c.res;
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Internal server error';
        return c.json({ success: false, error: message }, 500);
    }
}
