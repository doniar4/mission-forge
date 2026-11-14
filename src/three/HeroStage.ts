import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Assets } from './assets';
import { Puffs, makeGround, makeSky } from './fx';
import { buildPad, buildRocket } from './rocket';

/** The picture on the home page: a rocket waiting on its pad, seen from a slowly circling camera. */
export class HeroStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1.4, 1, 150_000);
  private vent = new Puffs(120, 0xffffff);
  private observer: ResizeObserver;
  private raf = 0;
  private last = 0;
  private angle = 0.9;
  private height: number;
  private ventAt = new THREE.Vector3();
  private visible = true;
  private watcher: IntersectionObserver;

  constructor(
    private canvas: HTMLCanvasElement,
    assets: Assets,
    private still: boolean,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();

    const rocket = buildRocket('atlant', assets);
    const pad = buildPad(rocket, assets);
    rocket.root.position.y = pad.mountTop;
    this.height = rocket.height + pad.mountTop;
    const ground = makeGround();
    ground.position.y = -1.5;
    const sky = makeSky();
    const sun = new THREE.Vector3(0.55, 0.42, 0.72).normalize();
    sky.set(sun, 1);
    const light = new THREE.DirectionalLight(0xfff1dc, 3.2);
    light.position.copy(sun).multiplyScalar(200);
    this.scene.add(rocket.root, pad.group, ground, sky.mesh, light, new THREE.HemisphereLight(0xbfd9ff, 0x66735a, 0.95), this.vent.points);
    // Cold oxygen boils off and drifts away from the upper stage until the last minutes.
    this.ventAt.set(rocket.diameter * 0.55, pad.mountTop + rocket.stage2Y * 0.98, 0);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement ?? canvas);
    // Do not spend the battery on a picture nobody is looking at.
    this.watcher = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting));
    this.watcher.observe(canvas);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
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
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.visible) return;
    if (!this.still) {
      this.angle += dt * 0.035;
      if (Math.random() < dt * 9)
        this.vent.emit(this.ventAt.x, this.ventAt.y, this.ventAt.z, 2.2 + Math.random() * 1.5, -0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2, 1.3, 5 + Math.random() * 3, 1.1);
    }
    const H = this.height;
    const r = H * 2.5 + 30;
    // On a tall, narrow screen stand further back so the whole rocket still fits.
    const back = Math.max(1, 1.25 / this.camera.aspect);
    this.camera.position.set(Math.cos(this.angle) * r * back, H * 0.16 + 6, Math.sin(this.angle) * r * back);
    this.camera.lookAt(0, H * 0.5, 0);
    this.vent.update(dt, this.canvas.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)), 0.35);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.watcher.disconnect();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}
