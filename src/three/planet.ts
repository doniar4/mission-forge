import * as THREE from 'three';
import { feature } from 'topojson-client';
import landTopology from 'world-atlas/land-110m.json';

/*
 * Planets are drawn by shaders, not photographs: Earth's real coastlines come from the
 * public-domain Natural Earth outline (world-atlas), everything else is procedural noise.
 * Distances in the "far" scene are in megametres (1 unit = 1000 km).
 */

export type BodyId = 'earth' | 'moon' | 'mars';
export const BODY_RADIUS: Record<BodyId, number> = { earth: 6.371, moon: 1.737, mars: 3.39 };

const NOISE = /* glsl */ `
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.3);
    a *= 0.5;
  }
  return s;
}
float fbm3(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.3);
    a *= 0.5;
  }
  return s;
}
`;

const VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUv;
void main() {
  vUv = uv;
  vObj = normalize(position);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const HEAD = /* glsl */ `
uniform vec3 uSun;
uniform float uTime;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUv;
${NOISE}
`;

const TAIL = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const EARTH_FRAG = /* glsl */ `
uniform sampler2D uLand;
uniform sampler2D uCover;
uniform float uCoverOn;
${HEAD}
void main() {
  vec3 n = normalize(vNormalW);
  vec3 p = normalize(vObj);
  vec3 v = normalize(cameraPosition - vPosW);
  float lat = abs(p.y);

  // The outline is coarse; warping the lookup with noise gives coasts that hold up from low orbit.
  float w = fbm3(p * 26.0) - 0.5;
  float mask = texture2D(uLand, vUv + vec2(w, w * 0.6) * 0.01).r;
  float land = smoothstep(0.4, 0.6, mask + (fbm3(p * 110.0) - 0.5) * 0.3);

  float n1 = fbm(p * 5.0 + 11.0);
  float n2 = fbm(p * 46.0 + 3.1);
  vec3 forest = vec3(0.045, 0.16, 0.06);
  vec3 grass = vec3(0.17, 0.27, 0.09);
  vec3 desert = vec3(0.56, 0.44, 0.27);
  vec3 tundra = vec3(0.3, 0.31, 0.25);
  float arid = smoothstep(0.14, 0.3, lat) * (1.0 - smoothstep(0.44, 0.6, lat)) * smoothstep(0.44, 0.6, n1);
  vec3 landCol = mix(forest, grass, n2);
  landCol = mix(landCol, desert, arid);
  landCol = mix(landCol, tundra, smoothstep(0.8, 0.92, lat + (n1 - 0.5) * 0.12));
  // Sea ice near the poles; snow on land from about 65 degrees.
  float ice = smoothstep(0.955, 0.985, lat + (n2 - 0.5) * 0.03) + land * smoothstep(0.9, 0.955, lat + (n1 - 0.5) * 0.06);
  // Seen from close by, the ground needs grain and a hint of relief, lit from the Sun's side.
  float near = smoothstep(0.004, 0.0006, length(fwidth(p)));
  if (near > 0.01 && land > 0.01) {
    float grain = fbm3(p * 420.0);
    float relief = (fbm3((p + uSun * 0.0012) * 150.0) - fbm3(p * 150.0)) * 4.5;
    landCol *= 1.0 + near * ((grain - 0.5) * 0.3 + relief);
  }
  vec3 ocean = mix(vec3(0.008, 0.04, 0.16), vec3(0.015, 0.11, 0.28), n1);
  ocean = mix(ocean, vec3(0.03, 0.2, 0.3), smoothstep(0.3, 0.5, mask) * (1.0 - land) * 0.55);
  vec3 col = mix(ocean, landCol, land);
  col = mix(col, vec3(0.9, 0.94, 0.98), clamp(ice, 0.0, 1.0));

  // Where the instruments have looked so far.
  vec4 cover = texture2D(uCover, vUv);
  col = mix(col, vec3(1.0, 0.72, 0.2), cover.a * 0.38 * uCoverOn);

  float c = fbm(p * 4.6 + vec3(uTime * 0.006, 0.0, uTime * 0.004));
  c = smoothstep(0.56, 0.8, c + (fbm3(p * 24.0 + uTime * 0.01) - 0.5) * 0.4) * (0.55 + 0.45 * smoothstep(0.35, 0.65, fbm3(p * 70.0)));

  float ndl = dot(n, uSun);
  float day = smoothstep(-0.1, 0.22, ndl);
  vec3 lit = col * (0.02 + 0.95 * max(ndl, 0.0));
  vec3 h = normalize(v + uSun);
  lit += (1.0 - land) * (1.0 - c) * pow(max(dot(n, h), 0.0), 80.0) * 0.8 * vec3(1.0, 0.94, 0.82) * day;
  lit = mix(lit, vec3(0.92, 0.94, 0.97) * (0.03 + 0.95 * max(ndl, 0.0)), c * 0.9);

  // Cities: broad populated regions, broken into fine points of light when seen from low orbit.
  if (day < 0.99 && land > 0.01) {
    float towns = smoothstep(0.6, 0.78, fbm3(p * 80.0 + 40.0));
    float sparks = near > 0.01 ? smoothstep(0.5, 0.72, fbm3(p * 28.0 + 40.0)) * smoothstep(0.58, 0.8, fbm3(p * 900.0)) * 1.6 : 0.0;
    float cities = land * (1.0 - arid) * (1.0 - clamp(ice, 0.0, 1.0)) * mix(towns, sparks, near);
    lit += (1.0 - day) * cities * (1.0 - c) * vec3(1.0, 0.7, 0.34) * 0.55;
  }

  // Air scatters blue light towards the camera, most of all along the limb.
  float rim = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  lit += rim * day * vec3(0.2, 0.46, 1.0) * 0.55;
  // A red band where sunlight skims the atmosphere.
  lit += rim * smoothstep(-0.16, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.2, ndl)) * vec3(1.0, 0.35, 0.12) * 0.5;

  gl_FragColor = vec4(lit, 1.0);
${TAIL}`;

const MOON_FRAG = /* glsl */ `
${HEAD}
float craters(vec3 p, float scale) {
  vec3 q = p * scale;
  vec3 i = floor(q);
  vec3 f = fract(q);
  float d = 1.0;
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
      for (int z = -1; z <= 1; z++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 o = vec3(hash(i + g), hash(i + g + 7.3), hash(i + g + 13.7));
        d = min(d, length(g + o - f));
      }
  // A dark bowl with a bright rim.
  return smoothstep(0.34, 0.26, d) * -0.22 + smoothstep(0.05, 0.0, abs(d - 0.32)) * 0.16;
}
void main() {
  vec3 n = normalize(vNormalW);
  vec3 p = normalize(vObj);
  float base = fbm(p * 3.2);
  vec3 col = mix(vec3(0.34), vec3(0.6), base);
  float mare = smoothstep(0.5, 0.62, fbm(p * 1.5 + 7.0));
  col = mix(col, vec3(0.17, 0.17, 0.19), mare * 0.8);
  float relief = craters(p, 7.0) + craters(p + 3.1, 17.0) * 0.7 + craters(p + 9.4, 40.0) * 0.45;
  col *= 1.0 + relief;
  col *= 0.9 + 0.2 * fbm3(p * 60.0);
  // Permanently shadowed craters near the poles: where the ice is.
  col = mix(col, col * 0.55, smoothstep(0.9, 0.99, abs(p.y)) * smoothstep(0.45, 0.6, fbm3(p * 30.0)));
  float ndl = dot(n, uSun);
  vec3 lit = col * (0.035 + 1.25 * max(ndl, 0.0));
  gl_FragColor = vec4(lit, 1.0);
${TAIL}`;

const MARS_FRAG = /* glsl */ `
${HEAD}
void main() {
  vec3 n = normalize(vNormalW);
  vec3 p = normalize(vObj);
  vec3 v = normalize(cameraPosition - vPosW);
  float n1 = fbm(p * 3.0 + 2.0);
  float n2 = fbm(p * 18.0);
  vec3 col = mix(vec3(0.4, 0.15, 0.07), vec3(0.64, 0.31, 0.14), n1);
  col = mix(col, vec3(0.2, 0.1, 0.07), smoothstep(0.52, 0.66, fbm(p * 1.8 + 5.0)) * 0.75);
  col *= 0.82 + 0.36 * n2;
  // A canyon system near the equator.
  float canyon = smoothstep(0.035, 0.0, abs(p.y + 0.12 + (fbm3(p * 5.0) - 0.5) * 0.12)) * smoothstep(0.2, 0.7, p.x);
  col = mix(col, vec3(0.2, 0.1, 0.07), canyon * 0.6);
  float cap = smoothstep(0.955, 0.98, abs(p.y) + (n2 - 0.5) * 0.04);
  col = mix(col, vec3(0.93, 0.92, 0.9), cap);
  // Dust storms drift across the surface.
  float dust = smoothstep(0.58, 0.8, fbm(p * 2.4 + vec3(uTime * 0.01, 0.0, 0.0)));
  col = mix(col, vec3(0.7, 0.42, 0.24), dust * 0.4);
  float ndl = dot(n, uSun);
  vec3 lit = col * (0.03 + 1.05 * max(ndl, 0.0));
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  lit += rim * smoothstep(-0.1, 0.2, ndl) * vec3(0.8, 0.45, 0.28) * 0.18;
  gl_FragColor = vec4(lit, 1.0);
${TAIL}`;

const GLOW_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uColor;
uniform float uPower;
uniform float uLimb;
uniform float uInner;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vPosW);
  // Brightest where the line of sight grazes the surface, fading out to the top of the air.
  float edge = pow(clamp(-dot(n, v) / uLimb, 0.0, 1.0), uPower);
  float day = smoothstep(-0.25, 0.35, dot(n, uSun));
  // Seen from inside the shell this trick breaks down, so it fades away there.
  float outside = smoothstep(uInner, uInner * 1.012, length(cameraPosition - (vPosW - n * uInner)));
  edge *= outside;
  gl_FragColor = vec4(uColor * edge * day, edge * day);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Earth's land as a black-and-white equirectangular image, drawn from the Natural Earth outline. */
function landTexture(): THREE.Texture {
  const W = 2048;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff';
  type Ring = [number, number][];
  const geo = feature(landTopology as never, (landTopology as unknown as { objects: { land: never } }).objects.land) as unknown as {
    features?: { geometry: { type: string; coordinates: Ring[][] | Ring[] } }[];
    geometry?: { type: string; coordinates: Ring[][] | Ring[] };
  };
  const geoms = geo.features ? geo.features.map((f) => f.geometry) : geo.geometry ? [geo.geometry] : [];
  for (const geom of geoms) {
    const polys = (geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]) as Ring[][];
    for (const poly of polys) {
      g.beginPath();
      for (const ring of poly) {
        ring.forEach(([lon, lat], i) => {
          const x = ((lon + 180) / 360) * W;
          const y = ((90 - lat) / 180) * H;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        });
        g.closePath();
      }
      g.fill('evenodd');
    }
  }
  // A soft edge lets the shader place the coast with sub-pixel noise.
  g.filter = 'blur(1.5px)';
  g.drawImage(c, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export interface Planet {
  body: BodyId;
  radius: number;
  /** Holds the globe and its halo; rotate `globe` to spin the planet. */
  group: THREE.Group;
  globe: THREE.Mesh;
  /** Paint here (equirectangular, alpha = covered) to show where the instruments have looked. */
  cover: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture } | null;
  setSun(dir: THREE.Vector3): void;
  setTime(t: number): void;
  showCover(on: boolean): void;
}

let land: THREE.Texture | null = null;

export function makePlanet(body: BodyId): Planet {
  const radius = BODY_RADIUS[body];
  const sun = new THREE.Vector3(1, 0, 0);
  const uniforms: Record<string, THREE.IUniform> = { uSun: { value: sun }, uTime: { value: 0 } };
  let cover: Planet['cover'] = null;
  if (body === 'earth') {
    land ??= landTexture();
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    cover = { canvas, ctx: canvas.getContext('2d')!, texture };
    uniforms.uLand = { value: land };
    uniforms.uCover = { value: texture };
    uniforms.uCoverOn = { value: 0 };
  }
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 256, 128),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: body === 'earth' ? EARTH_FRAG : body === 'moon' ? MOON_FRAG : MARS_FRAG,
    }),
  );
  const group = new THREE.Group();
  group.add(globe);

  const halos: THREE.ShaderMaterial[] = [];
  if (body !== 'moon') {
    const shell = radius * (body === 'earth' ? 1.03 : 1.018);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSun: { value: sun },
        uColor: { value: body === 'earth' ? new THREE.Color(0.25, 0.52, 1.0) : new THREE.Color(0.3, 0.17, 0.11) },
        uPower: { value: body === 'earth' ? 2.0 : 3.0 },
        uLimb: { value: Math.sqrt(1 - (radius / shell) ** 2) },
        uInner: { value: shell },
      },
      vertexShader: VERT,
      fragmentShader: GLOW_FRAG,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    halos.push(mat);
    group.add(new THREE.Mesh(new THREE.SphereGeometry(shell, 128, 64), mat));
  }

  return {
    body,
    radius,
    group,
    globe,
    cover,
    setSun(dir) {
      sun.copy(dir).normalize();
    },
    setTime(t) {
      uniforms.uTime.value = t;
    },
    showCover(on) {
      if (uniforms.uCoverOn) uniforms.uCoverOn.value = on ? 1 : 0;
    },
  };
}

/** Unit vector for a latitude and longitude (degrees), matching the globe's texture mapping. */
export function latLon(lat: number, lon: number, out = new THREE.Vector3()): THREE.Vector3 {
  const la = THREE.MathUtils.degToRad(lat);
  const lo = THREE.MathUtils.degToRad(lon);
  return out.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
}

export function makeStars(count = 2600, radius = 900): THREE.Points {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  // A fixed pseudo-random field: the sky must look the same on every screen in a team game.
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const z = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    pos.set([r * Math.cos(a) * radius, z * radius, r * Math.sin(a) * radius], i * 3);
    const b = 0.35 + Math.pow(rnd(), 3) * 0.65;
    const warm = rnd();
    col.set([b * (0.85 + warm * 0.15), b * 0.9, b * (1.0 - warm * 0.2)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, depthWrite: false, transparent: true }));
}

export function makeSun(distance = 800): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.06, 'rgba(255,250,230,1)');
  grad.addColorStop(0.12, 'rgba(255,225,160,0.55)');
  grad.addColorStop(0.4, 'rgba(255,190,110,0.12)');
  grad.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  s.scale.setScalar(distance * 0.32);
  return s;
}
