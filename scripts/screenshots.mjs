import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(join(tmpdir(), 'paul-screenshots-'));
const output = join(project, 'docs/screenshots');
let child;
let browser;
let startupError;
try {
  // A separate archive preserves the user's library and keeps screenshots reproducible.
  const example = JSON.parse(await readFile(join(project, 'examples/conrad.json'), 'utf8'));
  await writeFile(join(directory, `${example.id}.json`), JSON.stringify(example));
  await mkdir(output, { recursive: true });
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  const url = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [join(project, 'node_modules/tsx/dist/cli.mjs'), 'server/index.ts'], {
    cwd: project,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_DIR: directory, NODE_ENV: 'production' },
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: process.platform !== 'win32',
  });
  child.on('error', error => { startupError = error; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (startupError) throw startupError;
    if (child.exitCode !== null) throw new Error('Screenshot server exited before startup.');
    try { ready = (await fetch(`${url}/api/sequences`, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* waiting for startup */ }
    if (ready) break;
    await delay(200);
  }
  if (!ready) throw new Error('Screenshot server did not start.');
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1120 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [name, file] of [['CELERY MAN', 'paul.png'], ['TAYNE', 'tayne.png'], ['CONRAD, ACTING DIRECTOR', 'conrad.png']]) {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button', { name: new RegExp(name) }).click();
    if (file === 'conrad.png') await page.locator('#clip').selectOption({ index: 0 });
    await page.waitForTimeout(file === 'tayne.png' ? 500 : 700);
    await page.screenshot({ path: join(output, file), fullPage: true });
    console.log(`Captured docs/screenshots/${file}`);
  }
  if (errors.length) throw new Error(`Browser rendering failed: ${errors.join('; ')}`);
} finally {
  await browser?.close();
  if (child && child.exitCode === null && child.pid) {
    const exit = once(child, 'exit');
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
    await Promise.race([exit, delay(4000)]);
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
      await exit;
    }
  }
  await rm(directory, { recursive: true, force: true });
}
