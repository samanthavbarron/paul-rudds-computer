import express, { type ErrorRequestHandler } from 'express';
import { resolve } from 'node:path';
import { z } from 'zod';
import { validateCharacter, clipSchema } from '../shared/scene.js';
import { providerFromEnvironment, ProviderError, type Provider } from './providers.js';
import { SequenceStore } from './store.js';
import { JobQueue, QueueFullError } from './jobs.js';

const requestSchema = z.object({ prompt: z.string().trim().min(1).max(1000) }).strict();
const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);

export async function createApp(options: { provider?: Provider; dataDir?: string; appOrigin?: string; timeoutMs?: number; maxPending?: number } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const provider = options.provider ?? providerFromEnvironment();
  const store = new SequenceStore(options.dataDir ?? resolve('.data/sequences'));
  await store.init();
  const jobs = new JobQueue(options);
  let health: Awaited<ReturnType<Provider['status']>> | undefined;
  let healthTime = 0;
  const allowedOrigin = options.appOrigin ? new URL(options.appOrigin).origin : undefined;

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Host validation also blocks DNS rebinding against the authenticated local worker.
    const host = req.get('host') || '';
    let requestOrigin: string;
    let hostname: string;
    try { const url = new URL(`${req.protocol}://${host}`); requestOrigin = url.origin; hostname = url.hostname; } catch { res.status(403).json({ error: 'Invalid request host.' }); return; }
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname) && requestOrigin !== allowedOrigin) { res.status(403).json({ error: 'This computer accepts local requests only.' }); return; }
    const origin = req.get('origin');
    if (origin && origin !== requestOrigin && origin !== allowedOrigin) { res.status(403).json({ error: 'Cross-origin requests are not allowed.' }); return; }
    if (req.get('sec-fetch-site') === 'cross-site') { res.status(403).json({ error: 'Cross-site requests are not allowed.' }); return; }
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) { res.status(415).json({ error: 'Send an application/json request.' }); return; }
    next();
  });
  app.use('/api', express.json({ limit: '16kb', strict: true }));
  app.get('/api/health', async (_req, res) => {
    if (!health || Date.now() - healthTime > 30_000) { health = await provider.status(); healthTime = Date.now(); }
    res.json({ provider: provider.name, ...health });
  });
  app.get('/api/sequences', (_req, res) => { res.json({ sequences: store.list() }); });
  app.post('/api/generate', (req, res) => {
    const { prompt } = requestSchema.parse(req.body);
    if (store.list().length >= 200) { res.status(409).json({ error: 'The sequence archive is full.' }); return; }
    const job = jobs.enqueue(async context => {
      const raw = await provider.generate(prompt, context);
      context.signal.throwIfAborted();
      let character;
      try { character = validateCharacter(raw); } catch { throw new ProviderError('The model produced an invalid 3D sequence. Please try again with a simpler description.'); }
      context.onStage('SAVING SEQUENCE');
      return store.add(character, provider.name, context.signal);
    });
    res.status(202).json(job);
  });
  app.post('/api/sequences/:id/motion', (req, res) => {
    const id = idSchema.parse(req.params.id);
    const { prompt } = requestSchema.parse(req.body);
    const existing = store.get(id);
    if (!existing) { res.status(404).json({ error: 'Sequence not found.' }); return; }
    if (existing.character.clips.length >= 24) { res.status(409).json({ error: 'This sequence already has 24 motions. Generate a new sequence to continue.' }); return; }
    const job = jobs.enqueue(async context => {
      const latest = store.get(id)!;
      if (latest.character.clips.length >= 24) throw new ProviderError('This sequence already has 24 motions. Generate a new sequence to continue.');
      const raw = await provider.motion(prompt, latest.character, context);
      context.signal.throwIfAborted();
      const current = store.get(id)!;
      let character;
      try {
        const clip = clipSchema.parse(raw);
        const baseName = clip.name;
        for (let suffix = 2; current.character.clips.some(candidate => candidate.name === clip.name); suffix++) clip.name = `${baseName.slice(0, 57)} ${suffix}`;
        character = validateCharacter({ ...current.character, clips: [...current.character.clips, clip], defaultClip: clip.name });
      } catch { throw new ProviderError('The model produced an invalid motion for this character. Please try again.'); }
      context.onStage('SAVING CHOREOGRAPHY');
      return store.save({ ...current, character, source: provider.name }, context.signal);
    });
    res.status(202).json(job);
  });
  app.get('/api/jobs/:id', (req, res) => {
    const job = jobs.get(idSchema.parse(req.params.id));
    job ? res.json(job) : res.status(404).json({ error: 'Job not found. The computer may have restarted.' });
  });
  app.delete('/api/jobs/:id', (req, res) => {
    const job = jobs.cancel(idSchema.parse(req.params.id));
    job ? res.json(job) : res.status(404).json({ error: 'Job not found.' });
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Unknown computer command.' }); });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Enter a request between 1 and 1000 characters with a valid sequence or job ID.' }); return; }
    if (error instanceof QueueFullError) { res.status(429).json({ error: error.message }); return; }
    if (error?.type === 'entity.too.large') { res.status(413).json({ error: 'Request too large.' }); return; }
    if (error instanceof SyntaxError && 'body' in error) { res.status(400).json({ error: 'Invalid JSON request.' }); return; }
    res.status(500).json({ error: 'The computer encountered an internal error.' });
  };
  app.use(errors);
  return { app, store, jobs, provider };
}
