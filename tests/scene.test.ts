import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PRESETS } from '../shared/presets.ts';
import { characterSchema, clipSchema, sampleTrack, type Character, type Track } from '../shared/scene.ts';
import { buildAnimation, buildCharacter } from '../src/scene.ts';

const copy = (): Character => structuredClone(PRESETS[0]);

test('source-inspired presets validate and contain articulated human faces and hands', () => {
  assert.deepEqual(PRESETS.map(character => character.name), ['CELERY MAN', 'OYSTER', 'TAYNE']);
  for (const character of PRESETS) {
    assert.equal(characterSchema.safeParse(character).success, true);
    assert.ok(character.parts.some(part => part.id === 'leftFinger3'));
    assert.ok(character.parts.some(part => part.id === 'nose'));
    assert.ok(character.clips.some(clip => clip.name === character.defaultClip));
  }
  assert.ok(PRESETS[2].parts.some(part => part.id === 'glassesLeft'));
  assert.ok(PRESETS[2].clips.some(clip => clip.name === 'HAT WOBBLE'));
});

test('hierarchy validation rejects duplicate names, missing parents, cycles and reserved root', () => {
  const duplicate = copy();
  duplicate.parts.push(structuredClone(duplicate.parts[0]));
  assert.equal(characterSchema.safeParse(duplicate).success, false);
  const missing = copy();
  missing.parts[0].parent = 'absent';
  assert.equal(characterSchema.safeParse(missing).success, false);
  const cycle = copy();
  cycle.parts[0].parent = 'torso';
  assert.equal(characterSchema.safeParse(cycle).success, false);
  const reserved = copy();
  reserved.parts[0].id = 'root';
  assert.equal(characterSchema.safeParse(reserved).success, false);
});

test('untrusted animation and geometry are bounded and reference real parts', () => {
  const infinite = copy();
  infinite.parts[0].position[1] = Infinity;
  assert.equal(characterSchema.safeParse(infinite).success, false);
  const oversized = copy();
  oversized.parts = Array.from({ length: 121 }, (_, index) => ({ ...oversized.parts[0], id: `p${index}`, parent: 'root' }));
  assert.equal(characterSchema.safeParse(oversized).success, false);
  const missingTrack = copy();
  missingTrack.clips[0].tracks[0].part = 'doesNotExist';
  assert.equal(characterSchema.safeParse(missingTrack).success, false);
  const invertedScale = copy();
  invertedScale.clips[0].tracks.push({ part: 'root', property: 'scale', axis: 'x', keyframes: [{ time: 0, value: 0 }, { time: 1, value: -1 }] });
  assert.equal(characterSchema.safeParse(invertedScale).success, false);
  const badDefault = copy();
  badDefault.defaultClip = 'missing';
  assert.equal(characterSchema.safeParse(badDefault).success, false);
});

test('rejects invisible identities and pathological composed transforms', () => {
  const invisible = copy();
  invisible.parts.forEach(part => { part.shape = 'group'; });
  assert.equal(characterSchema.safeParse(invisible).success, false);
  const huge = copy();
  huge.parts.find(part => part.id === 'hips')!.scale = [10, 10, 10];
  huge.parts.find(part => part.id === 'torso')!.scale = [10, 10, 10];
  assert.equal(characterSchema.safeParse(huge).success, false);
  const deep = copy();
  deep.parts = Array.from({ length: 18 }, (_, index) => ({ ...deep.parts[0], id: `node${index}`, parent: index === 0 ? 'root' : `node${index - 1}`, shape: index === 17 ? 'sphere' as const : 'group' as const, position: [0, 0, 0] }));
  deep.clips = [{ name: 'Spin', duration: 2, tracks: [{ part: 'root', property: 'rotation', axis: 'y', keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }] }] }];
  deep.defaultClip = 'Spin';
  assert.equal(characterSchema.safeParse(deep).success, false);
});

test('tracks must have ordered keyframes and unique channels', () => {
  const clip = structuredClone(PRESETS[0].clips[0]);
  clip.tracks[0].keyframes[1].time = 0;
  assert.equal(clipSchema.safeParse(clip).success, false);
  const duplicateChannel = structuredClone(PRESETS[0].clips[0]);
  duplicateChannel.tracks.push(structuredClone(duplicateChannel.tracks[0]));
  assert.equal(clipSchema.safeParse(duplicateChannel).success, false);
});

test('keyframes interpolate normalized offsets and clamp outside their endpoints', () => {
  const track: Track = { part: 'root', property: 'position', axis: 'y', keyframes: [{ time: .2, value: 2 }, { time: .8, value: 8 }] };
  assert.equal(sampleTrack(track, 0), 2);
  assert.ok(Math.abs(sampleTrack(track, .5) - 5) < 1e-10);
  assert.equal(sampleTrack(track, 1), 8);
});

test('hierarchy builds independently of part ordering and preserves local transforms', () => {
  const character = copy();
  character.parts.reverse();
  const built = buildCharacter(character);
  assert.equal(built.nodes.get('leftFinger0')!.parent!.name, 'leftHand');
  assert.equal(built.nodes.get('torso')!.parent!.name, 'hips');
  const bounds = new THREE.Box3().setFromObject(built.root);
  assert.ok(bounds.max.y > 3 && bounds.max.y < 3.7);
  assert.ok(bounds.min.y > -.1 && bounds.min.y < .1);
});

test('baked animation moves articulated limbs and returns to its loop pose', () => {
  const character = PRESETS[0];
  const built = buildCharacter(character);
  const clip = character.clips[0];
  const animation = buildAnimation(character, clip, built.nodes);
  assert.equal(animation.name, clip.name);
  assert.ok(animation.tracks.every(track => track.name.endsWith('.quaternion') || track.name.endsWith('.position') || track.name.endsWith('.scale')));
  const mixer = new THREE.AnimationMixer(built.root);
  mixer.clipAction(animation).play();
  mixer.update(0);
  const before = built.nodes.get('leftArm')!.quaternion.clone();
  const initialHip = built.nodes.get('hips')!.position.clone();
  mixer.update(clip.duration / 4);
  assert.ok(before.angleTo(built.nodes.get('leftArm')!.quaternion) > .1);
  assert.ok(initialHip.distanceTo(built.nodes.get('hips')!.position) > .05);
  mixer.update(clip.duration * 3 / 4);
  assert.ok(before.angleTo(built.nodes.get('leftArm')!.quaternion) < .001);
  mixer.stopAllAction();
  assert.ok(Math.abs(built.nodes.get('hips')!.position.y - 1.35) < .0001);
});

test('rotation exports an actual full turn and additive scale retains base dimensions', () => {
  const character = PRESETS[0];
  const built = buildCharacter(character);
  const spin = buildAnimation(character, character.clips.find(clip => clip.name === 'ROTATION')!, built.nodes);
  const mixer = new THREE.AnimationMixer(built.root);
  mixer.clipAction(spin).play();
  mixer.update(2);
  assert.ok(Math.abs(new THREE.Vector3(0, 0, 1).applyQuaternion(built.root.quaternion).z + 1) < .001);
  const scaling = buildAnimation(character, { name: 'Grow', duration: 1, tracks: [{ part: 'chest', property: 'scale', axis: 'y', keyframes: [{ time: 0, value: 0 }, { time: 1, value: .5 }] }] }, built.nodes);
  assert.ok(Math.abs(scaling.tracks[0].values[1] - .43) < .001);
  assert.ok(Math.abs(scaling.tracks[0].values[scaling.tracks[0].values.length - 2] - .93) < .001);
});
