import { z } from 'zod';

const finite = z.number().finite();
const vector = z.tuple([finite.min(-20).max(20), finite.min(-20).max(20), finite.min(-20).max(20)]);
const identifier = z.string().min(1).max(64).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/);

export const partSchema = z.object({
  id: identifier.refine(value => value !== 'root', 'root is reserved for the character origin'),
  parent: identifier,
  shape: z.enum(['group', 'box', 'sphere', 'capsule', 'cylinder', 'cone', 'torus', 'icosahedron']),
  position: vector,
  rotation: vector,
  scale: z.tuple([finite.min(0.005).max(10), finite.min(0.005).max(10), finite.min(0.005).max(10)]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
}).strict();

export const trackSchema = z.object({
  part: identifier,
  property: z.enum(['rotation', 'position', 'scale']),
  axis: z.enum(['x', 'y', 'z']),
  keyframes: z.array(z.object({ time: finite.min(0).max(1), value: finite.min(-25).max(25) }).strict()).min(2).max(64),
}).strict().superRefine((track, ctx) => {
  for (let i = 1; i < track.keyframes.length; i++) {
    if (track.keyframes[i].time <= track.keyframes[i - 1].time) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keyframes', i, 'time'], message: 'Keyframe times must increase strictly' });
    }
  }
});

export const clipSchema = z.object({
  name: z.string().trim().min(1).max(64),
  duration: finite.min(0.2).max(30),
  tracks: z.array(trackSchema).min(1).max(240),
}).strict().superRefine((clip, ctx) => {
  const channels = new Set<string>();
  clip.tracks.forEach((track, index) => {
    const channel = `${track.part}.${track.property}.${track.axis}`;
    if (channels.has(channel)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tracks', index], message: `Duplicate animation channel: ${channel}` });
    channels.add(channel);
  });
});

export const characterSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().min(1).max(1200),
  parts: z.array(partSchema).min(1).max(120),
  clips: z.array(clipSchema).min(1).max(24),
  defaultClip: z.string().min(1).max(64),
}).strict().superRefine((character, ctx) => {
  const parts = new Map(character.parts.map(part => [part.id, part]));
  const seen = new Set<string>();
  if (!character.parts.some(part => part.shape !== 'group')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parts'], message: 'A character must contain visible geometry' });
  }
  character.parts.forEach((part, index) => {
    if (seen.has(part.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parts', index, 'id'], message: `Duplicate part: ${part.id}` });
    seen.add(part.id);
    if (part.parent !== 'root' && !parts.has(part.parent)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parts', index, 'parent'], message: `Missing parent: ${part.parent}` });
    }
    let cursor: string = part.id;
    const ancestors = new Set<string>();
    while (cursor !== 'root' && parts.has(cursor)) {
      if (ancestors.has(cursor)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parts', index, 'parent'], message: 'Part hierarchy contains a cycle' });
        break;
      }
      ancestors.add(cursor);
      cursor = parts.get(cursor)!.parent;
    }
    if (ancestors.size > 16) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parts', index, 'parent'], message: 'Part hierarchy cannot exceed 16 levels' });
    }
    // Bound composed transforms as well as local values. This conservative
    // radius accounts for any rotation without executing model-supplied code.
    const chain = [...ancestors].reverse();
    let worldScale = 1;
    let worldRadius = 0;
    for (const id of chain) {
      const ancestor = parts.get(id)!;
      worldRadius += Math.hypot(...ancestor.position) * worldScale;
      worldScale *= Math.max(...ancestor.scale);
    }
    if (worldScale > 40 || worldRadius + worldScale * Math.sqrt(3) / 2 > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parts', index], message: 'Composed part transforms exceed the supported world size' });
    }
  });
  const clipNames = new Set<string>();
  character.clips.forEach((clip, clipIndex) => {
    if (clipNames.has(clip.name)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clips', clipIndex, 'name'], message: `Duplicate clip: ${clip.name}` });
    clipNames.add(clip.name);
    clip.tracks.forEach((track, trackIndex) => {
      if (track.part !== 'root' && !parts.has(track.part)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clips', clipIndex, 'tracks', trackIndex, 'part'], message: `Missing animation part: ${track.part}` });
      }
      if (track.property === 'scale') {
        const axis = { x: 0, y: 1, z: 2 }[track.axis];
        const base = track.part === 'root' ? 1 : parts.get(track.part)?.scale[axis];
        if (base !== undefined && track.keyframes.some(key => key.value + base <= 0)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clips', clipIndex, 'tracks', trackIndex], message: 'Scale animation must remain positive' });
        }
      }
    });
  });
  if (!clipNames.has(character.defaultClip)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultClip'], message: 'Default clip must name an existing clip' });
});

export type Part = z.infer<typeof partSchema>;
export type Track = z.infer<typeof trackSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Character = z.infer<typeof characterSchema>;
export type Vector3Tuple = Part['position'];

export function validateCharacter(input: unknown): Character {
  return characterSchema.parse(input);
}

/** Linearly interpolate normalized, additive keyframes. */
export function sampleTrack(track: Track, time: number): number {
  const frames = track.keyframes;
  if (time <= frames[0].time) return frames[0].value;
  for (let i = 1; i < frames.length; i++) {
    if (time <= frames[i].time) {
      const a = frames[i - 1], b = frames[i];
      return a.value + (b.value - a.value) * (time - a.time) / (b.time - a.time);
    }
  }
  return frames[frames.length - 1].value;
}
