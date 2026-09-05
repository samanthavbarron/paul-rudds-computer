import { randomUUID } from 'node:crypto';
import { ProviderError, type GenerationContext } from './providers.js';
import type { Sequence } from './store.js';

export type Job = { id: string; status: 'queued' | 'generating' | 'complete' | 'error'; stage: string; createdAt: string; result?: Sequence; error?: string };
type Entry = { job: Job; controller: AbortController; run: (context: GenerationContext) => Promise<Sequence> };
export class QueueFullError extends Error {}

export class JobQueue {
  private readonly entries = new Map<string, Entry>();
  private readonly pending: Entry[] = [];
  private active = 0;
  constructor(private readonly options: { maxPending?: number; timeoutMs?: number } = {}) {}
  get(id: string) { return this.entries.get(id)?.job; }
  enqueue(run: Entry['run']): Job {
    if (this.pending.length + this.active >= (this.options.maxPending ?? 8)) throw new QueueFullError('The computer is busy. Please wait for a sequence to finish.');
    this.prune();
    const job: Job = { id: randomUUID(), status: 'queued', stage: 'WAITING FOR COMPUTER', createdAt: new Date().toISOString() };
    const entry: Entry = { job, run, controller: new AbortController() };
    this.entries.set(job.id, entry);
    this.pending.push(entry);
    queueMicrotask(() => this.drain());
    return job;
  }
  cancel(id: string): Job | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.job.status === 'queued' || entry.job.status === 'generating') {
      entry.job.status = 'error';
      entry.job.stage = 'CANCELLED';
      entry.job.error = 'Sequence cancelled.';
      entry.controller.abort();
    }
    return entry.job;
  }
  close() { for (const id of this.entries.keys()) this.cancel(id); }
  private prune() {
    for (const [id, { job }] of this.entries) {
      if (job.status === 'complete' || job.status === 'error') {
        if (this.entries.size >= 100 || Date.now() - Date.parse(job.createdAt) > 3_600_000) this.entries.delete(id);
      }
    }
  }
  private drain() {
    // Serialize generation and commits so motions on one sequence cannot overwrite each other.
    while (this.active < 1 && this.pending.length) {
      const entry = this.pending.shift()!;
      if (entry.controller.signal.aborted) continue;
      this.active++;
      void this.execute(entry).finally(() => { this.active--; this.drain(); });
    }
  }
  private async execute(entry: Entry) {
    const { job, controller } = entry;
    job.status = 'generating';
    job.stage = 'PREPARING SEQUENCE';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.options.timeoutMs ?? 240_000);
    let onAbort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(new ProviderError(timedOut ? 'The computer took too long. Try a simpler request.' : 'Sequence cancelled.'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const result = await Promise.race([entry.run({ signal: controller.signal, onStage: stage => { if (!controller.signal.aborted) job.stage = stage; } }), cancelled]);
      controller.signal.throwIfAborted();
      job.result = result;
      job.status = 'complete';
      job.stage = 'SEQUENCE READY';
    } catch (error) {
      job.status = 'error';
      job.stage = timedOut ? 'TIMED OUT' : controller.signal.aborted ? 'CANCELLED' : 'COMPUTER ERROR';
      job.error = error instanceof ProviderError ? error.message : 'The computer could not save this sequence. Please try again.';
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
    }
  }
}
