import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer, get as httpGet } from 'node:http';
import { createApp } from '../server/app.js';
import { MAX_SEQUENCE_BYTES, SequenceStore } from '../server/store.js';
import { CodexProvider, OpenAIProvider, ProviderError, type Provider, type GenerationContext } from '../server/providers.js';
import { PRESETS } from '../shared/presets.js';
import type { Job } from '../server/jobs.js';
import type { Track } from '../shared/scene.js';

const sample = () => structuredClone(PRESETS[0]);
function fake(overrides: Partial<Provider> = {}): Provider {
  return {
    name: 'demo', status: async () => ({ available: true, detail: 'Test provider' }),
    generate: async () => sample(),
    motion: async () => ({ name: 'Full turn', duration: 4, tracks: [{ part: 'root', property: 'rotation', axis: 'y', keyframes: [{ time: 0, value: 0 }, { time: 1, value: Math.PI * 2 }] }] }),
    ...overrides,
  };
}

async function setup(t: test.TestContext, options: Parameters<typeof createApp>[0] = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'paul-server-test-'));
  const result = await createApp({ provider: fake(), dataDir: directory, ...options });
  const server = result.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    result.jobs.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  async function request(path: string, body?: unknown, init: RequestInit = {}) {
    return fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...init });
  }
  async function finished(id: string): Promise<Job> {
    for (let i = 0; i < 150; i++) {
      const response = await request(`/api/jobs/${id}`);
      const job = await response.json() as Job;
      if (job.status === 'complete' || job.status === 'error') return job;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Test job did not finish');
  }
  return { ...result, request, finished, directory, base };
}

test('generates, validates and persists a character, then appends a real motion', async t => {
  const { request, finished, directory } = await setup(t);
  const health = await (await request('/api/health')).json();
  assert.equal(health.provider, 'demo');
  assert.equal(health.available, true);
  const initial = await (await request('/api/sequences')).json();
  assert.equal(initial.sequences.length, PRESETS.length);
  const response = await request('/api/generate', { prompt: 'A nervous accountant made of celery' });
  assert.equal(response.status, 202);
  const generated = await finished((await response.json()).id);
  assert.equal(generated.status, 'complete');
  assert.equal(generated.result?.source, 'demo');
  const id = generated.result!.id;
  const movement = await request(`/api/sequences/${id}/motion`, { prompt: 'Turn completely around' });
  const moved = await finished((await movement.json()).id);
  assert.equal(moved.status, 'complete');
  assert.equal(moved.result!.id, id);
  assert.equal(moved.result!.character.defaultClip, 'Full turn');
  assert.equal(moved.result!.character.clips.length, generated.result!.character.clips.length + 1);
  assert.equal(moved.result!.character.clips.at(-1)!.tracks[0].keyframes.at(-1)!.value, Math.PI * 2);
  const restored = new SequenceStore(directory);
  await restored.init();
  assert.deepEqual(restored.get(id), moved.result);
});

test('rejects untrusted executable fields and malformed character hierarchies before saving', async t => {
  const invalid = sample();
  invalid.parts[0].parent = invalid.parts[0].id;
  const { request, finished, store } = await setup(t, { provider: fake({ generate: async () => ({ ...invalid, script: 'process.exit()' }) }) });
  const response = await request('/api/generate', { prompt: 'Something strange' });
  const job = await finished((await response.json()).id);
  assert.equal(job.status, 'error');
  assert.match(job.error!, /invalid 3D sequence/);
  assert.equal(store.list().length, PRESETS.length);
  assert.equal(JSON.stringify(job).includes('process.exit'), false);
});

test('rejects motion that targets absent parts and preserves original sequence', async t => {
  const { request, finished, store } = await setup(t, { provider: fake({ motion: async () => ({ name: 'Invalid', duration: 1, tracks: [{ part: 'missingJoint', property: 'rotation', axis: 'x', keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }] }] }) }) });
  const original = structuredClone(store.get('preset-1'));
  const response = await request('/api/sequences/preset-1/motion', { prompt: 'Wave' });
  const job = await finished((await response.json()).id);
  assert.equal(job.status, 'error');
  assert.match(job.error!, /invalid motion/);
  assert.deepEqual(store.get('preset-1'), original);
});

test('validates requests and blocks cross-origin access and DNS rebinding', async t => {
  const { request, base } = await setup(t);
  for (const body of [{ prompt: '' }, { prompt: ' '.repeat(10) }, { prompt: 'x'.repeat(1001) }, { prompt: 'hello', command: 'exec' }, { prompt: 3 }]) {
    assert.equal((await request('/api/generate', body)).status, 400);
  }
  assert.equal((await request('/api/generate', { prompt: 'hello' }, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await request('/api/generate', { prompt: 'hello' }, { headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' } })).status, 403);
  const rebindingStatus = await new Promise<number | undefined>((resolve, reject) => {
    httpGet(`${base}/api/health`, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(rebindingStatus, 403);
  assert.equal((await request('/api/sequences', undefined, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await request('/api/generate', undefined, { method: 'POST', body: '{', headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await request('/api/generate', { prompt: 'x'.repeat(20_000) })).status, 413);
  assert.equal((await request('/api/sequences/absent/motion', { prompt: 'jump' })).status, 404);
  assert.equal((await request('/api/jobs/absent')).status, 404);
});

test('cancellation prevents completed provider output from being archived and frees the queue', async t => {
  let release!: (value: unknown) => void;
  let first = true;
  const { request, finished, store } = await setup(t, { maxPending: 1, provider: fake({ generate: async () => {
    if (first) { first = false; return new Promise(resolve => { release = resolve; }); }
    return sample();
  } }) });
  const response = await request('/api/generate', { prompt: 'First' });
  const id = (await response.json()).id;
  assert.equal((await request('/api/generate', { prompt: 'Queue is full' })).status, 429);
  const cancelled = await request(`/api/jobs/${id}`, undefined, { method: 'DELETE' });
  assert.equal((await cancelled.json()).stage, 'CANCELLED');
  release(sample());
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(store.list().length, PRESETS.length);
  const next = await request('/api/generate', { prompt: 'Second' });
  assert.equal((await finished((await next.json()).id)).status, 'complete');
  assert.equal(store.list().length, PRESETS.length + 1);
});

test('cancellation reaches a generation already waiting to persist', async t => {
  const { request, store, directory } = await setup(t);
  const originalAdd = store.add.bind(store);
  let release!: () => void;
  let entered!: () => void;
  const enteredSave = new Promise<void>(resolve => { entered = resolve; });
  const saveGate = new Promise<void>(resolve => { release = resolve; });
  store.add = async (character, source, signal) => {
    entered();
    await saveGate;
    return originalAdd(character, source, signal);
  };
  const response = await request('/api/generate', { prompt: 'Cancel before it reaches the archive' });
  const id = (await response.json()).id;
  await enteredSave;
  await request(`/api/jobs/${id}`, undefined, { method: 'DELETE' });
  release();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(store.list().length, PRESETS.length);
  const restored = new SequenceStore(directory);
  await restored.init();
  assert.equal(restored.list().length, PRESETS.length);
});

test('queued motions recheck the clip limit before spending another provider call', async t => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const provider = fake({ motion: async (...args) => { calls++; await gate; return fake().motion(...args); } });
  const { request, finished, store } = await setup(t, { provider });
  const sequence = structuredClone(store.get('preset-1')!);
  const clip = sequence.character.clips[0];
  sequence.character.clips = Array.from({ length: 23 }, (_, index) => ({ ...clip, name: `Motion ${index}` }));
  sequence.character.defaultClip = 'Motion 0';
  await store.save(sequence);
  const first = await request('/api/sequences/preset-1/motion', { prompt: 'The final available motion' });
  const second = await request('/api/sequences/preset-1/motion', { prompt: 'One motion too many' });
  release();
  assert.equal((await finished((await first.json()).id)).status, 'complete');
  const rejected = await finished((await second.json()).id);
  assert.equal(rejected.status, 'error');
  assert.match(rejected.error!, /already has 24 motions/);
  assert.equal(calls, 1);
  assert.equal(store.get('preset-1')!.character.clips.length, 24);
});

test('times out a stuck provider with an actionable public error', async t => {
  const { request, finished } = await setup(t, { timeoutMs: 25, provider: fake({ generate: () => new Promise(() => {}) }) });
  const response = await request('/api/generate', { prompt: 'Wait forever' });
  const job = await finished((await response.json()).id);
  assert.equal(job.status, 'error');
  assert.equal(job.stage, 'TIMED OUT');
  assert.match(job.error!, /too long/);
});

test('archive skips corrupt and mismatched files without losing presets', async t => {
  const { directory } = await setup(t);
  await writeFile(join(directory, 'broken.json'), '{');
  await writeFile(join(directory, 'mismatch.json'), JSON.stringify({ id: 'different', character: sample(), createdAt: new Date().toISOString(), source: 'demo' }));
  const restored = new SequenceStore(directory);
  await restored.init();
  assert.equal(restored.list().length, PRESETS.length);
});

test('archive rejects oversized updates and preserves the largest accepted version across restart', async t => {
  const { directory, store } = await setup(t);
  const original = await store.add(sample(), 'demo');
  const dense = structuredClone(original);
  dense.character.clips = [];
  const tracks: Track[] = ['root', ...dense.character.parts.map(part => part.id)].flatMap(part =>
    (['position', 'rotation'] as const).flatMap(property =>
      (['x', 'y', 'z'] as const).map(axis => ({ part, property, axis, keyframes: Array.from({ length: 64 }, (_, index) => ({ time: index / 63, value: index / 128 })) }))),
  ).slice(0, 120);
  let accepted = original;
  for (let index = 0; index < 24; index++) {
    const name = `Dense ${index}`;
    dense.character.clips.push({ name, duration: 3, tracks });
    dense.character.defaultClip = name;
    if (Buffer.byteLength(JSON.stringify(dense), 'utf8') > MAX_SEQUENCE_BYTES) break;
    accepted = structuredClone(dense);
  }
  assert(Buffer.byteLength(JSON.stringify(accepted), 'utf8') > MAX_SEQUENCE_BYTES / 2);
  assert(Buffer.byteLength(JSON.stringify(dense), 'utf8') > MAX_SEQUENCE_BYTES);
  await store.save(accepted);
  const diskBefore = await readFile(join(directory, `${original.id}.json`), 'utf8');
  await assert.rejects(store.save(dense), error => error instanceof ProviderError && /too large to archive/.test(error.message));
  assert.deepEqual(store.get(original.id), accepted);
  assert.equal(await readFile(join(directory, `${original.id}.json`), 'utf8'), diskBefore);
  const restored = new SequenceStore(directory);
  await restored.init();
  assert.deepEqual(restored.get(original.id), accepted);
});

test('API provider sends strict schema and keeps credentials out of errors', async t => {
  let payload: any;
  let authorization: string | undefined;
  const upstream = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      payload = JSON.parse(Buffer.concat(chunks).toString());
      authorization = req.headers.authorization;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(sample()) } }] }));
    });
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  t.after(() => new Promise<void>(resolve => { upstream.closeAllConnections(); upstream.close(() => resolve()); }));
  const address = upstream.address();
  assert(address && typeof address !== 'string');
  const provider = new OpenAIProvider({ apiKey: 'test-secret', model: 'configured-model', baseUrl: `http://127.0.0.1:${address.port}/v1` });
  const context: GenerationContext = { signal: new AbortController().signal, onStage() {} };
  assert.deepEqual(await provider.generate('A dancing cone', context), sample());
  assert.equal(authorization, 'Bearer test-secret');
  assert.equal(payload.model, 'configured-model');
  assert.equal(payload.response_format.json_schema.strict, true);
  const parts = payload.response_format.json_schema.schema.properties.parts.items;
  assert.equal(parts.properties.position.items.type, 'number');
  assert.equal(parts.properties.position.minItems, 3);
  assert.equal(parts.properties.position.maxItems, 3);
  assert.equal(JSON.stringify(await provider.status()).includes('test-secret'), false);
});

test('Codex passes prompts through stdin in an isolated worker with tools disabled', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'paul-codex-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const binary = join(directory, 'fake-codex');
  const recordPath = join(directory, 'invocation.json');
  await writeFile(binary, `#!${process.execPath}\nconst fs=require('node:fs');\nconst args=process.argv.slice(2);\nlet input='';\nprocess.stdin.on('data',chunk=>input+=chunk);\nprocess.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(recordPath)},JSON.stringify({args,input,cwd:process.cwd()}));fs.writeFileSync(args[args.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify(sample()))});});\n`, { mode: 0o700 });
  const provider = new CodexProvider({ binary });
  const result = await provider.generate('A cone named $(touch never-created)', { signal: AbortSignal.timeout(5000), onStage() {} });
  assert.deepEqual(result, sample());
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  assert.notEqual(record.cwd, process.cwd());
  assert.equal(record.args.includes('$(touch never-created)'), false);
  assert.match(record.input, /\$\(touch never-created\)/);
  for (const flag of ['--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--output-schema']) assert.equal(record.args.includes(flag), true);
  assert.equal(record.args[record.args.indexOf('--sandbox') + 1], 'read-only');
  assert.equal(record.args.includes('shell_tool'), true);
  assert.equal(record.args.includes('plugins'), true);
  assert.equal(record.args.includes('mcp_servers={}'), true);
  assert.equal(record.args.includes('--model'), false);
});
