import * as THREE from 'three';
import { makePlanet, makeStars, makeSun } from './planet';

/**
 * The sign-in page's backdrop: Earth's night side from high orbit, its limb a wide arc across the
 * bottom of the screen and the Sun just rising over it. The globe turns slowly, city lights drift
 * past, and the camera leans a little towards the pointer. Decoration only.
 */
export class AuthStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1.6, 0.1, 5000);
  private earth = makePlanet('earth');
  private sun = makeSun(900);
  private flare = makeFlare();
  private sunDir = new THREE.Vector3();
  private observer: ResizeObserver;
  private watcher: IntersectionObserver;
  private raf = 0;
  private last = 0;
  private time = 0;
  private visible = true;
  private pointer = new THREE.Vector2();
  private look = new THREE.Vector2();

  constructor(
    private canvas: HTMLCanvasElement,
    private still: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(0x000000, 0);

    // Night over Eurasia, with the terminator just past the far limb.
    this.earth.setDetail(true);
    this.earth.globe.rotation.y = -2.2;
    this.earth.globe.rotation.x = 0.32;
    this.scene.add(this.earth.group, makeStars(2400, 1200), this.sun, this.flare);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement ?? canvas);
    this.watcher = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting));
    this.watcher.observe(canvas);
    window.addEventListener('pointermove', this.move);
    document.addEventListener('visibilitychange', this.wake);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private move = (e: PointerEvent) => {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  };

  private wake = () => {
    this.last = performance.now();
  };

  private resize() {
    const box = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    this.renderer.setSize(box.width, box.height, false);
    this.camera.aspect = box.width / box.height;
    // A tall phone screen needs a wider lens to keep the curve of the limb in frame.
    this.camera.fov = this.camera.aspect < 1 ? 46 : 30;
    this.camera.updateProjectionMatrix();
    if (this.still) this.render();
  }

  /** Where the frame looks, before the pointer leans it: pitch up past the limb, a slight roll. */
  private aim(lean: THREE.Vector2) {
    const R = this.earth.radius;
    const narrow = this.camera.aspect < 1;
    const dist = R * (narrow ? 2.1 : 1.9);
    const limb = Math.asin(R / dist);
    const half = THREE.MathUtils.degToRad(this.camera.fov / 2);
    // On a wide screen the limb's crest sits two thirds of the way down, under the headline; on a
    // phone it rises behind the headline, so the form below lies over the dark night side.
    const crest = narrow ? 0.38 : -0.3;
    const pitch = limb - half * crest + lean.y * 0.012;
    const yaw = -lean.x * 0.02;
    const cam = new THREE.Camera();
    cam.position.set(lean.x * 0.35, 0, dist);
    cam.up.set(Math.sin(-0.05), Math.cos(-0.05), 0);
    cam.lookAt(cam.position.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))));
    return { cam, limb, half, narrow, crest };
  }

  private place() {
    const { cam } = this.aim(this.look);
    this.camera.position.copy(cam.position);
    this.camera.quaternion.copy(cam.quaternion);
    // The Sun is fixed in the sky, placed from the unleaned frame: just over the limb, right of centre.
    const base = this.aim(new THREE.Vector2());
    const tanV = Math.tan(base.half);
    const x = base.narrow ? 0.42 : 0.16;
    const y = base.crest + 0.012;
    this.sunDir
      .set(x * tanV * this.camera.aspect, y * tanV, -1)
      .applyQuaternion(base.cam.quaternion)
      .normalize();
    this.earth.setSun(this.sunDir);
    this.sun.position.copy(this.sunDir).multiplyScalar(900);
    this.flare.position.copy(this.sunDir).multiplyScalar(880);
  }

  private render() {
    this.place();
    this.earth.setTime(this.time);
    this.renderer.render(this.scene, this.camera);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.visible || document.hidden) return;
    if (this.still) return;
    this.time += dt;
    this.earth.globe.rotation.y += dt * 0.006;
    this.look.lerp(this.pointer, 1 - Math.exp(-dt * 1.6));
    this.render();
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.watcher.disconnect();
    window.removeEventListener('pointermove', this.move);
    document.removeEventListener('visibilitychange', this.wake);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** A thin horizontal streak through the Sun, the way a wide lens catches it. */
function makeFlare(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 32;
  const g = c.getContext('2d')!;
  const across = g.createLinearGradient(0, 0, 512, 0);
  across.addColorStop(0, 'rgba(120,170,255,0)');
  across.addColorStop(0.35, 'rgba(160,190,255,0.25)');
  across.addColorStop(0.5, 'rgba(255,240,220,0.95)');
  across.addColorStop(0.65, 'rgba(160,190,255,0.25)');
  across.addColorStop(1, 'rgba(120,170,255,0)');
  g.fillStyle = across;
  g.fillRect(0, 0, 512, 32);
  // Thin in the middle, fading above and below.
  g.globalCompositeOperation = 'destination-in';
  const down = g.createLinearGradient(0, 0, 0, 32);
  down.addColorStop(0, 'rgba(0,0,0,0)');
  down.addColorStop(0.5, 'rgba(0,0,0,1)');
  down.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = down;
  g.fillRect(0, 0, 512, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }));
  s.scale.set(900, 14, 1);
  return s;
}
