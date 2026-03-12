import { Hono } from 'hono';
import { loggerMiddleware } from './middleware/logger';
import { errorMiddleware } from './middleware/error';
import indexRoute from './routes/index';
import convertRoute from './routes/convert';
import subscribeRoute from './routes/subscribe';

export function createWebApp(): Hono {
    const app = new Hono();

    app.use('*', loggerMiddleware);
    app.use('*', errorMiddleware);

    app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

    app.route('/', indexRoute);
    app.route('/api/convert', convertRoute);
    app.route('/api/subscribe', subscribeRoute);

    return app;
}
