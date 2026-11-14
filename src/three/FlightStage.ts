import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { sampleAt } from '../engine/ascent';
import type { Design, OrbitId } from '../engine/types';
import type { Director } from '../flight/director';
import type { Assets } from './assets';
import { buildCraft, type Craft } from './craft';
import { Plume, Puffs, horizonColour, makeClouds, makeGround, makeSky } from './fx';
import { ORBIT_GEO, Orbit, betaFor, newFrame, type OrbitFrame } from './orbits';
import { BODY_RADIUS, latLon, makePlanet, makeStars, makeSun, type BodyId, type Planet } from './planet';
import { buildPad, buildRocket, type Rocket } from './rocket';

/*
 * The flight, in 3D. Two scenes are drawn every frame:
 *   far  — the sky: stars, the Sun and planets, in megametres;
 *   near — the rocket or spacecraft and everything within a few kilometres, in metres.
 * The near scene is a local frame that travels with the vehicle (x along the motion, y up),
 * and the far camera is placed where that frame is in space, so a 20-metre rocket and a
 * 12 000-kilometre planet can share a picture without losing precision.
 */

export interface FlightView {
  design: Design;
  dryKg: number;
  orbit: OrbitId;
  vehicleId: string;
  /** Share of each revolution in sunlight. */
  sunFraction: number;
  solar: boolean;
  /** Energy needed in the longest eclipse over what the battery safely holds (>1: it runs flat). */
  eclipseLoad: number;
  /** Share of the day in contact with a ground station. */
  contactFraction: number;
  /** Data produced over data the link can carry (>1: a bottleneck). */
  dataLoad: number;
  /** Storage needed between contacts over storage on board (>1: overflow). */
  storageLoad: number;
  hasData: boolean;
}

export interface FlightHud {
  /** km */
  alt: number;
  /** m/s */
  speed: number;
  g: number;
  q: number;
  fuel1: number;
  fuel2: number;
  stage: 1 | 2;
  burning: boolean;
  eclipse: boolean;
  /** Battery charge 0..1, and whether the instruments had to sleep. */
  battery: number;
  asleep: boolean;
  contact: boolean;
  /** Onboard storage filled 0..1, and whether data is being overwritten. */
  buffer: number;
  overflow: boolean;
}

type Shot = 'launch' | 'deploy' | 'cruise' | 'orbit';

const MM = 1e-6;
const RE = BODY_RADIUS.earth;
const MU: Record<BodyId, number> = { earth: 398600, moon: 4902.8, mars: 42828 };
const GROUND_CAM = 13;
/** Sunlight relative to Earth's distance (inverse square): Mars gets 43 %. */
const SOLAR: Record<string, number> = { earth: 1, moon: 1, l1: 1.02, mars: 0.43 };
/** Share of sunlight a body throws back, and its colour: what lights the spacecraft from below. */
const ALBEDO: Record<string, { k: number; colour: number }> = {
  earth: { k: 0.3, colour: 0x8fb4ff },
  moon: { k: 0.12, colour: 0xc9c6c0 },
  mars: { k: 0.25, colour: 0xff9c66 },
};
const SUN = 3.2;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class FlightStage {
  hud: FlightHud = { alt: 0, speed: 0, g: 0, q: 0, fuel1: 1, fuel2: 1, stage: 1, burning: false, eclipse: false, battery: 1, asleep: false, contact: false, buffer: 0, overflow: false };
  /** How hard the instruments are working this month (0..1): sets how fast coverage is painted. */
  activity = 1;
  /** The spacecraft has died: it goes quiet and tumbles. */
  lost = false;

  private renderer: THREE.WebGLRenderer;
  private near = new THREE.Scene();
  private far = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(42, 1.6, 0.4, 150_000);
  private farCam = new THREE.PerspectiveCamera(42, 1.6, 0.001, 4000);
  private mapCam = new THREE.PerspectiveCamera(38, 1.6, 0.01, 6000);
  private controls: OrbitControls;
  private mapControls: OrbitControls;
  private observer: ResizeObserver;
  private raf = 0;
  private last = 0;
  private time = 0;
  private map = false;

  // world
  private sunDir = new THREE.Vector3(1, 0.3, 0.4).normalize();
  private sunLight = new THREE.DirectionalLight(0xfff4e6, 3.2);
  private hemi = new THREE.HemisphereLight(0xbfd9ff, 0x66735a, 0.9);
  private engineLight = new THREE.PointLight(0xffb070, 0, 900, 1.6);
  private pulseLight = new THREE.PointLight(0xffffff, 0, 60, 1.5);
  private pulse = 0;
  private earth: Planet;
  private dest: Planet | null = null;
  private sunSprite = makeSun();
  private stars = makeStars();
  private sky = makeSky();
  private ground = makeGround();
  private clouds = makeClouds();
  private haze = new THREE.FogExp2(0x9fb8e0, 0.00009);
  /** Sunlight bounced off the body below: blue from Earth, grey from the Moon, rust from Mars. */
  private bounce = new THREE.DirectionalLight(0x8fb4ff, 0);
  private shadowAt = new THREE.Vector3();
  private shadowSize = 100;
  /** Camera kick from staging, decaying. */
  private kick = 0;
  private fired = new Set<string>();
  private burst = new Puffs(320, 0xe9eef7);
  private rcs = new Puffs(160, 0xf2f6ff);
  private rcsClock = 2;
  private deployT = 0;
  private vapour: THREE.Mesh;
  private vapourUniforms = { uOn: { value: 0 }, uTime: { value: 0 } };

  // vehicle
  private rocket: Rocket;
  private pad: ReturnType<typeof buildPad>;
  private craft: Craft;
  private rig = new THREE.Group();
  private craftPlume: Plume | null = null;
  private smoke = new Puffs(900, 0xd8d2c6);
  private fire = new Puffs(260, 0xff8a3c, true);
  private padFx = new THREE.Group();
  private lastTrail = 0;
  private exploded = false;
  private beam: THREE.Mesh;
  private beamUniforms = { uTime: { value: 0 }, uOn: { value: 0 } };

  // trajectory
  private shot: Shot = 'launch';
  private pending: { shot: Shot; t: number } | null = null;
  private fade = 0;
  private frameQ = new THREE.Quaternion();
  private framePos = new THREE.Vector3();
  private site = new THREE.Vector3();
  private heading = new THREE.Vector3();
  private theta = 0;
  private orbit: Orbit;
  private orbitRot = new THREE.Quaternion();
  private center = new THREE.Vector3();
  private mean = 0;
  private of: OrbitFrame = newFrame();
  private orbitLine: THREE.LineLoop;
  private marker: THREE.Sprite;
  private mapOnly: THREE.Object3D[] = [];
  private transfer: THREE.QuadraticBezierCurve3 | null = null;
  private transferLine: THREE.Line | null = null;
  private cruiseOnly: THREE.Object3D[] = [];
  private camDist = 100;
  private touched = false;
  private pixelRatio = 1;
  private perf = { ms: 0, n: 0 };
  /** Angular radius of the body below, as seen from the spacecraft. */
  private bodyAngle = Math.asin(RE / (RE + 0.2));
  private groundCam = new THREE.Vector3();
  private chaseFov = 42;
  private coverU = 0;
  private coverDebt = 0;
  private coverLon = 0;
  private coverPrev: [number, number] | null = null;
  private contactClock = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    assets: Assets,
    private director: Director,
    private view: FlightView,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.pixelRatio = Math.min(window.devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.bias = -0.0006;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.near.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.near.environmentIntensity = 0.2;
    pmrem.dispose();

    // ---- far scene -----------------------------------------------------------
    const geo = ORBIT_GEO[view.orbit];
    this.orbit = new Orbit(geo);
    this.earth = makePlanet('earth');
    this.far.add(this.stars, this.sunSprite, this.earth.group);
    const sso = view.orbit === 'sso';
    latLon(sso ? 34.7 : 28.5, sso ? -120.6 : -80.6, this.site);
    const east = new THREE.Vector3(0, 1, 0).cross(this.site).normalize();
    const north = this.site.clone().cross(east).normalize();
    // Polar launches go south over the sea; everything else goes east with Earth's spin.
    this.heading.copy(sso ? north.clone().multiplyScalar(-0.99).addScaledVector(east, -0.14) : east).normalize();
    // A morning launch: the Sun low in the east, downrange, so the rocket is lit from the side
    // and the tower's shadow falls long across the pad.
    this.sunDir.copy(this.site).multiplyScalar(0.55).addScaledVector(this.heading, 0.8).addScaledVector(this.site.clone().cross(this.heading), 0.22).normalize();

    if (geo.body === 'moon' || geo.body === 'mars') {
      this.dest = makePlanet(geo.body);
      // The Moon at its true distance; Mars brought within reach of the camera's far plane.
      this.center.copy(this.heading).multiplyScalar(0.8).addScaledVector(this.site, 0.5).addScaledVector(this.sunDir, 0.35).normalize().multiplyScalar(geo.body === 'moon' ? 384 : 1500);
      this.dest.group.position.copy(this.center);
      this.far.add(this.dest.group);
    } else if (geo.body === 'l1') {
      this.center.copy(this.sunDir).multiplyScalar(1500);
    }
    this.orientOrbit();
    this.orbitLine = this.orbit.line(0xf0c869);
    this.orbitLine.quaternion.copy(this.orbitRot);
    this.orbitLine.position.copy(this.center);
    this.orbitLine.visible = false;
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xf0c869, sizeAttenuation: false, depthTest: false }));
    this.marker.scale.setScalar(0.016);
    this.marker.visible = false;
    this.far.add(this.orbitLine, this.marker);
    if (geo.body === 'l1') {
      // The map of L1 needs its landmarks: Earth as a dot, and the line that runs from it to the Sun.
      const earthDot = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x5aa2ff, sizeAttenuation: false, depthTest: false }));
      earthDot.scale.setScalar(0.02);
      const axis = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), this.sunDir.clone().multiplyScalar(2600)]),
        new THREE.LineDashedMaterial({ color: 0x6f7fb5, dashSize: 40, gapSize: 30 }),
      );
      axis.computeLineDistances();
      this.mapOnly.push(earthDot, axis);
      this.far.add(earthDot, axis);
    }
    if (geo.body !== 'earth') {
      // The trip out: a gentle arc from Earth to where the spacecraft arrives.
      const to = this.center.clone().normalize();
      const start = to.clone().multiplyScalar(RE + 2);
      const end = this.center.clone().addScaledVector(to, -geo.a * (1 + geo.e) * 2.2);
      const side = to.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
      const len = start.distanceTo(end);
      const ctrl = start.clone().lerp(end, 0.5).addScaledVector(side, len * 0.22).add(new THREE.Vector3(0, len * 0.05, 0));
      this.transfer = new THREE.QuadraticBezierCurve3(start, ctrl, end);
      this.transferLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(this.transfer.getPoints(160)),
        new THREE.LineDashedMaterial({ color: 0xf0c869, dashSize: len / 90, gapSize: len / 140 }),
      );
      this.transferLine.computeLineDistances();
      this.transferLine.visible = false;
      this.far.add(this.transferLine);
      if (geo.body !== 'l1') {
        // The destination is far smaller than a pixel at this scale: mark it.
        const destDot = new THREE.Sprite(new THREE.SpriteMaterial({ color: geo.body === 'mars' ? 0xd0703c : 0xc8ccd6, sizeAttenuation: false, depthTest: false }));
        destDot.scale.setScalar(0.02);
        destDot.position.copy(this.center);
        this.cruiseOnly.push(destDot);
        this.far.add(destDot);
        const earthDot = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x5aa2ff, sizeAttenuation: false, depthTest: false }));
        earthDot.scale.setScalar(0.02);
        this.mapOnly.push(earthDot);
        this.far.add(earthDot);
      }
    }
    for (const o of this.mapOnly) o.visible = false;
    for (const o of this.cruiseOnly) o.visible = false;

    // ---- near scene ----------------------------------------------------------
    this.near.add(this.sunLight, this.sunLight.target, this.hemi, this.sky.mesh, this.pulseLight, this.bounce, this.bounce.target, this.burst.points, this.rcs.points);
    this.near.fog = this.haze;
    this.rocket = buildRocket(view.vehicleId, assets);
    this.pad = buildPad(this.rocket, assets);
    this.rocket.root.add(this.engineLight);
    this.engineLight.position.y = -3;
    this.pad.group.add(this.ground);
    this.ground.position.y = -1.5;
    this.padFx.add(this.smoke.points, this.fire.points);
    this.pad.group.add(this.clouds.points);
    this.clouds.points.position.y = -1.5;
    this.near.add(this.rocket.root, this.pad.group, this.padFx);
    // Everything solid casts and catches shadows; glowing effects do neither.
    const shade = (root: THREE.Object3D) =>
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh.material instanceof THREE.ShaderMaterial) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
    shade(this.rocket.root);
    shade(this.pad.group);

    // The vapour collar that wraps the rocket as it goes through the speed of sound.
    this.vapour = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 1.9, 2.4, 40, 6, true).translate(0, -1.2, 0),
      new THREE.ShaderMaterial({
        uniforms: this.vapourUniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader:
          'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = -position.y / 2.4; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader:
          'uniform float uOn; uniform float uTime; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float rim = 1.0 - abs(dot(normalize(vN), normalize(vV))); float wisp = 0.75 + 0.25 * sin(vY * 40.0 - uTime * 30.0); float a = uOn * pow(rim, 1.6) * smoothstep(0.0, 0.25, vY) * (1.0 - smoothstep(0.55, 1.0, vY)) * wisp * 0.75; gl_FragColor = vec4(vec3(0.94, 0.96, 1.0), a); }',
      }),
    );
    this.vapour.visible = false;
    this.vapour.position.y = this.rocket.height * 0.8;
    this.vapour.scale.setScalar(this.rocket.diameter);
    this.rocket.root.add(this.vapour);

    this.craft = buildCraft(view.design, view.dryKg, assets);
    this.craft.setDeploy(0);
    this.craft.root.updateMatrixWorld(true);
    const folded = new THREE.Box3().setFromObject(this.craft.root);
    const size = folded.getSize(new THREE.Vector3());
    const fit = Math.min(1, (this.rocket.fairingRadius * 1.5) / Math.max(size.x, size.z), (this.rocket.fairingHeight * 0.62) / size.y);
    this.craft.root.scale.setScalar(fit);
    this.craft.root.position.y = this.rocket.payloadY - folded.min.y * fit;
    this.craft.root.rotation.y = Math.PI / 2;
    this.rocket.root.add(this.craft.root);
    shade(this.craft.root);
    if (this.craft.exhaust) {
      const ion = view.design.propulsion === 'ion';
      this.craftPlume = new Plume(this.craft.radius * 0.07, this.craft.radius * (ion ? 0.9 : 1.6), ion ? '#7fd4ff' : '#ffc890');
      this.craftPlume.mesh.position.copy(this.craft.exhaust);
      this.craft.root.add(this.craftPlume.mesh);
    }
    // In space the spacecraft flies engine-last with its instrument deck towards the body below.
    this.rig.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)));
    this.rig.visible = false;
    this.near.add(this.rig);

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0),
      new THREE.ShaderMaterial({
        uniforms: this.beamUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform float uTime; uniform float uOn; varying float vY; void main(){ float dash = smoothstep(0.3, 0.5, fract(vY * 90.0 - uTime * 2.6)); float a = uOn * (0.18 + 0.6 * dash) * pow(1.0 - vY, 2.0); gl_FragColor = vec4(vec3(0.35, 0.85, 1.0) * a, a); }',
      }),
    );
    this.beam.visible = false;
    this.near.add(this.beam);

    // ---- cameras -------------------------------------------------------------
    const H = this.rocket.height;
    this.groundCam.set(H * 1.25 + 26, 5 + H * 0.06, H * 2.0 + 40);
    this.controls = new OrbitControls(this.cam, canvas);
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.enableDamping = true;
    this.controls.enabled = false;
    this.controls.addEventListener('start', () => {
      this.touched = true;
    });
    this.mapControls = new OrbitControls(this.mapCam, canvas);
    this.mapControls.enablePan = false;
    this.mapControls.enableDamping = true;
    this.mapControls.enabled = false;
    canvas.style.touchAction = 'pan-y';

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** 'chase' rides beside the vehicle; 'map' steps back to show the whole orbit. */
  setMap(on: boolean) {
    this.map = on && this.shot !== 'launch';
    this.controls.enabled = !this.map && this.shot !== 'launch';
    this.mapControls.enabled = this.map;
    this.orbitLine.visible = this.marker.visible = this.map;
    for (const o of this.mapOnly) o.visible = this.map;
    const cruise = this.shot === 'cruise' && !!this.transfer;
    if (this.transferLine) this.transferLine.visible = this.map && (cruise || this.orbit.geo.body === 'l1');
    for (const o of this.cruiseOnly) o.visible = this.map && cruise;
    if (this.map && cruise) {
      // On the way: the whole trip from Earth to the destination, seen from above.
      const t = this.transfer!;
      const reach = t.v0.distanceTo(t.v2) * 0.95;
      const side = this.center.clone().normalize().cross(new THREE.Vector3(0, 1, 0)).normalize();
      this.mapControls.target.copy(t.getPoint(0.5));
      this.mapCam.position.copy(this.mapControls.target).add(new THREE.Vector3(0, 0.85, 0).addScaledVector(side, 0.45).normalize().multiplyScalar(reach));
      this.mapControls.minDistance = reach * 0.3;
      this.mapControls.maxDistance = reach * 2.5;
    } else if (this.map) {
      const g = this.orbit.geo;
      const l1 = g.body === 'l1';
      const reach = l1 ? 2300 : g.a * (1 + g.e) * 2.7;
      this.mapControls.target.copy(this.center).multiplyScalar(l1 ? 0.55 : 1);
      const off = l1 ? this.sunDir.clone().cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(0.92).add(new THREE.Vector3(0, 0.38, 0)) : new THREE.Vector3(0.5, 0.45, 0.75);
      this.mapCam.position.copy(this.mapControls.target).add(off.normalize().multiplyScalar(reach));
      this.mapControls.minDistance = reach * 0.35;
      this.mapControls.maxDistance = reach * 2.5;
    }
  }

  /** A short flash on the spacecraft when something happens to it. */
  flash(kind: 'good' | 'info' | 'warn' | 'bad') {
    this.pulseLight.color.set({ good: 0x4fd39b, info: 0x9ab8ff, warn: 0xf0c869, bad: 0xff5a2a }[kind]);
    this.pulse = 1;
  }

  // ---------------------------------------------------------------------------

  /** Turns the working orbit so the Sun sits where the eclipse share from the catalogue needs it. */
  private orientOrbit() {
    const g = this.orbit.geo;
    if (g.body === 'l1') {
      // The halo's plane faces the Sun.
      this.orbitRot.setFromUnitVectors(this.orbit.normal, this.sunDir);
      return;
    }
    const beta = betaFor(g, this.view.sunFraction);
    const alpha = 0.35;
    const want = this.orbit.node
      .clone()
      .multiplyScalar(Math.cos(alpha) * Math.cos(beta))
      .addScaledVector(this.orbit.m, Math.sin(alpha) * Math.cos(beta))
      .addScaledVector(this.orbit.normal, Math.sin(beta));
    this.orbitRot.setFromUnitVectors(want.normalize(), this.sunDir);
    // Start in daylight, a short while before the spacecraft slips into the planet's shadow.
    const half = g.e > 0.05 ? 0.3 : Math.max(0.05, Math.PI * (1 - this.view.sunFraction));
    this.mean = alpha + Math.PI - half - 1.0;
  }

  private resize() {
    const box = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    this.renderer.setSize(box.width, box.height, false);
    for (const c of [this.cam, this.farCam, this.mapCam]) {
      c.aspect = box.width / box.height;
      c.updateProjectionMatrix();
    }
  }

  private setFrame(x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3, pos: THREE.Vector3) {
    this.frameQ.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    this.framePos.copy(pos);
  }

  /**
   * On a slow computer, draw fewer pixels rather than drop frames: a smooth picture teaches more
   * than a sharp one that stutters. Only ever steps down, so it cannot flicker between settings.
   */
  private adapt(frameMs: number) {
    if (document.hidden || frameMs > 250) return;
    this.perf.ms += frameMs;
    this.perf.n++;
    if (this.perf.ms < 2500) return;
    const fps = (1000 * this.perf.n) / this.perf.ms;
    this.perf = { ms: 0, n: 0 };
    if (fps < 42 && this.pixelRatio > 0.75) {
      this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    }
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    this.adapt(now - this.last);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const d = this.director;
    const sdt = dt * d.speed;
    this.time += sdt;

    // Which picture should be on screen for the director's phase?
    const failed = d.plan.launchFailed || !d.plan.ascent.reached;
    const want: Shot =
      d.phase === 'pad' || d.phase === 'countdown' || d.phase === 'ascent' || (d.phase === 'done' && failed)
        ? 'launch'
        : d.phase === 'deploy'
          ? 'deploy'
          : d.phase === 'cruise'
            ? 'cruise'
            : 'orbit';
    if (want !== this.shot && !this.pending) {
      if (this.shot === 'launch' && want === 'deploy') this.enter('deploy');
      else this.pending = { shot: want, t: 0 };
    }
    if (this.pending) {
      // Dip to black, swap the picture, come back.
      this.pending.t += dt;
      this.fade = Math.min(1, this.pending.t / 0.3);
      if (this.pending.t >= 0.3) {
        this.enter(this.pending.shot);
        this.pending = null;
      }
    } else this.fade = Math.max(0, this.fade - dt / 0.45);
    this.canvas.style.opacity = String(1 - this.fade);

    if (this.shot === 'launch') this.stepLaunch(dt, sdt);
    else if (this.shot === 'deploy') this.stepDeploy(dt, sdt);
    else if (this.shot === 'cruise') this.stepCruise(dt);
    else this.stepOrbit(dt, sdt);

    // Light, planets and the two cameras.
    const inv = this.frameQ.clone().invert();
    const sunLocal = this.sunDir.clone().applyQuaternion(inv);
    // The Sun's shadow box follows whatever matters in the shot: the pad at lift-off, the vehicle after.
    const reach = this.shadowSize;
    this.sunLight.target.position.copy(this.shadowAt);
    this.sunLight.position.copy(this.shadowAt).addScaledVector(sunLocal, reach * 4);
    const sc = this.sunLight.shadow.camera;
    if (sc.right !== reach) {
      sc.left = -reach;
      sc.right = reach;
      sc.top = reach;
      sc.bottom = -reach;
      sc.near = reach * 0.5;
      sc.far = reach * 8;
      sc.updateProjectionMatrix();
      this.sunLight.shadow.normalBias = reach * 0.0006;
    }
    // Small puffs: stage-separation clouds by the rocket, cold-gas thrusters on the spacecraft.
    const pixels = this.canvas.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.cam.fov) / 2));
    this.burst.update(sdt, pixels, 0.55);
    this.rcs.update(dt, pixels, 0.5);
    this.kick *= Math.exp(-dt * 2.5);
    this.sunSprite.position.copy(this.framePos).addScaledVector(this.sunDir, 800);
    // The stars are infinitely far away: keep them centred on whichever camera is looking.
    this.stars.position.copy(this.map ? this.mapCam.position : this.framePos);
    for (const p of [this.earth, this.dest]) {
      p?.setSun(this.sunDir);
      p?.setTime(this.time);
    }
    this.pulse = Math.max(0, this.pulse - dt * 1.4);
    this.pulseLight.intensity = this.pulse * 900 * Math.max(1, this.craft.radius);
    this.pulseLight.position.set(this.craft.radius * 0.8, this.craft.radius * 0.9, this.craft.radius);

    this.renderer.clear();
    if (this.map) {
      this.mapControls.update();
      this.marker.position.copy(this.framePos);
      this.renderer.render(this.far, this.mapCam);
      return;
    }
    this.farCam.fov = this.cam.fov;
    this.farCam.quaternion.copy(this.frameQ).multiply(this.cam.quaternion);
    this.farCam.position.copy(this.cam.position).applyQuaternion(this.frameQ).multiplyScalar(MM).add(this.framePos);
    // Keep the depth range tight around whatever the camera is closest to.
    let clear = this.farCam.position.length() - RE;
    if (this.dest) clear = Math.min(clear, this.farCam.position.distanceTo(this.center) - this.dest.radius);
    this.farCam.near = Math.max(1e-5, clear * 0.3);
    this.farCam.far = 5000;
    this.farCam.updateProjectionMatrix();
    this.renderer.render(this.far, this.farCam);
    this.renderer.clearDepth();
    this.renderer.render(this.near, this.cam);
  };

  private enter(shot: Shot) {
    const from = this.shot;
    this.shot = shot;
    if (from === 'launch') {
      // Leave the rocket behind: the spacecraft becomes the centre of the picture.
      this.rig.add(this.craft.root);
      this.craft.root.position.set(0, 0, 0);
      this.craft.root.rotation.set(0, 0, 0);
      this.craft.root.scale.setScalar(1);
      this.rig.visible = true;
      this.rocket.root.visible = false;
      this.pad.group.visible = false;
      this.padFx.visible = false;
      this.sky.set(new THREE.Vector3(0, 1, 0), 0);
      this.engineLight.intensity = 0;
      this.hemi.color.set(0x9fc0ff);
      this.hemi.groundColor.set(0x1b2a55);
      // Space has no sky to fill the shadows: what lights the dark side is the planet below.
      this.hemi.intensity = 0.1;
      this.near.environmentIntensity = 0.12;
      this.near.fog = null;
      this.vapour.visible = false;
      // The spent upper stage drifts away behind.
      const s2 = this.rocket.s2;
      this.near.add(s2);
      s2.rotation.set(0, 0, -Math.PI / 2);
      s2.position.set(-(this.rocket.payloadY - this.rocket.stage2Y + this.craft.radius * 0.9 + 1), 0, 0);
      this.rocket.upperPlume.update(1, 0, 0, 1);
      this.rocket.upperPlume.mesh.visible = false;
      this.cam.fov = this.chaseFov;
      this.cam.updateProjectionMatrix();
      this.camDist = this.craft.radius * 3.4 + 2;
      this.cam.position.set(0.82, 0.42, 0.38).normalize().multiplyScalar(this.camDist);
      this.controls.target.set(0, 0, 0);
      this.controls.enabled = !this.map;
      if (shot !== 'deploy') this.craft.setDeploy(1);
    }
    if (shot !== 'deploy') {
      this.rocket.s2.visible = false;
      this.craft.setDeploy(1);
    }
    if (shot === 'orbit') {
      const body = this.orbit.geo.body;
      (body === 'earth' ? this.earth : this.dest)?.showCover(true);
      this.hemi.groundColor.set(body === 'moon' ? 0x3a3a40 : body === 'mars' ? 0x55301e : body === 'l1' ? 0x0a0e1c : 0x1b2a55);
    }
    this.setMap(this.map);
  }

  // ---- launch -------------------------------------------------------------------

  private stepLaunch(dt: number, sdt: number) {
    const d = this.director;
    const a = d.plan.ascent;
    const met = d.met;
    const s = sampleAt(a, Math.max(0, met));
    const R = this.rocket;
    const H = R.height;
    const at = (id: string) => a.events.find((e) => e.id === id)?.t ?? Infinity;
    const step = d.phase === 'ascent' ? sdt * d.warp : sdt;
    const vacuum = 1 - Math.exp(-s.alt / 9000);

    // Where the rocket is over the Earth, and which way is up there.
    this.theta = s.range / (RE * 1e6);
    const up = this.site.clone().multiplyScalar(Math.cos(this.theta)).addScaledVector(this.heading, Math.sin(this.theta));
    const fwd = this.site.clone().multiplyScalar(-Math.sin(this.theta)).addScaledVector(this.heading, Math.cos(this.theta));
    this.setFrame(fwd, up, fwd.clone().cross(up), up.clone().multiplyScalar(RE + s.alt * MM));
    const sunLocal = this.sunDir.clone().applyQuaternion(this.frameQ.clone().invert());

    // The rocket leans over as it flies: pitch is measured up from the horizon.
    R.root.rotation.z = -(Math.PI / 2 - s.pitch);
    const axis = new THREE.Vector3(Math.cos(s.pitch), Math.sin(s.pitch), 0);
    const ground = -(s.alt + this.pad.mountTop);
    this.pad.group.position.set(-s.range, ground, 0);
    this.padFx.position.copy(this.pad.group.position);
    this.pad.group.visible = s.alt < 30_000;
    const groundFade = 1 - smooth(6000, 26000, s.alt);
    this.ground.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.opacity = groundFade;
    });
    const air = Math.exp(-s.alt / 16000);
    this.sky.set(sunLocal, air);
    this.hemi.intensity = 0.18 + 0.5 * Math.exp(-s.alt / 12000);
    // Haze thickens towards the horizon and thins as the rocket climbs out of the air.
    horizonColour(air, this.haze.color);
    this.haze.density = 0.00009 * Math.exp(-s.alt / 7000);
    // Shadows: the rocket, tower and tanks on the pad at lift-off; the rocket on itself higher up.
    if (s.alt < 700) {
      this.shadowAt.set(-s.range / 2, ground / 2, 0);
      this.shadowSize = H * 0.75 + 70 + s.alt * 0.6 + s.range * 0.6;
    } else {
      this.shadowAt.set(axis.x * H * 0.5, axis.y * H * 0.5, 0);
      this.shadowSize = H * 0.6 + 6;
    }
    // Service arms swing clear just before ignition.
    const swing = smooth(-6, -2.5, met) * 1.25;
    this.pad.arms.forEach((arm, i) => (arm.rotation.y = (i % 2 ? -1 : 1) * swing));

    // Engines.
    const tBoost = at('boosters');
    const tSep = at('separation');
    const tFair = at('fairing');
    const lit = !this.exploded && s.burning;
    const ignition = smooth(-2.4, -0.2, met);
    const corePower = lit && s.stage === 1 ? (met < 0 ? ignition : 1) : 0;
    R.corePlume.update(dt, this.time, corePower, vacuum);
    R.boosterPlumes.forEach((p) => p.update(dt, this.time, lit && met >= -0.4 && met < tBoost ? 1 : 0, vacuum));
    R.upperPlume.update(dt, this.time, lit && s.stage === 2 ? 1 : 0, 1);
    this.engineLight.intensity = corePower * (1 - vacuum) * 6e4;
    // Through the speed of sound the air condenses into a collar round the rocket.
    const transonic = smooth(270, 330, s.speed) * (1 - smooth(400, 470, s.speed)) * (1 - smooth(9000, 16000, s.alt));
    this.vapour.visible = lit && transonic > 0.01;
    this.vapourUniforms.uOn.value = transonic;
    this.vapourUniforms.uTime.value = this.time;
    // Each separation: a jolt to the camera and a puff of gas and debris at the joint.
    for (const [id, y, ring] of [
      ['boosters', H * 0.14, R.baseWidth * 0.5],
      ['separation', R.stage2Y, R.diameter * 0.55],
      ['fairing', R.payloadY + R.fairingHeight * 0.5, R.fairingRadius],
    ] as const) {
      if (this.exploded || met < at(id) || this.fired.has(id)) continue;
      this.fired.add(id);
      this.kick = 1;
      const centre = axis.clone().multiplyScalar(y);
      const across = new THREE.Vector3(-axis.y, axis.x, 0);
      for (let i = 0; i < 34; i++) {
        const ang = Math.random() * Math.PI * 2;
        const out = across.clone().multiplyScalar(Math.cos(ang)).add(new THREE.Vector3(0, 0, Math.sin(ang)));
        const v = out.clone().multiplyScalar(4 + Math.random() * 10).addScaledVector(axis, -(3 + Math.random() * 9));
        const p = centre.clone().addScaledVector(out, ring);
        this.burst.emit(p.x, p.y, p.z, v.x, v.y, v.z, R.diameter * (0.9 + Math.random() * 1.4), 2.2 + Math.random() * 2, 2.6);
      }
    }

    // Staging: each spent piece falls behind once its moment has passed.
    R.boosters.forEach((b) => {
      const tau = met - tBoost;
      if (!b.userData.home) b.userData.home = { p: b.position.clone(), q: b.quaternion.clone() };
      const home = b.userData.home as { p: THREE.Vector3; q: THREE.Quaternion };
      if (tau > 0) {
        const out = new THREE.Vector3(home.p.x, 0, home.p.z).normalize();
        b.position.copy(home.p).addScaledVector(out, 1.6 * tau + 0.3 * tau * tau);
        b.position.y -= 3 * tau + 1.1 * tau * tau;
        b.quaternion.copy(home.q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.min(1.3, 0.06 * tau)));
      }
      b.visible = tau < 45 && !this.exploded;
    });
    {
      const tau = met - tSep;
      if (tau > 0) {
        R.s1.position.y = -(5 * tau + 0.8 * tau * tau);
        R.s1.rotation.x = 0.012 * tau;
      }
      R.s1.visible = tau < 60 && !this.exploded;
    }
    R.fairings.forEach((f, i) => {
      const tau = met - tFair;
      const side = i === 0 ? 1 : -1;
      if (f.userData.y === undefined) f.userData.y = f.position.y;
      if (tau > 0) {
        f.position.x = side * (0.9 * tau + 0.4 * tau * tau);
        f.position.y = (f.userData.y as number) - 0.7 * tau * tau;
        f.rotation.z = -side * Math.min(1.4, 0.16 * tau);
      }
      f.visible = tau < 22 && !this.exploded;
    });

    // Smoke on the pad, then a trail up the sky.
    if (!this.exploded) {
      if (met > -2.4 && met < 11 && s.alt < 400) {
        const n = d.speed === 0 ? 0 : 5;
        for (let i = 0; i < n; i++) {
          const dir = Math.random() < 0.5 ? -1 : 1;
          const billow = Math.random() < 0.35;
          const ang = Math.random() * Math.PI * 2;
          this.smoke.emit(
            (Math.random() - 0.5) * R.baseWidth,
            this.pad.mountTop * 0.4,
            (Math.random() - 0.5) * 3,
            billow ? Math.cos(ang) * 12 : (Math.random() - 0.5) * 10,
            2 + Math.random() * 8,
            billow ? Math.sin(ang) * 12 : dir * (22 + Math.random() * 30),
            R.diameter * (2.2 + Math.random() * 1.6),
            6 + Math.random() * 4,
            1.5,
          );
        }
      }
      if (met > 0 && s.alt < 34_000 && s.burning) {
        const gap = Math.max(R.diameter * 2.4, 14);
        const travelled = Math.hypot(s.range, s.alt);
        while (this.lastTrail + gap < travelled) {
          this.lastTrail += gap;
          this.smoke.emit(
            s.range - axis.x * R.diameter * 5 + (Math.random() - 0.5) * 3,
            s.alt + this.pad.mountTop - axis.y * R.diameter * 5,
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 4,
            -6 + Math.random() * 4,
            (Math.random() - 0.5) * 4,
            R.diameter * (2.4 + Math.random()),
            26 + Math.random() * 10,
            0.9,
          );
        }
      }
    }
    // The failure: one bright moment, then smoke.
    if (d.event?.id === 'failure' && !this.exploded) {
      this.exploded = true;
      R.root.visible = false;
      const x = s.range + axis.x * H * 0.4;
      const y = s.alt + this.pad.mountTop + axis.y * H * 0.4;
      for (let i = 0; i < 150; i++) {
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(20 + Math.random() * 80);
        this.fire.emit(x, y, 0, v.x, v.y, v.z, H * (0.12 + Math.random() * 0.2), 1.2 + Math.random() * 1.8, 2.0);
        if (i % 3 === 0) this.smoke.emit(x, y, 0, v.x * 0.6, v.y * 0.6, v.z * 0.6, H * (0.18 + Math.random() * 0.22), 6 + Math.random() * 5, 0.8);
      }
      this.pulseLight.color.set(0xffa050);
      this.pulse = 1;
      this.kick = 1.6;
    }
    const pix = this.canvas.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.cam.fov) / 2));
    const fxStep = this.exploded ? sdt : Math.min(step, sdt * 8);
    this.smoke.update(fxStep, pix, 0.42 * (1 - smooth(20_000, 34_000, s.alt)), 0.5);
    this.fire.update(sdt, pix, 0.9);
    this.clouds.update(pix, sunLocal, 1 - smooth(12_000, 24_000, s.alt));

    // Camera: a tracking shot from the ground, then a chase beside the rocket.
    const upper = met > tSep;
    const target = axis.clone().multiplyScalar(upper ? R.stage2Y + (H - R.stage2Y) * 0.45 : H * 0.48);
    if (met < GROUND_CAM) {
      this.controls.enabled = false;
      const dolly = 1 - 0.14 * smooth(-10, 0, met);
      this.cam.position.set(this.groundCam.x * dolly - s.range, this.groundCam.y + ground, this.groundCam.z * dolly);
      if (met > -1 && met < 9) {
        const k = 0.05 * H * 0.02 * (1 - smooth(4, 9, met));
        this.cam.position.x += (Math.random() - 0.5) * k;
        this.cam.position.y += (Math.random() - 0.5) * k;
      }
      this.cam.lookAt(target);
      // Zoom in as it climbs, the way a tracking camera does.
      const dist = this.cam.position.distanceTo(target);
      this.cam.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan((H * 0.95) / dist)), 9, this.chaseFov);
      this.cam.updateProjectionMatrix();
      this.camDist = dist;
    } else {
      if (!this.controls.enabled && !this.map) {
        this.controls.enabled = true;
        this.controls.target.copy(target);
      }
      const want = this.exploded ? H * 5 : upper ? (H - R.stage2Y) * 4.2 + 14 : H * 2.7;
      this.camDist += (want - this.camDist) * (1 - Math.exp(-dt * 2.4));
      this.cam.fov += (this.chaseFov - this.cam.fov) * (1 - Math.exp(-dt * 2.4));
      this.cam.updateProjectionMatrix();
      // Unless the player has taken the camera, swing round to fly alongside, a little above and ahead.
      if (!this.touched) {
        const dir = this.cam.position.clone().sub(this.controls.target).normalize();
        // Low in the air, look down past the rocket so the coast and the clouds share the frame.
        const low = 1 - smooth(8000, 30_000, s.alt);
        const wish = new THREE.Vector3(0.3, 0.3 + 0.16 * low, 0.9).normalize();
        dir.lerp(wish, 1 - Math.exp(-dt * 1.7)).normalize();
        this.cam.position.copy(this.controls.target).addScaledVector(dir, this.camDist);
      }
      this.controls.minDistance = this.controls.maxDistance = this.camDist;
      this.controls.target.lerp(target, 1 - Math.exp(-dt * 4));
      this.controls.update();
      // Buffeting: the camera shakes with the air pressure on the rocket and at every separation.
      const shake = (Math.min(1, s.q / 32_000) * 0.003 + this.kick * 0.014) * (lit || this.exploded ? 1 : 0.35);
      if (shake > 1e-4 && d.speed > 0) {
        this.cam.rotateX((Math.random() - 0.5) * shake);
        this.cam.rotateY((Math.random() - 0.5) * shake);
      }
    }

    Object.assign(this.hud, { alt: s.alt / 1000, speed: s.speed, g: s.g, q: s.q, fuel1: s.fuel1, fuel2: s.fuel2, stage: s.stage, burning: lit, eclipse: false, contact: false });
  }

  // ---- separation and deployment ---------------------------------------------

  private stepDeploy(dt: number, sdt: number) {
    // While the picture fades to the next shot the director has already moved on: hold the end pose.
    const p = this.director.phase === 'deploy' ? this.director.progress : 1;
    // Coast along the parking orbit; the ground slides by faster than life so the motion reads.
    this.theta += ((7790 / 6_571_000) * sdt * 26) % (Math.PI * 2);
    const up = this.site.clone().multiplyScalar(Math.cos(this.theta)).addScaledVector(this.heading, Math.sin(this.theta));
    const fwd = this.site.clone().multiplyScalar(-Math.sin(this.theta)).addScaledVector(this.heading, Math.cos(this.theta));
    this.setFrame(fwd, up, fwd.clone().cross(up), up.clone().multiplyScalar(RE + 0.2));
    this.lightFrom(up.clone().multiplyScalar(RE + 0.2), 'earth', RE, 1, dt);
    this.shadowAt.set(0, 0, 0);
    this.shadowSize = this.craft.radius * 2.6 + 2;
    this.craft.setDeploy(smooth(0.3, 0.92, p));
    this.craft.trackSun(this.sunBody());
    // Springs push the stage away, fast at first; it tumbles slowly as it goes.
    const first = this.deployT === 0;
    this.deployT += sdt;
    const s2 = this.rocket.s2;
    s2.position.x -= sdt * (1.2 + this.rocket.height * 0.02 + 3.5 * Math.exp(-this.deployT * 1.2));
    s2.rotation.x += sdt * 0.05;
    s2.rotation.y += sdt * 0.018;
    if (first) {
      // The clamp band lets go: a ring of gas between the stage and the spacecraft.
      const R = this.craft.radius;
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2;
        const out = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
        this.rcs.emit(-R * 0.6, out.y * R * 0.4, out.z * R * 0.4, -R * 0.6 + out.x, out.y * R * 0.9, out.z * R * 0.9, R * 0.14, 1.1 + Math.random() * 0.6, 2.8);
      }
    } else this.thrusters(dt);
    this.chase(dt, this.craft.radius * 3.3 + 2);
    Object.assign(this.hud, { alt: 200, speed: 7790, g: 0, q: 0, burning: false, stage: 2, eclipse: false, contact: false });
  }

  // ---- cruise ----------------------------------------------------------------------

  private stepCruise(dt: number) {
    const p = this.director.phase === 'cruise' ? this.director.progress : 1;
    const t = this.transfer!;
    // Fast near Earth, coasting most of the way, then speeding up again as the destination pulls.
    const u = 0.04 + 0.96 * smooth(0, 1, p);
    const pos = t.getPoint(u);
    const dir = t.getTangent(u).normalize();
    const y = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
    this.setFrame(dir, y, dir.clone().cross(y), pos);
    const along = pos.length();
    // Sunlight weakens on the way out to Mars.
    this.lightFrom(null, 'none', 0, 1 + ((SOLAR[this.orbit.geo.body] ?? 1) - 1) * u, dt);
    this.shadowAt.set(0, 0, 0);
    this.shadowSize = this.craft.radius * 2.4 + 1;
    this.thrusters(dt);
    this.craft.trackSun(this.sunBody());
    this.craft.aimDish(this.toBody(new THREE.Vector3(-1, 0, 0)));
    // Watch Earth shrink behind, then swing round to see the destination grow ahead.
    if (!this.touched) {
      const ahead = 0.93 - 1.86 * smooth(0.3, 0.6, p);
      const lit = this.sunDir.clone().applyQuaternion(this.frameQ.clone().invert()).z < 0 ? -1 : 1;
      const dir = new THREE.Vector3(ahead, 0.22, 0.3 * lit).normalize();
      this.cam.position.copy(dir.multiplyScalar(this.camDist));
    }
    this.chase(dt, this.craft.radius * 3.6 + 2);
    Object.assign(this.hud, { alt: along * 1000, speed: 0, g: 0, burning: false, eclipse: false, contact: false });
  }

  // ---- working orbit -----------------------------------------------------------------

  private stepOrbit(dt: number, sdt: number) {
    const d = this.director;
    const g = this.orbit.geo;
    const planet = g.body === 'earth' ? this.earth : this.dest;
    if (!this.lost) this.mean += (Math.PI * 2 * sdt) / g.period;
    const f = this.orbit.at(this.mean, this.of);
    const pos = f.pos.clone().applyQuaternion(this.orbitRot);
    const x = f.x.clone().applyQuaternion(this.orbitRot);
    let y = f.y.clone().applyQuaternion(this.orbitRot);
    // At L1 "down" is the Sun: that is what the instruments are there to watch.
    if (g.body === 'l1') y = this.sunDir.clone().negate();
    const xo = x.clone().addScaledVector(y, -x.dot(y)).normalize();
    this.setFrame(xo, y, xo.clone().cross(y), pos.clone().add(this.center));
    if (planet) {
      planet.group.quaternion.copy(this.orbitRot);
      planet.globe.rotation.y += ((Math.PI * 2 * sdt) / g.period) * g.spin;
    }

    // Shadow: how much of the Sun the planet hides, and the light it bounces back.
    const sunVisible = this.lightFrom(planet ? pos : null, g.body, planet?.radius ?? 0, SOLAR[g.body] ?? 1, dt);
    const eclipse = sunVisible < 0.5;
    const h = this.hud;
    h.eclipse = eclipse;
    this.shadowAt.set(0, 0, 0);
    this.shadowSize = this.craft.radius * 2.4 + 1;
    this.thrusters(dt);

    // The battery carries the spacecraft through the dark, if it is big enough.
    const dark = Math.max(0.05, 1 - this.view.sunFraction) * g.period;
    if (this.view.solar && eclipse) h.battery = Math.max(0, h.battery - (sdt / dark) * this.view.eclipseLoad * 0.92);
    else h.battery = Math.min(1, h.battery + sdt / 2.5);
    h.asleep = h.battery <= 0.001 && eclipse;

    // Ground contact comes in passes; between them the data waits in memory.
    const cycle = 13;
    const share = this.view.contactFraction >= 0.97 ? 1 : Math.max(0.08, Math.min(0.9, this.view.contactFraction * 1.6));
    this.contactClock = (this.contactClock + sdt) % cycle;
    const pass = this.contactClock / cycle;
    const occulted = g.body !== 'earth' && g.body !== 'l1' && planet ? this.hidden(pos, planet.radius) : false;
    const contact = !this.lost && !occulted && pass < share;
    h.contact = contact;
    if (this.view.hasData && !this.lost) {
      const fill = Math.min(1.4, this.view.storageLoad / 1.5 + 0.12);
      if (contact) h.buffer = Math.max(0, h.buffer - (sdt / (cycle * share)) * Math.min(1.6, 1 / Math.max(0.05, this.view.dataLoad)) * Math.max(0.3, fill));
      else if (!h.asleep) h.buffer = Math.min(1, h.buffer + (sdt / (cycle * (1 - share) + 0.01)) * fill);
      h.overflow = h.buffer >= 0.999 && !contact;
    }

    // Attitude, arrays and antenna.
    const burn = d.phase === 'insertion';
    const p = d.progress;
    this.rig.rotation.set(0, 0, 0);
    this.rig.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)));
    if (burn) this.rig.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), Math.PI * (smooth(0, 0.16, p) - smooth(0.84, 1, p)));
    if (this.lost) this.craft.root.rotation.set(this.time * 0.11, this.time * 0.07, this.time * 0.05);
    this.craftPlume?.update(dt, this.time, burn && p > 0.2 && p < 0.8 ? 1 : 0, 1);
    this.craft.trackSun(this.sunBody());
    let aim: THREE.Vector3;
    if (g.body === 'earth') aim = new THREE.Vector3((0.5 - pass / Math.max(0.01, share)) * 2.4, -1, 0.4).normalize();
    else aim = this.center.clone().add(pos).negate().normalize().applyQuaternion(this.frameQ.clone().invert());
    if (contact) this.craft.aimDish(this.toBody(aim));
    this.beam.visible = contact;
    this.beamUniforms.uTime.value = this.time;
    this.beamUniforms.uOn.value = contact ? 1 : 0;
    if (contact) {
      this.beam.position.copy(this.craft.antenna).applyQuaternion(this.rig.quaternion);
      this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim);
      this.beam.scale.set(this.craft.radius * 0.012, this.craft.radius * 80, this.craft.radius * 0.012);
    }

    // Paint where the instruments have looked. The painting runs ahead of the visible motion:
    // a real mission goes round thousands of times.
    if (planet?.cover && g.body !== 'l1' && d.phase === 'ops' && !this.lost && d.speed > 0) {
      const { ctx, canvas, texture } = planet.cover;
      // Coverage grows only as fast as data gets home.
      this.coverDebt += 4 * this.activity * d.speed;
      const steps = Math.floor(this.coverDebt);
      this.coverDebt -= steps;
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineCap = 'round';
      ctx.lineWidth = g.a > 30 ? 150 : g.e > 0.05 ? 12 : 6;
      for (let i = 0; i < steps; i++) {
        this.coverU += 0.19;
        this.coverLon += 0.19 * g.spin;
        const lat = Math.asin(Math.sin(g.inc) * Math.sin(this.coverU));
        const lon = Math.atan2(Math.cos(g.inc) * Math.sin(this.coverU), Math.cos(this.coverU)) - this.coverLon;
        const px = ((((lon / (Math.PI * 2) + 0.5) % 1) + 1) % 1) * canvas.width;
        const py = (0.5 - lat / Math.PI) * canvas.height;
        if (this.coverPrev && Math.abs(px - this.coverPrev[0]) < canvas.width / 3) {
          ctx.beginPath();
          ctx.moveTo(this.coverPrev[0], this.coverPrev[1]);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
        this.coverPrev = [px, py];
      }
      if (steps > 0) texture.needsUpdate = true;
    }

    const r = pos.length();
    if (planet) this.bodyAngle = Math.asin(Math.min(1, planet.radius / r));
    this.chase(dt, this.craft.radius * 3.6 + 2);
    if (g.body === 'l1') Object.assign(h, { alt: 1_500_000, speed: 300 });
    else {
      const mu = MU[g.body];
      Object.assign(h, { alt: (r - BODY_RADIUS[g.body]) * 1000, speed: Math.sqrt(mu * (2 / (r * 1000) - 1 / (g.a * 1000))) * 1000 });
    }
    Object.assign(h, { g: 0, q: 0, burning: burn && p > 0.2 && p < 0.8, stage: 2 });
  }

  // ---- helpers -----------------------------------------------------------------------

  /**
   * Light from where the spacecraft really is. `rel` is its position from the centre of the body
   * below (null far from any). Sunlight falls off with distance from the Sun, fades through a
   * soft-edged shadow and reddens where it skims an atmosphere; the body's lit face throws back
   * its own coloured light from below, stronger the closer and the more of it is in daylight.
   * Returns how much of the Sun is visible (0..1).
   */
  private lightFrom(rel: THREE.Vector3 | null, body: string, radius: number, solar: number, dt: number): number {
    let vis = 1;
    let dusk = 0;
    if (rel && radius > 0) {
      const along = rel.dot(this.sunDir);
      if (along < 0) {
        const d = rel.clone().addScaledVector(this.sunDir, -along).length();
        const edge = radius * 0.02;
        vis = smooth(radius - edge, radius + edge, d);
        if (body === 'earth') dusk = 1 - smooth(radius, radius * 1.05, d);
        else if (body === 'mars') dusk = 0.45 * (1 - smooth(radius, radius * 1.03, d));
      }
    }
    const want = SUN * solar * vis;
    // The eye adapts a little: at Mars the light is 43 % but reads as about 60 %.
    this.renderer.toneMappingExposure = 1.05 * Math.pow(solar, -0.35);
    this.sunLight.intensity += (want - this.sunLight.intensity) * (1 - Math.exp(-dt * 6));
    this.sunLight.color.setRGB(1, 0.957, 0.902).lerp(new THREE.Color(1, 0.42, 0.18), dusk * 0.85);
    const alb = ALBEDO[body];
    if (rel && alb && radius > 0) {
      const r = rel.length();
      const up = rel.clone().divideScalar(r);
      // How much of the face we see is in daylight, and how big the body looms.
      const phase = 0.5 * (1 + up.dot(this.sunDir));
      const looms = 1 - Math.sqrt(Math.max(0, 1 - (radius / r) ** 2));
      this.bounce.intensity = SUN * solar * alb.k * phase * looms * 2.4;
      this.bounce.color.set(alb.colour);
      const toBody = up.negate().applyQuaternion(this.frameQ.clone().invert());
      this.bounce.position.copy(toBody).multiplyScalar(50);
      this.bounce.target.position.set(0, 0, 0);
    } else this.bounce.intensity = 0;
    return vis;
  }

  /** Now and then a thruster fires to hold attitude: a small white puff, gone in a moment. */
  private thrusters(dt: number) {
    if (this.lost || this.director.speed === 0) return;
    this.rcsClock -= dt;
    if (this.rcsClock > 0) return;
    this.rcsClock = 3 + Math.random() * 5;
    const R = this.craft.radius;
    const side = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).normalize();
    for (let i = 0; i < 4; i++) {
      const p = side.clone().multiplyScalar(R * 0.62);
      const v = side.clone().multiplyScalar(R * (1.2 + Math.random())).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(R * 0.3));
      this.rcs.emit(p.x, p.y, p.z, v.x, v.y, v.z, R * (0.08 + Math.random() * 0.06), 0.6 + Math.random() * 0.4, 3.2);
    }
  }

  /** Sun direction in the spacecraft's own axes. */
  private sunBody(): THREE.Vector3 {
    return this.toBody(this.sunDir.clone().applyQuaternion(this.frameQ.clone().invert()));
  }
  /** Near-scene direction -> spacecraft body axes. */
  private toBody(local: THREE.Vector3): THREE.Vector3 {
    return local.clone().applyQuaternion(this.rig.quaternion.clone().invert());
  }
  /** Is Earth hidden behind the body the spacecraft orbits? */
  private hidden(pos: THREE.Vector3, radius: number): boolean {
    const toEarth = this.center.clone().add(pos).negate().normalize();
    const along = -pos.dot(toEarth);
    return along > 0 && pos.clone().addScaledVector(toEarth, along).length() < radius;
  }
  private chase(dt: number, want: number) {
    this.camDist += (want - this.camDist) * (1 - Math.exp(-dt * 1.5));
    // Left alone, the camera drifts round to the sunlit side so the cells and instruments stay in the light.
    if (!this.touched && this.shot !== 'cruise') {
      const sun = this.sunDir.clone().applyQuaternion(this.frameQ.clone().invert());
      // Stay level enough to keep the horizon in the picture, whatever the Sun's height.
      const flat = new THREE.Vector3(sun.x, 0, sun.z);
      if (flat.lengthSq() < 0.02) flat.set(1, 0, 0);
      flat.normalize();
      const side = new THREE.Vector3().crossVectors(flat, new THREE.Vector3(0, 1, 0));
      // At L1 the Sun is "below": look past the spacecraft towards it from the Earth side.
      const l1 = this.orbit.geo.body === 'l1';
      // Look down steeply enough to keep the planet in the picture: from low orbit the horizon is
      // just below level, from geostationary height the whole Earth is a small disc straight down.
      const horizon = 90 - THREE.MathUtils.radToDeg(this.bodyAngle);
      const down = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(horizon + 8, 20, 72));
      const wish = l1
        ? flat.multiplyScalar(0.6).add(new THREE.Vector3(0, 0.75, 0)).addScaledVector(side, 0.25).normalize()
        : flat.multiplyScalar(0.92).addScaledVector(side, 0.38).normalize().multiplyScalar(Math.cos(down)).add(new THREE.Vector3(0, Math.sin(down), 0)).normalize();
      const dir = this.cam.position.clone().normalize().lerp(wish, 1 - Math.exp(-dt * 0.5)).normalize();
      this.cam.position.copy(dir.multiplyScalar(this.camDist));
    }
    this.controls.minDistance = this.controls.maxDistance = this.camDist;
    this.controls.target.lerp(new THREE.Vector3(0, 0, 0), 1 - Math.exp(-dt * 4));
    this.controls.update();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.controls.dispose();
    this.mapControls.dispose();
    this.near.environment?.dispose();
    this.renderer.dispose();
    // Hand the context back now rather than when the canvas is collected: browsers cap live contexts.
    this.renderer.forceContextLoss();
  }
}
