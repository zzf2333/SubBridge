import { Hono } from 'hono';
import { loggerMiddleware } from './middleware/logger';
import { errorMiddleware } from './middleware/error';
import indexRoute from './routes/index';
import convertRoute from './routes/convert';
import subscribeRoute from './routes/subscribe';
import { APP_VERSION } from '../meta';

export function createWebApp(): Hono {
    const app = new Hono();

    app.use('*', loggerMiddleware);
    app.use('*', errorMiddleware);

    app.get('/health', (c) => c.json({ status: 'ok', version: APP_VERSION }));

    app.route('/', indexRoute);
    app.route('/api/convert', convertRoute);
    app.route('/api/subscribe', subscribeRoute);

    return app;
}
