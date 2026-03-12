import { createWebApp } from './app';

const app = createWebApp();
const port = parseInt(process.env.PORT ?? '3000');

const server = Bun.serve({
    port,
    fetch: app.fetch,
});

console.log(`SubBridge web server running on http://localhost:${server.port}`);
