import { mkdir, readFile, readdir, rename, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { characterSchema, type Character } from '../shared/scene.js';
import { PRESETS } from '../shared/presets.js';
import { ProviderError, type ProviderName } from './providers.js';

export const MAX_SEQUENCE_BYTES = 750_000;

const sequenceSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  character: characterSchema,
  createdAt: z.string().datetime(),
  source: z.enum(['preset', 'codex', 'openai', 'demo']),
}).strict();
export type Sequence = z.infer<typeof sequenceSchema>;

export class SequenceStore {
  private readonly sequences = new Map<string, Sequence>();
  constructor(private readonly directory: string) {}
  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    PRESETS.forEach((character, index) => {
      const id = `preset-${index + 1}`;
      this.sequences.set(id, { id, character, createdAt: '1991-01-01T00:00:00.000Z', source: 'preset' });
    });
    const files = (await readdir(this.directory)).filter(name => /^[a-zA-Z0-9_-]{1,80}\.json$/.test(name)).slice(0, 200);
    for (const file of files) {
      try {
        if ((await stat(join(this.directory, file))).size > MAX_SEQUENCE_BYTES) continue;
        const text = await readFile(join(this.directory, file), 'utf8');
        if (Buffer.byteLength(text, 'utf8') > MAX_SEQUENCE_BYTES) continue;
        const sequence = sequenceSchema.parse(JSON.parse(text));
        if (`${sequence.id}.json` !== file) continue;
        this.sequences.set(sequence.id, sequence);
      } catch { console.warn(`Skipping invalid sequence file: ${file}`); }
    }
  }
  list() { return [...this.sequences.values()]; }
  get(id: string) { return this.sequences.get(id); }
  async add(character: Character, source: ProviderName, signal?: AbortSignal): Promise<Sequence> {
    signal?.throwIfAborted();
    if (this.sequences.size >= 200) throw new Error('Sequence archive is full.');
    return this.save({ id: randomUUID(), character, createdAt: new Date().toISOString(), source }, signal);
  }
  async save(input: Sequence, signal?: AbortSignal): Promise<Sequence> {
    signal?.throwIfAborted();
    const sequence = sequenceSchema.parse(input);
    const serialized = JSON.stringify(sequence);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_SEQUENCE_BYTES) {
      throw new ProviderError('This sequence is too large to archive. Try a simpler character or fewer motion keyframes.');
    }
    const temporary = join(this.directory, `${sequence.id}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, serialized, { mode: 0o600, signal });
      signal?.throwIfAborted();
      await rename(temporary, join(this.directory, `${sequence.id}.json`));
      this.sequences.set(sequence.id, sequence);
      return sequence;
    } finally { await rm(temporary, { force: true }); }
  }
}
