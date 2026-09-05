import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import express from 'express';
import { createApp } from './app.js';

if (existsSync('.env')) loadEnvFile('.env');
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.APP_ORIGIN) throw new Error('Set APP_ORIGIN when listening outside localhost.');
const { app, jobs, provider } = await createApp({ dataDir: process.env.DATA_DIR, appOrigin: process.env.APP_ORIGIN });
let closeVite: (() => Promise<void>) | undefined;
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => { res.sendFile(resolve('dist/index.html')); });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
  closeVite = () => vite.close();
}
const server = app.listen(port, host, () => { console.log(`Paul's Computer: http://${host}:${port} · ${provider.name} provider`); });
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  jobs.close();
  void closeVite?.();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
