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
export function makeSky(): { mesh: THREE.Mesh; set(sun: THREE.Vector3, density: number): void } {
  const uniforms = { uSun: { value: new THREE.Vector3(0, 1, 0) }, uDensity: { value: 1 } };
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
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 zenith = vec3(0.06, 0.2, 0.55);
          vec3 horizon = vec3(0.6, 0.73, 0.88);
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
    set(sun, density) {
      uniforms.uSun.value.copy(sun);
      uniforms.uDensity.value = density;
    },
  };
}

/** The ground around the launch site: a coast, with the sea to the east where the rocket flies. */
export function makeGround(): THREE.Group {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5d6f52';
  g.fillRect(0, 0, 1024, 1024);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * 1024;
    const y = rnd() * 1024;
    const r = 6 + rnd() * 34;
    g.fillStyle = `rgba(${60 + rnd() * 60},${90 + rnd() * 40},${50 + rnd() * 30},0.22)`;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.5 + rnd() * 0.6), rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // Sea on the +X side, behind a wavy shoreline and a strip of sand.
  const shore = (y: number) => 640 + Math.sin(y * 0.011) * 26 + Math.sin(y * 0.037) * 9;
  for (const [offset, colour] of [[-14, '#b9ad8c'], [0, '#2b6f86'], [22, '#1c5574'], [70, '#17456a']] as const) {
    g.fillStyle = colour;
    g.beginPath();
    g.moveTo(1024, 0);
    for (let y = 0; y <= 1024; y += 16) g.lineTo(shore(y) + offset, y);
    g.lineTo(1024, 1024);
    g.closePath();
    g.fill();
  }
  // The apron and the road to it.
  g.fillStyle = '#8b9199';
  g.fillRect(506, 506, 12, 12);
  g.fillRect(300, 510, 212, 3);
  // Fade to nothing at the rim so the disc melts into the horizon.
  const fade = g.createRadialGradient(512, 512, 300, 512, 512, 512);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = fade;
  g.fillRect(0, 0, 1024, 1024);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const near = new THREE.Mesh(new THREE.CircleGeometry(4000, 64), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }));
  near.rotation.x = -Math.PI / 2;
  near.position.y = 0.2;
  near.renderOrder = -5;

  // The same coast out to the horizon, without the detail.
  const wide = document.createElement('canvas');
  wide.width = wide.height = 256;
  const w = wide.getContext('2d')!;
  w.fillStyle = '#5d6f52';
  w.fillRect(0, 0, 256, 256);
  w.fillStyle = '#17456a';
  w.fillRect(132, 0, 124, 256);
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
  far.renderOrder = -6;

  const group = new THREE.Group();
  group.add(far, near);
  return group;
}
