import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Design } from '../engine/types';
import type { Assets } from './assets';
import { buildCraft, type Craft } from './craft';

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function shadowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(20,33,61,0.34)');
  grad.addColorStop(1, 'rgba(20,33,61,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/**
 * The assembly bay in the design studio: the spacecraft rebuilt from the kit every time
 * the design changes, on a transparent canvas so the drafting grid shows through.
 */
export class CraftStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1.8, 0.05, 400);
  private controls: OrbitControls;
  private craft: Craft | null = null;
  private shadow: THREE.Mesh;
  private pops: { o: THREE.Object3D; scale: THREE.Vector3; start: number }[] = [];
  private distance = 6;
  private raf = 0;
  private idleUntil = 0;
  private observer: ResizeObserver;
  private seen = new Set<string>();

  constructor(
    private canvas: HTMLCanvasElement,
    private assets: Assets,
    private still: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.NeutralToneMapping;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.85;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 5, 4);
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.7);
    fill.position.set(-4, 1.5, -3);
    this.scene.add(key, fill);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);

    this.camera.position.set(2.2, 1.2, 5);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minPolarAngle = 0.5;
    this.controls.maxPolarAngle = 2.2;
    this.controls.autoRotate = !still;
    this.controls.autoRotateSpeed = 1.1;
    // The controls claim every touch; give vertical swipes back so the page still scrolls on a phone.
    canvas.style.touchAction = 'pan-y';
    // After the player turns the model by hand, leave it alone for a while.
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false;
    });
    this.controls.addEventListener('end', () => {
      this.idleUntil = performance.now() + 6000;
    });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  setDesign(design: Design, dryKg: number) {
    const next = buildCraft(design, dryKg, this.assets);
    if (this.craft) this.scene.remove(this.craft.root);
    this.scene.add(next.root);
    const first = this.craft === null;
    this.craft = next;

    // Parts that were not there a moment ago grow into place, so the player sees what a click added.
    const now = performance.now();
    this.pops = [];
    for (const [tag, objects] of next.tags) {
      if (!first && !this.seen.has(tag) && !this.still)
        for (const o of objects) {
          this.pops.push({ o, scale: o.scale.clone(), start: now });
          o.scale.multiplyScalar(0.001);
        }
    }
    this.seen = new Set(next.tags.keys());

    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const vertical = Math.max(next.size.y / 2, next.radius * 0.45);
    this.distance = Math.max(vertical / Math.tan(vfov / 2), next.radius / Math.tan(hfov / 2)) * 1.1;
    if (first) this.camera.position.setLength(this.distance);
    this.shadow.position.y = -next.size.y / 2 - next.radius * 0.22;
    this.shadow.scale.setScalar(next.radius * 2.6);
  }

  private resize() {
    const box = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    this.renderer.setSize(box.width, box.height, false);
    this.camera.aspect = box.width / box.height;
    this.camera.updateProjectionMatrix();
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (!this.still && !this.controls.autoRotate && this.idleUntil && now > this.idleUntil) {
      this.controls.autoRotate = true;
      this.idleUntil = 0;
    }
    for (const p of this.pops) {
      const k = easeOut(Math.min(1, (now - p.start) / 420));
      p.o.scale.copy(p.scale).multiplyScalar(Math.max(0.001, k));
    }
    if (this.pops.length && now - this.pops[0].start > 420) this.pops = [];
    const len = this.camera.position.length();
    this.camera.position.setLength(len + (this.distance - len) * 0.12);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.controls.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}
