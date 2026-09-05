import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { sampleTrack, validateCharacter, type Character, type Clip, type Part, type Track } from '../shared/scene.ts';

type BuiltCharacter = { root: THREE.Group; nodes: Map<string, THREE.Object3D> };
type StageFigure = BuiltCharacter & { placement: THREE.Group; mixer: THREE.AnimationMixer; animations: Map<string, THREE.AnimationClip> };
type StageOptions = { portrait?: boolean };

/** All primitive geometries have a unit bounding box before the part's scale. */
function geometry(shape: Exclude<Part['shape'], 'group'>): THREE.BufferGeometry {
  switch (shape) {
    case 'box': return new THREE.BoxGeometry(1, 1, 1);
    case 'sphere': return new THREE.SphereGeometry(.5, 12, 8);
    case 'capsule': return new THREE.CapsuleGeometry(.5, 1, 3, 8).scale(1, .5, 1);
    case 'cylinder': return new THREE.CylinderGeometry(.5, .5, 1, 12);
    case 'cone': return new THREE.ConeGeometry(.5, 1, 10);
    case 'torus': return new THREE.TorusGeometry(.375, .125, 6, 14).scale(1, 1, 4);
    case 'icosahedron': return new THREE.IcosahedronGeometry(.5, 1);
  }
}

/** A real, articulated object hierarchy, usable without a WebGL renderer. */
export function buildCharacter(character: Character): BuiltCharacter {
  const root = new THREE.Group();
  root.name = 'root';
  root.userData = { sequence: character.name, description: character.description };
  const nodes = new Map<string, THREE.Object3D>([['root', root]]);
  const geometries = new Map<string, THREE.BufferGeometry>();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  for (const part of character.parts) {
    let node: THREE.Object3D;
    if (part.shape === 'group') node = new THREE.Group();
    else {
      if (!geometries.has(part.shape)) geometries.set(part.shape, geometry(part.shape));
      if (!materials.has(part.color)) materials.set(part.color, new THREE.MeshStandardMaterial({ color: part.color, roughness: .77, metalness: .025, flatShading: true }));
      const mesh = new THREE.Mesh(geometries.get(part.shape), materials.get(part.color));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      node = mesh;
    }
    node.name = part.id;
    node.position.fromArray(part.position);
    node.rotation.fromArray([...part.rotation, 'XYZ']);
    node.scale.fromArray(part.scale);
    nodes.set(part.id, node);
  }
  for (const part of character.parts) nodes.get(part.parent)!.add(nodes.get(part.id)!);
  root.updateMatrixWorld(true);
  return { root, nodes };
}

/** Bake additive Euler channels into portable quaternion/vector animation tracks. */
export function buildAnimation(character: Character, clip: Clip, nodes: Map<string, THREE.Object3D>): THREE.AnimationClip {
  const groups = new Map<string, Track[]>();
  for (const track of clip.tracks) {
    const id = `${track.part}.${track.property}`;
    groups.set(id, [...(groups.get(id) ?? []), track]);
  }
  const tracks: THREE.KeyframeTrack[] = [];
  const frames = Math.max(2, Math.ceil(clip.duration * 30));
  const times = Array.from({ length: frames + 1 }, (_, index) => index * clip.duration / frames);
  const partMap = new Map(character.parts.map(part => [part.id, part]));
  for (const group of groups.values()) {
    const { part, property } = group[0];
    const node = nodes.get(part);
    if (!node) continue;
    const source = partMap.get(part);
    const base = source ? source[property] : property === 'scale' ? [1, 1, 1] : [0, 0, 0];
    const values: number[] = [];
    for (let frame = 0; frame <= frames; frame++) {
      const v = { x: base[0], y: base[1], z: base[2] };
      for (const channel of group) v[channel.axis] += sampleTrack(channel, frame / frames);
      if (property === 'rotation') values.push(...new THREE.Quaternion().setFromEuler(new THREE.Euler(v.x, v.y, v.z, 'XYZ')).toArray());
      else values.push(v.x, v.y, v.z);
    }
    const target = `${node.name}.${property === 'rotation' ? 'quaternion' : property}`;
    tracks.push(property === 'rotation' ? new THREE.QuaternionKeyframeTrack(target, times, values) : new THREE.VectorKeyframeTrack(target, times, values));
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  object.traverse(node => {
    if (node instanceof THREE.Mesh) {
      geometries.add(node.geometry);
      const list = Array.isArray(node.material) ? node.material : [node.material];
      list.forEach(material => materials.add(material));
    }
  });
  geometries.forEach(item => item.dispose());
  materials.forEach(item => item.dispose());
}

export class SequenceStage {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .01, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly observer: ResizeObserver;
  private readonly portrait: boolean;
  private readonly floor: THREE.Mesh;
  private readonly shadowTexture: THREE.CanvasTexture;
  private readonly contactShadows: THREE.Mesh[] = [];
  private figures: StageFigure[] = [];
  private character!: Character;
  private currentClip = '';
  private speed = 1;
  private paused = false;
  private flerne = false;
  private view: 'front' | 'back' | 'orbit' = 'front';
  private cameraAngle = 0;
  private height = 3.3;
  private bodyWidth = 1.5;
  private cameraDistance = 10;
  private characterCenter = new THREE.Vector3(0, 1.6, 0);
  private portraitCenter = new THREE.Vector3(0, 2.6, 0);
  private animationFrame = 0;
  private previousTime = 0;
  private disposed = false;
  private contextLost = false;

  constructor(private readonly container: HTMLElement, character: Character, options: StageOptions = {}) {
    this.portrait = options.portrait ?? false;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = !this.portrait;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', this.portrait ? 'Animated sequence portrait' : 'Interactive 3D sequence preview');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    this.container.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb5abb4, 1.6));
    const key = new THREE.DirectionalLight(0xfff9f0, 2.1);
    key.position.set(-3, 7, 5);
    key.castShadow = !this.portrait;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 5, bottom: -5, near: .1, far: 20 });
    key.shadow.bias = -.0003;
    key.shadow.normalBias = .035;
    key.shadow.radius = 4;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdce9ff, .65);
    fill.position.set(4, 3, -2);
    this.scene.add(fill);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: .095 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -.018;
    this.floor.receiveShadow = true;
    this.floor.visible = !this.portrait;
    this.scene.add(this.floor);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = shadowCanvas.height = 128;
    const context = shadowCanvas.getContext('2d')!;
    const gradient = context.createRadialGradient(64, 64, 5, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(42,39,47,0.22)');
    gradient.addColorStop(.4, 'rgba(42,39,47,0.12)');
    gradient.addColorStop(1, 'rgba(42,39,47,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    this.shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    for (let i = 0; i < 3; i++) {
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.65, .85), new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = -.012;
      this.scene.add(shadow);
      this.contactShadows.push(shadow);
    }
    this.setCharacter(character);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.animationFrame = requestAnimationFrame(this.render);
  }

  private onContextLost = (event: Event) => { event.preventDefault(); this.contextLost = true; };
  private onContextRestored = () => { this.contextLost = false; };

  setCharacter(character: Character) {
    this.character = validateCharacter(character);
    for (const figure of this.figures) {
      figure.mixer.stopAllAction();
      figure.mixer.uncacheRoot(figure.root);
      this.scene.remove(figure.placement);
      disposeObject(figure.root);
    }
    this.figures = [];
    for (let i = 0; i < (this.portrait ? 1 : 3); i++) {
      const built = buildCharacter(this.character);
      const placement = new THREE.Group();
      placement.add(built.root);
      this.scene.add(placement);
      this.figures.push({ ...built, placement, mixer: new THREE.AnimationMixer(built.root), animations: new Map() });
    }
    const bounds = new THREE.Box3().setFromObject(this.figures[0].root);
    const size = bounds.getSize(new THREE.Vector3());
    this.height = Math.max(1, size.y);
    this.bodyWidth = Math.max(1.3, size.x);
    this.cameraDistance = Math.max(10, bounds.getBoundingSphere(new THREE.Sphere()).radius * 3);
    this.camera.far = this.cameraDistance * 6 + 50;
    bounds.getCenter(this.characterCenter);
    // Nonhuman performers can have a face halfway down a cone or a shell.
    // Prefer actual facial features over assuming a human head at the top.
    const facialParts = this.character.parts.filter(part => /eye/i.test(part.id) && !/brow|lid/i.test(part.id));
    const headParts = this.character.parts.filter(part => /^(head|face)(_|$)/i.test(part.id));
    const anchors = facialParts.length ? facialParts : headParts;
    this.portraitCenter.copy(this.characterCenter);
    if (anchors.length) {
      this.portraitCenter.set(0, 0, 0);
      anchors.forEach(part => this.portraitCenter.add(this.figures[0].nodes.get(part.id)!.getWorldPosition(new THREE.Vector3())));
      this.portraitCenter.divideScalar(anchors.length);
      this.portraitCenter.y -= this.height * .045;
    } else this.portraitCenter.y += this.height * .25;
    const oyster = this.character.name.toUpperCase() === 'OYSTER';
    this.scene.background = new THREE.Color(this.portrait ? oyster ? '#26c568' : '#de35bd' : oyster ? '#f6f0ca' : '#eeefed');
    this.currentClip = '';
    this.setClip(this.character.defaultClip);
    this.arrangeFigures();
    this.resize();
  }

  setClip(name: string) {
    const clip = this.character.clips.find(item => item.name === name);
    if (!clip || this.currentClip === name) return;
    this.currentClip = name;
    for (const figure of this.figures) {
      figure.mixer.stopAllAction();
      // stopAllAction restores transforms to their original pose before rebinding.
      let animation = figure.animations.get(name);
      if (!animation) {
        animation = buildAnimation(this.character, clip, figure.nodes);
        figure.animations.set(name, animation);
      }
      const action = figure.mixer.clipAction(animation);
      action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      figure.mixer.update(0);
    }
  }

  setSpeed(speed: number) { this.speed = Number.isFinite(speed) ? Math.max(.1, Math.min(4, speed)) : 1; }
  setPaused(paused: boolean) { this.paused = paused; }
  setView(view: 'front' | 'back' | 'orbit') { this.view = view; }
  setFlerne(enabled: boolean) { this.flerne = enabled; this.arrangeFigures(); this.resize(); }

  private arrangeFigures() {
    const spacing = Math.max(1.7, this.bodyWidth * 1.35);
    this.figures.forEach((figure, index) => {
      const x = index === 0 ? 0 : index === 1 ? -spacing : spacing;
      figure.placement.position.x = x;
      figure.placement.visible = index === 0 || this.flerne;
    });
    this.contactShadows.forEach((shadow, index) => {
      shadow.position.x = index === 0 ? 0 : index === 1 ? -spacing : spacing;
      shadow.visible = !this.portrait && (index === 0 || this.flerne);
    });
  }

  resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const fullWidth = this.flerne && !this.portrait ? Math.max(1.7, this.bodyWidth * 1.35) * 2 + this.bodyWidth * 1.45 : this.bodyWidth * 1.5;
    const span = this.portrait ? Math.max(this.height * .36, this.bodyWidth * .62 / aspect) : Math.max(this.height * 1.2, fullWidth / aspect);
    this.camera.left = -span * aspect / 2;
    this.camera.right = span * aspect / 2;
    this.camera.top = span / 2;
    this.camera.bottom = -span / 2;
    this.camera.updateProjectionMatrix();
    this.placeCamera();
  }

  private placeCamera() {
    const target = (this.portrait ? this.portraitCenter : this.characterCenter).clone();
    if (!this.portrait) target.y -= .015;
    const elevation = this.portrait ? .08 : .55;
    this.camera.position.set(target.x + Math.sin(this.cameraAngle) * this.cameraDistance, target.y + elevation, target.z + Math.cos(this.cameraAngle) * this.cameraDistance);
    this.camera.lookAt(target);
  }

  private render = (time: number) => {
    if (this.disposed) return;
    const delta = this.previousTime ? Math.min((time - this.previousTime) / 1000, .08) : 0;
    this.previousTime = time;
    if (!this.paused) this.figures.forEach(figure => figure.mixer.update(delta * this.speed));
    if (this.view === 'orbit') this.cameraAngle += delta * .38;
    else {
      const target = this.view === 'back' ? Math.PI : 0;
      const difference = Math.atan2(Math.sin(target - this.cameraAngle), Math.cos(target - this.cameraAngle));
      this.cameraAngle += difference * Math.min(1, delta * 7);
    }
    this.placeCamera();
    if (!this.contextLost) this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.render);
  };

  async exportGLB(): Promise<Blob> {
    const built = buildCharacter(this.character);
    try {
      const animations = this.character.clips.map(clip => buildAnimation(this.character, clip, built.nodes));
      const data = await new GLTFExporter().parseAsync(built.root, { binary: true, animations, onlyVisible: true });
      if (!(data instanceof ArrayBuffer)) throw new Error('The GLB exporter did not return binary data.');
      return new Blob([data], { type: 'model/gltf-binary' });
    } finally { disposeObject(built.root); }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.observer.disconnect();
    this.figures.forEach(figure => { figure.mixer.stopAllAction(); figure.mixer.uncacheRoot(figure.root); });
    disposeObject(this.scene);
    this.shadowTexture.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
