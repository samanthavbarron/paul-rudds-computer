import type { Character } from '../shared/scene';

export type Sequence = { id: string; character: Character; createdAt: string; source: string };
export type Job = { id: string; status: 'queued' | 'generating' | 'complete' | 'error' | 'cancelled'; stage?: string; result?: Sequence; error?: string };
export type Health = { provider: string; available: boolean; detail?: string };

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Computer error ${response.status}.`);
  return data as T;
}
