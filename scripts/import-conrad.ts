import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { SequenceStore, type Sequence } from '../server/store.js';

if (existsSync('.env')) loadEnvFile('.env');
const example: Sequence = JSON.parse(await readFile(new URL('../examples/conrad.json', import.meta.url), 'utf8'));
const store = new SequenceStore(resolve(process.env.DATA_DIR || '.data/sequences'));
await store.init();
if (store.get(example.id)) {
  console.log('Conrad is already in the archive. His current choreography has been preserved.');
} else {
  await store.save(example);
  console.log('Conrad, Acting Director of Obstruction, has arrived. Start or restart the server to load him.');
}
