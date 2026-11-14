import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Assets } from './assets';
import { Puffs, makeGround, makeSky } from './fx';
import { makeStars } from './planet';
import { buildPad, buildRocket } from './rocket';

/**
 * The opening shot of the home page: a rocket on its pad at dusk, floodlit, venting cold
 * oxygen, with the camera drifting slowly round it.
 */
export class HeroStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(24, 1.6, 1, 150_000);
  private vent = new Puffs(160, 0xdfe6f5);
  private observer: ResizeObserver;
  private raf = 0;
  private last = 0;
  private angle = 0.55;
  private height: number;
  private ventAt = new THREE.Vector3();
  private visible = true;
  private watcher: IntersectionObserver;
  private pointer = new THREE.Vector2();
  private look = new THREE.Vector2();

  constructor(
    private canvas: HTMLCanvasElement,
    assets: Assets,
    private still: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.12;
    pmrem.dispose();

    const rocket = buildRocket('atlant', assets);
    const pad = buildPad(rocket, assets);
    rocket.root.position.y = pad.mountTop;
    this.height = rocket.height + pad.mountTop;
    const ground = makeGround();
    ground.position.y = -1.5;
    const sky = makeSky();
    const sun = new THREE.Vector3(0.75, 0.04, -0.66).normalize();
    sky.set(sun, 1, 1);
    const stars = makeStars(1800, 50_000);
    // Low warm sunset from behind the pad, a cold sky above and floodlights on the rocket.
    const dusk = new THREE.DirectionalLight(0xff9a5a, 1.4);
    dusk.position.copy(sun).multiplyScalar(300);
    const hemi = new THREE.HemisphereLight(0x3d4f8a, 0x15140f, 0.55);
    const H = this.height;
    const flood = (x: number, z: number) => {
      const s = new THREE.SpotLight(0xfff0d8, 1, 0, 0.32, 0.6, 0);
      s.position.set(x, 26, z);
      s.target.position.set(0, H * 0.45, 0);
      s.intensity = 9;
      this.scene.add(s, s.target);
    };
    flood(-30, 34);
    flood(-30, -34);
    flood(46, 40);
    this.scene.add(rocket.root, pad.group, ground, sky.mesh, stars, dusk, hemi, this.vent.points);
    // Cold oxygen boils off and drifts away from the upper stage until the last minutes.
    this.ventAt.set(rocket.diameter * 0.55, pad.mountTop + rocket.stage2Y * 0.98, 0);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement ?? canvas);
    // Do not spend the battery on a picture nobody is looking at.
    this.watcher = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting));
    this.watcher.observe(canvas);
    window.addEventListener('pointermove', this.move);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private move = (e: PointerEvent) => {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  };

  private resize() {
    const box = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    this.renderer.setSize(box.width, box.height, false);
    this.camera.aspect = box.width / box.height;
    // On a wide screen the missions take the left and the brief the right: the rocket stands between.
    const shift = this.camera.aspect > 1.2 ? 0.1 : 0;
    if (shift) this.camera.setViewOffset(box.width, box.height, -shift * box.width, 0, box.width, box.height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.visible) return;
    if (!this.still) {
      this.angle += dt * 0.025;
      // The camera leans a little towards the pointer: the scene answers the hand.
      this.look.lerp(this.pointer, 1 - Math.exp(-dt * 2));
      if (Math.random() < dt * 11)
        this.vent.emit(this.ventAt.x, this.ventAt.y, this.ventAt.z, 2.2 + Math.random() * 1.5, -0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2, 1.4, 6 + Math.random() * 3, 1.1);
    }
    const H = this.height;
    const back = Math.max(1, 1.2 / this.camera.aspect);
    const r = (H * 2.6 + 30) * back;
    const a = this.angle + this.look.x * 0.06;
    this.camera.position.set(Math.cos(a) * r, H * 0.1 + 4 - this.look.y * H * 0.05, Math.sin(a) * r);
    this.camera.lookAt(0, H * 0.48, 0);
    this.vent.update(dt, this.canvas.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)), 0.3);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.watcher.disconnect();
    window.removeEventListener('pointermove', this.move);
    this.scene.environment?.dispose();
    this.renderer.dispose();
    // Hand the context back now rather than when the canvas is collected: browsers cap live contexts.
    this.renderer.forceContextLoss();
  }
}
