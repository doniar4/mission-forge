import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Design } from '../engine/types';
import type { Assets } from './assets';
import { buildCraft, type Craft } from './craft';
import { makePlanet, makeStars, makeSun, type BodyId, type Planet } from './planet';

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function shadowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export type Backdrop = BodyId | 'sun';

export interface CraftStageOptions {
  still: boolean;
  /** 'space': the hangar — stars and the destination below, user zoom. 'card': transparent, for a panel. */
  mode: 'space' | 'card';
}

/**
 * The spacecraft rebuilt from the kit every time the design changes. In the hangar it floats
 * above the planet it is going to; the camera leans in towards whatever part is being chosen.
 */
export class CraftStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1.8, 0.05, 4000);
  private controls: OrbitControls;
  private craft: Craft | null = null;
  private shadow: THREE.Mesh | null = null;
  private pops: { o: THREE.Object3D; scale: THREE.Vector3; start: number }[] = [];
  private base = 6;
  private distance = 6;
  private zoom = 1;
  private target = new THREE.Vector3();
  private focusTags: string[] = [];
  private raf = 0;
  private idleUntil = 0;
  private observer: ResizeObserver;
  private seen = new Set<string>();
  private offset = { x: 0, y: 0 };
  private planet: Planet | null = null;
  private sunSprite: THREE.Sprite | null = null;
  private backdrop: Backdrop | null = null;
  private sunDir = new THREE.Vector3(-0.72, 0.42, 0.55).normalize();
  private clock = 0;
  private last = performance.now();

  constructor(
    private canvas: HTMLCanvasElement,
    private assets: Assets,
    private opts: CraftStageOptions,
  ) {
    const space = opts.mode === 'space';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !space });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(space ? 0x03050c : 0x000000, space ? 1 : 0);
    this.renderer.toneMapping = space ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = space ? 1.1 : 1;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = space ? 0.45 : 0.85;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xfff3e2, space ? 3.4 : 2.4);
    key.position.copy(space ? this.sunDir : new THREE.Vector3(3, 5, 4)).multiplyScalar(10);
    const fill = new THREE.DirectionalLight(0x8fb2ff, space ? 0.55 : 0.7);
    fill.position.set(4, -1.5, 3);
    const rim = new THREE.DirectionalLight(0x9fc4ff, space ? 1.6 : 0);
    rim.position.set(2, 3, -6);
    this.scene.add(key, fill, rim);

    if (space) {
      this.scene.add(makeStars(2400, 1500));
    } else {
      this.shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false }),
      );
      this.shadow.rotation.x = -Math.PI / 2;
      this.scene.add(this.shadow);
    }

    this.camera.position.set(2.4, 0.9, 5);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 2.3;
    this.controls.autoRotate = !opts.still;
    this.controls.autoRotateSpeed = 0.7;
    // The controls claim every touch; give vertical swipes back so the page still scrolls on a phone.
    canvas.style.touchAction = 'pan-y';
    // After the player turns the model by hand, leave it alone for a while.
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false;
    });
    this.controls.addEventListener('end', () => {
      this.idleUntil = performance.now() + 7000;
    });
    if (space) canvas.addEventListener('wheel', this.wheel, { passive: false });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom = clamp(this.zoom * Math.exp(e.deltaY * 0.0012), 0.45, 1.8);
  };

  /** The destination underneath the spacecraft. */
  setBackdrop(body: Backdrop) {
    if (this.opts.mode !== 'space' || body === this.backdrop) return;
    this.backdrop = body;
    if (this.planet) {
      this.scene.remove(this.planet.group);
      this.planet = null;
    }
    if (this.sunSprite) {
      this.scene.remove(this.sunSprite);
      this.sunSprite = null;
    }
    if (body === 'sun') {
      // At L1 the Sun fills the sky ahead; Earth is a small blue disc far behind.
      this.sunSprite = makeSun(900);
      this.sunSprite.position.set(-640, -120, -620);
      this.sunSprite.scale.setScalar(620);
      this.scene.add(this.sunSprite);
      const earth = makePlanet('earth');
      earth.group.scale.setScalar(8 / earth.radius);
      earth.group.position.set(260, -60, 520);
      earth.setSun(new THREE.Vector3(-1, 0.1, -0.8).normalize());
      this.planet = earth;
      this.scene.add(earth.group);
      return;
    }
    const p = makePlanet(body);
    const R = body === 'moon' ? 260 : 320;
    p.group.scale.setScalar(R / p.radius);
    p.group.position.set(R * 0.35, -R * 1.18, -R * 0.75);
    p.setSun(this.sunDir);
    p.globe.rotation.set(0.35, 1.9, 0.12);
    this.planet = p;
    this.scene.add(p.group);
  }

  /** Lean the camera towards the parts whose tags start with any of these prefixes ([] = whole craft). */
  setFocus(prefixes: string[]) {
    this.focusTags = prefixes;
    this.aim();
  }

  /** Shift the picture so the craft sits in the free part of the screen (fractions of the canvas). */
  setOffset(x: number, y: number) {
    this.offset = { x, y };
    this.resize();
  }

  private aim() {
    const c = this.craft;
    if (!c) return;
    const box = new THREE.Box3();
    for (const [tag, objs] of c.tags) if (this.focusTags.some((p) => tag.startsWith(p))) for (const o of objs) box.expandByObject(o);
    if (box.isEmpty()) {
      this.target.set(0, 0, 0);
      this.distance = this.base;
      return;
    }
    const centre = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    this.target.copy(centre).multiplyScalar(0.55);
    this.distance = clamp(r * 7, this.base * 0.62, this.base);
  }

  setDesign(design: Design, dryKg: number) {
    const next = buildCraft(design, dryKg, this.assets);
    if (this.craft) this.scene.remove(this.craft.root);
    this.scene.add(next.root);
    const first = this.craft === null;
    this.craft = next;

    // Parts that were not there a moment ago grow into place, so the player sees what a choice adds.
    const now = performance.now();
    this.pops = [];
    for (const [tag, objects] of next.tags) {
      if (!first && !this.seen.has(tag) && !this.opts.still)
        for (const o of objects) {
          this.pops.push({ o, scale: o.scale.clone(), start: now });
          o.scale.multiplyScalar(0.001);
        }
    }
    this.seen = new Set(next.tags.keys());

    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const vertical = Math.max(next.size.y / 2, next.radius * 0.45);
    // In the hangar only the band between the top bar and the dock is free: frame for that.
    this.base = Math.max(vertical / Math.tan(vfov / 2), next.radius / Math.tan(hfov / 2)) * (this.opts.mode === 'space' ? 1.9 : 1.1);
    this.aim();
    if (first) {
      this.camera.position.setLength(this.distance);
      this.controls.target.copy(this.target);
    }
    if (this.shadow) {
      this.shadow.position.y = -next.size.y / 2 - next.radius * 0.22;
      this.shadow.scale.setScalar(next.radius * 2.6);
    }
  }

  private resize() {
    const box = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    this.renderer.setSize(box.width, box.height, false);
    this.camera.aspect = box.width / box.height;
    if (this.offset.x || this.offset.y)
      this.camera.setViewOffset(box.width, box.height, -this.offset.x * box.width, this.offset.y * box.height, box.width, box.height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.clock += dt;
    if (!this.opts.still && !this.controls.autoRotate && this.idleUntil && now > this.idleUntil) {
      this.controls.autoRotate = true;
      this.idleUntil = 0;
    }
    for (const p of this.pops) {
      const k = easeOut(Math.min(1, (now - p.start) / 420));
      p.o.scale.copy(p.scale).multiplyScalar(Math.max(0.001, k));
    }
    if (this.pops.length && now - this.pops[0].start > 420) this.pops = [];
    if (this.planet) {
      this.planet.setTime(this.clock);
      if (!this.opts.still) this.planet.globe.rotation.y += dt * 0.006;
    }
    // Glide towards the wanted framing; the player's own rotation is kept.
    const k = 1 - Math.exp(-dt * 4);
    this.controls.target.lerp(this.target, k);
    const offset = this.camera.position.clone().sub(this.controls.target);
    const want = this.distance * this.zoom;
    offset.setLength(offset.length() + (want - offset.length()) * k);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.canvas.removeEventListener('wheel', this.wheel);
    this.controls.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    // Hand the context back now rather than when the canvas is collected: browsers cap live contexts.
    this.renderer.forceContextLoss();
  }
}
