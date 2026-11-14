import * as THREE from 'three';

/** An engine exhaust plume: a cone of light that widens as the air around it thins. */
export class Plume {
  mesh: THREE.Mesh;
  private uniforms = {
    uTime: { value: 0 },
    uSpread: { value: 1.6 },
    uPower: { value: 0 },
    uColor: { value: new THREE.Color(1.0, 0.55, 0.18) },
  };
  private level = 0;

  constructor(
    private radius: number,
    private length: number,
    color?: THREE.ColorRepresentation,
  ) {
    if (color) this.uniforms.uColor.value.set(color);
    const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 14, true);
    geo.translate(0, -0.5, 0); // the nozzle is at the origin, the plume trails along -Y
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uSpread;
          varying float vT;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            float t = -position.y;
            vT = t;
            float r = mix(1.0, uSpread, pow(t, 0.7)) * (1.0 - 0.8 * pow(t, 3.0));
            vec3 p = vec3(position.x * r, position.y, position.z * r);
            p.x += sin(uTime * 43.0 + t * 17.0) * 0.05 * t;
            p.z += cos(uTime * 37.0 + t * 13.0) * 0.05 * t;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vN = normalize(normalMatrix * vec3(position.x, 0.0, position.z));
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uPower;
          uniform vec3 uColor;
          varying float vT;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.2);
            float fade = pow(1.0 - vT, 1.25);
            float flicker = 0.88 + 0.12 * sin(uTime * 61.0 + vT * 31.0);
            // White-hot at the nozzle, cooling to the flame colour along the plume.
            vec3 col = mix(vec3(1.0, 0.96, 0.82), uColor, smoothstep(0.0, 0.5, vT)) * 1.5;
            float a = clamp(facing * fade * flicker * uPower * 1.35, 0.0, 1.0);
            gl_FragColor = vec4(col, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.mesh.visible = false;
  }

  /** power 0..1; vacuum 0 at sea level, 1 in space. */
  update(dt: number, time: number, power: number, vacuum: number) {
    this.level += (power - this.level) * Math.min(1, dt * 6);
    this.mesh.visible = this.level > 0.01;
    this.uniforms.uTime.value = time;
    this.uniforms.uPower.value = this.level * (1 - vacuum * 0.45);
    const spread = 1.5 + vacuum * 3.2;
    this.uniforms.uSpread.value = spread;
    this.mesh.scale.set(this.radius, this.length * (0.75 + 0.25 * this.level) * (1 + vacuum * 0.5), this.radius);
  }
}

/** Soft round particles for smoke, exhaust trails and fireballs. */
export class Puffs {
  points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private grow: Float32Array;
  private cursor = 0;
  private uniforms: { uScale: { value: number }; uColor: { value: THREE.Color } };

  constructor(
    private capacity: number,
    color: THREE.ColorRepresentation,
    additive = false,
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity).fill(0);
    this.grow = new Float32Array(capacity);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 600 }, uColor: { value: new THREE.Color(color) } };
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: /* glsl */ `
          uniform float uScale;
          attribute float aSize;
          attribute float aAlpha;
          varying float vAlpha;
          void main() {
            vAlpha = aAlpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = min(512.0, aSize * uScale / max(1.0, -mv.z));
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            float a = smoothstep(1.0, 0.2, d) * vAlpha;
            if (a < 0.004) discard;
            gl_FragColor = vec4(uColor, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, grow = 1.5) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.size[i] = size;
    this.grow[i] = grow;
    this.age[i] = 0;
    this.life[i] = life;
  }

  /** `floor` keeps smoke above the ground. `scale` is the viewport height over 2·tan(fov/2). */
  update(dt: number, scale: number, opacity = 0.5, floor = -Infinity) {
    this.uniforms.uScale.value = scale;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.age[i] += dt;
      const k = this.age[i] / this.life[i];
      if (k >= 1) {
        this.life[i] = 0;
        this.alpha[i] = 0;
        continue;
      }
      const j = i * 3;
      const slow = Math.exp(-dt * 0.9);
      this.vel[j] *= slow;
      this.vel[j + 1] *= slow;
      this.vel[j + 2] *= slow;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] = Math.max(floor, this.pos[j + 1] + this.vel[j + 1] * dt);
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] += this.grow[i] * dt * this.size[i] * 0.5;
      this.alpha[i] = opacity * Math.min(1, k * 8) * (1 - k) * (1 - k);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
  }
}

/** The daytime sky around the launch site; it thins out to black as the rocket climbs. */
export function makeSky(): { mesh: THREE.Mesh; set(sun: THREE.Vector3, density: number, dusk?: number): void } {
  const uniforms = { uSun: { value: new THREE.Vector3(0, 1, 0) }, uDensity: { value: 1 }, uDusk: { value: 0 } };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(60_000, 32, 20),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          // Follow the camera: the sky has no parallax.
          vec4 mv = viewMatrix * vec4(position + cameraPosition, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun;
        uniform float uDensity;
        uniform float uDusk;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          // Dusk swaps the daytime blues for a deep night zenith over a burning horizon.
          vec3 zenith = mix(vec3(0.06, 0.2, 0.55), vec3(0.012, 0.02, 0.07), uDusk);
          vec3 horizon = mix(vec3(0.6, 0.73, 0.88), mix(vec3(0.95, 0.42, 0.16), vec3(0.35, 0.22, 0.45), smoothstep(0.0, 0.25, h)), uDusk);
          vec3 col = mix(horizon, zenith, pow(h, 0.42));
          // High up the pale haze is below you: what is left of the sky is a deep blue.
          col = mix(vec3(0.03, 0.1, 0.36), col, smoothstep(0.0, 0.7, uDensity));
          float s = max(dot(d, uSun), 0.0);
          col += vec3(1.0, 0.85, 0.6) * (pow(s, 24.0) * 0.35 + pow(s, 900.0) * 3.0);
          // Thin air first darkens overhead; the horizon keeps its glow longest.
          float a = clamp(uDensity * mix(1.0, 1.8, 1.0 - h), 0.0, 1.0) * smoothstep(-0.2, 0.0, d.y);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh,
    set(sun, density, dusk = 0) {
      uniforms.uSun.value.copy(sun);
      uniforms.uDensity.value = density;
      uniforms.uDusk.value = dusk;
    },
  };
}


// ---- the launch site ------------------------------------------------------------

/** Small deterministic noise, so the coast is the same every launch. */
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < 5; i++) {
    sum += amp * noise(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}
const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Where the beach is: the sea lies to +X, downrange, where rockets fly. */
const shoreX = (z: number) => 2600 + 260 * Math.sin(z * 0.0011) + 90 * Math.sin(z * 0.0037 + 1.3);
/** The assembly building at the far end of the crawler road. */
const VAB = { x: -1700, z: -60, w: 160, h: 160, d: 120 };

/**
 * Height of the ground (m) at a point near the launch site: flat around the pad, rolling
 * hills inland, a beach and then the sea floor downrange.
 */
export function groundHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  // Flat around the pad, the assembly building and along the crawler road between them.
  const road = x < 0 && x > VAB.x ? ss(30, 160, Math.abs(z - VAB.z * (x / VAB.x))) : 1;
  const flat = ss(380, 1400, r) * ss(260, 700, Math.hypot(x - VAB.x, z - VAB.z)) * road;
  const sx = shoreX(z);
  const inland = ss(-40, 700, sx - x);
  const hills = (fbm(x * 0.00055 + 3.1, z * 0.00055 - 1.7) - 0.35) * 260 * ss(1500, 6000, r);
  const bumps = (fbm(x * 0.004, z * 0.004) - 0.5) * 6;
  const land = Math.max(0.6, hills + 4) * inland + bumps * inland;
  const seabed = -10 * ss(-80, 600, x - sx);
  return land * flat + (1 - flat) * 0.6 * inland + seabed;
}

function groundColour(x: number, z: number, h: number, out: THREE.Color): THREE.Color {
  const sx = shoreX(z);
  const forest = fbm(x * 0.0016 + 9, z * 0.0016 - 4);
  const tint = fbm(x * 0.006, z * 0.006);
  // Grass, darker under woods, paler and drier on the hilltops.
  out.setRGB(0.2 + tint * 0.08, 0.29 + tint * 0.07, 0.13 + tint * 0.04);
  if (forest > 0.52) out.lerp(new THREE.Color(0.08, 0.15, 0.07), ss(0.52, 0.62, forest));
  if (h > 40) out.lerp(new THREE.Color(0.42, 0.4, 0.31), ss(40, 140, h) * 0.7);
  // Beach and wet sand along the shore.
  const toShore = sx - x;
  if (toShore < 160) out.lerp(new THREE.Color(0.72, 0.66, 0.5), ss(160, 40, toShore));
  if (toShore < 0) out.lerp(new THREE.Color(0.32, 0.36, 0.33), ss(0, -120, toShore));
  // Concrete: the pad apron and the crawler road to the assembly building.
  const r = Math.hypot(x, z);
  if (r < 90) out.setRGB(0.46, 0.46, 0.45);
  else if (r < 140) out.lerp(new THREE.Color(0.38, 0.38, 0.36), ss(140, 90, r));
  if (x < -60 && x > VAB.x && Math.abs(z - (VAB.z * (x / VAB.x))) < 16) out.setRGB(0.5, 0.48, 0.44);
  if (Math.hypot(x - VAB.x, z - VAB.z) < 180) out.lerp(new THREE.Color(0.44, 0.44, 0.42), 0.85);
  return out;
}

/**
 * The ground around the launch site: rolling land with woods, a beach and the sea downrange,
 * the assembly building at the end of the road, and the same coast faded out to the horizon.
 * Every material is transparent so the whole thing can fade as the rocket climbs.
 */
export function makeGround(): THREE.Group {
  const group = new THREE.Group();
  const SIZE = 16000;
  const SEG = 220;

  // Land.
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colours = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const farLand = new THREE.Color(0.22, 0.31, 0.14);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    groundColour(x, z, h, c);
    // The edges sink and fade into the far disc, so the land has no visible rim.
    const edge = ss(SIZE * 0.36, SIZE * 0.5, Math.max(Math.abs(x), Math.abs(z)));
    pos.setY(i, h + (-12 - h) * edge);
    c.lerp(x > shoreX(z) ? new THREE.Color(0.03, 0.12, 0.19) : farLand, edge);
    colours.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, transparent: true }));
  land.receiveShadow = true;
  land.name = 'land';

  // Sea: dark, smooth enough to catch the Sun. A disc out to the horizon, opaque east of the
  // coast and fading at the rim, so it has no straight edges anywhere.
  const SEA_R = 60_000;
  const coastPx = (x: number) => ((x / SEA_R + 1) / 2) * 512;
  const mask = document.createElement('canvas');
  mask.width = mask.height = 512;
  const mg = mask.getContext('2d')!;
  mg.fillStyle = '#000';
  mg.fillRect(0, 0, 512, 512);
  const coast = mg.createLinearGradient(coastPx(2200), 0, coastPx(2900), 0);
  coast.addColorStop(0, '#000');
  coast.addColorStop(1, '#fff');
  mg.fillStyle = coast;
  mg.fillRect(coastPx(2200), 0, 512 - coastPx(2200), 512);
  const seaRim = mg.createRadialGradient(256, 256, 150, 256, 256, 256);
  seaRim.addColorStop(0, 'rgba(0,0,0,0)');
  seaRim.addColorStop(1, 'rgba(0,0,0,1)');
  mg.fillStyle = seaRim;
  mg.fillRect(0, 0, 512, 512);
  const seaMask = new THREE.CanvasTexture(mask);
  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(SEA_R, 96).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0.03, 0.12, 0.19), roughness: 0.16, metalness: 0.05, transparent: true, alphaMap: seaMask, depthWrite: false }),
  );
  sea.position.y = -0.4;
  // Drawn after the land: the sea covers the sea floor but not the beach.
  sea.renderOrder = 1;
  sea.receiveShadow = true;

  // Woods: cones scattered where the noise says forest, never on the pad, the road or the beach.
  const tree = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
  const COUNT = 2600;
  const woods = new THREE.InstancedMesh(tree, new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, transparent: true }), COUNT);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  let n = 0;
  let k = 0;
  while (n < COUNT && k < COUNT * 30) {
    k++;
    const a = hash(k, 1.7) * Math.PI * 2;
    const r = 420 + Math.pow(hash(k, 8.3), 0.7) * 6400;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (x > shoreX(z) - 180) continue;
    if (x < 0 && x > VAB.x - 200 && Math.abs(z) < 120) continue;
    if (Math.hypot(x - VAB.x, z - VAB.z) < 320) continue;
    const forest = fbm(x * 0.0016 + 9, z * 0.0016 - 4);
    if (forest < 0.47 && hash(k, 3.3) > 0.06) continue;
    const h = 8 + hash(k, 5.1) * 9;
    p.set(x, groundHeight(x, z) - 0.5, z);
    sc.set(2.6 + hash(k, 6.7) * 2.2, h, 2.6 + hash(k, 6.7) * 2.2);
    m.compose(p, q, sc);
    woods.setMatrixAt(n, m);
    woods.setColorAt(n, c.setRGB(0.07 + hash(k, 2.2) * 0.05, 0.16 + hash(k, 4.4) * 0.07, 0.07 + hash(k, 9.9) * 0.03));
    n++;
  }
  woods.count = n;
  woods.instanceMatrix.needsUpdate = true;
  if (woods.instanceColor) woods.instanceColor.needsUpdate = true;

  // The assembly building and a few hangars: they give the rocket its scale.
  const concrete = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.62, 0.62, 0.6), roughness: 0.85, transparent: true });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.08, 0.09, 0.11), roughness: 0.7, transparent: true });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), mat);
    b.position.set(x, y, z);
    b.castShadow = true;
    b.receiveShadow = true;
    return b;
  };
  const buildings = new THREE.Group();
  const vy = groundHeight(VAB.x, VAB.z);
  buildings.add(box(VAB.w, VAB.h, VAB.d, concrete, VAB.x, vy, VAB.z));
  buildings.add(box(VAB.w * 0.62, VAB.h * 0.55, VAB.d * 1.5, concrete, VAB.x - 40, vy, VAB.z));
  // The tall doors face the pad.
  buildings.add(box(2, VAB.h * 0.86, 34, dark, VAB.x + VAB.w / 2 + 0.6, vy, VAB.z - 22));
  buildings.add(box(2, VAB.h * 0.86, 34, dark, VAB.x + VAB.w / 2 + 0.6, vy, VAB.z + 22));
  for (const [x, z, w, d] of [
    [-760, -220, 70, 40],
    [-820, 240, 90, 36],
    [-1180, 260, 50, 50],
    [-420, 520, 40, 28],
  ] as const) {
    buildings.add(box(w, 14 + (Math.abs(x) % 9), d, concrete, x, groundHeight(x, z), z));
  }

  // The same coast out to the horizon, without the detail.
  const wide = document.createElement('canvas');
  wide.width = wide.height = 256;
  const w = wide.getContext('2d')!;
  // The same colours as the near land and sea (sRGB of their linear values).
  w.fillStyle = '#829769';
  w.fillRect(0, 0, 256, 256);
  w.fillStyle = '#306179';
  w.fillRect(133, 0, 123, 256);
  const rim = w.createRadialGradient(128, 128, 70, 128, 128, 128);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(0,0,0,1)');
  w.globalCompositeOperation = 'destination-out';
  w.fillStyle = rim;
  w.fillRect(0, 0, 256, 256);
  const wideTex = new THREE.CanvasTexture(wide);
  wideTex.colorSpace = THREE.SRGBColorSpace;
  const far = new THREE.Mesh(new THREE.CircleGeometry(60_000, 64), new THREE.MeshLambertMaterial({ map: wideTex, transparent: true, depthWrite: false }));
  far.rotation.x = -Math.PI / 2;
  far.position.y = -12;
  far.renderOrder = -6;

  group.add(far, sea, land, woods, buildings);
  return group;
}

/**
 * A layer of fair-weather cumulus a couple of kilometres up, thicker downrange: the rocket
 * climbs through it, which is what makes the speed readable. Lit from the Sun's side.
 */
export function makeClouds(): { points: THREE.Points; update(scale: number, sun: THREE.Vector3, opacity: number): void } {
  const CLUSTERS = 70;
  const PER = 11;
  const pos = new Float32Array(CLUSTERS * PER * 3);
  const size = new Float32Array(CLUSTERS * PER);
  const shade = new Float32Array(CLUSTERS * PER);
  let i = 0;
  for (let c = 0; c < CLUSTERS; c++) {
    const a = hash(c, 0.5) * Math.PI * 2;
    const r = 1500 + hash(c, 1.5) * 26_000;
    // More cloud over the sea, where the rocket goes.
    const cx = Math.cos(a) * r * 0.8 + 5000 * hash(c, 2.5);
    const cz = Math.sin(a) * r;
    const cy = 1900 + hash(c, 3.5) * 900;
    const spread = 300 + hash(c, 4.5) * 500;
    for (let j = 0; j < PER; j++) {
      const k = c * 31 + j;
      const ox = (hash(k, 7.1) - 0.5) * spread * 2;
      const oz = (hash(k, 8.1) - 0.5) * spread * 1.4;
      const oy = (hash(k, 9.1) - 0.3) * spread * 0.35;
      pos.set([cx + ox, cy + oy, cz + oz], i * 3);
      size[i] = 260 + hash(k, 10.1) * 420;
      // Tops are lit, bases are grey.
      shade[i] = 0.55 + 0.45 * Math.min(1, Math.max(0, (oy / (spread * 0.35) + 0.3)));
      i++;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
  const uniforms = { uScale: { value: 600 }, uOpacity: { value: 1 }, uSun: { value: new THREE.Vector3(0, 1, 0) } };
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uScale;
        attribute float aSize;
        attribute float aShade;
        varying float vShade;
        varying float vFar;
        void main() {
          vShade = aShade;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vFar = clamp(-mv.z / 40000.0, 0.0, 1.0);
          gl_PointSize = min(900.0, aSize * uScale / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        uniform vec3 uSun;
        varying float vShade;
        varying float vFar;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float d = length(q) * 2.0;
          float a = smoothstep(1.0, 0.15, d);
          if (a < 0.01) discard;
          // The side towards the Sun is bright; the rest is the grey of a cloud's belly.
          float lit = clamp(0.5 + dot(normalize(vec3(q.x, -q.y, 0.35)), normalize(uSun)) * 0.5, 0.0, 1.0);
          float sunUp = clamp(uSun.y * 2.0 + 0.2, 0.0, 1.0);
          vec3 base = mix(vec3(0.55, 0.58, 0.64), vec3(1.0, 0.98, 0.94), lit * vShade);
          vec3 col = mix(base * vec3(1.0, 0.7, 0.5), base, sunUp);
          col = mix(col, vec3(0.62, 0.72, 0.86), vFar * 0.7);
          gl_FragColor = vec4(col, a * uOpacity * 0.85);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  points.frustumCulled = false;
  points.renderOrder = 2;
  return {
    points,
    update(scale, sun, opacity) {
      uniforms.uScale.value = scale;
      uniforms.uSun.value.copy(sun);
      uniforms.uOpacity.value = opacity;
      points.visible = opacity > 0.01;
    },
  };
}

/** The sky's colour at the horizon for a given air density, matching makeSky: used for haze. */
export function horizonColour(density: number, out: THREE.Color): THREE.Color {
  const day = new THREE.Color(0.6, 0.73, 0.88);
  const thin = new THREE.Color(0.03, 0.1, 0.36);
  return out.copy(thin).lerp(day, ss(0, 0.7, density));
}
