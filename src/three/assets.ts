import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*
 * The models are generated in Blender by tools/blender/*.py and exported to public/models.
 * kit.glb     spacecraft parts, each standing on the origin and pointing up
 * rockets.glb one group per launch vehicle id, with stages, fairing halves and boosters as children
 * pad.glb     pieces of the launch complex
 */
export interface Assets {
  kit: Map<string, THREE.Object3D>;
  rockets: Map<string, THREE.Object3D>;
  pad: Map<string, THREE.Object3D>;
}

/** A grid of solar cells: the one texture in the game, drawn rather than downloaded. */
function cellTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7f8db3';
  g.fillRect(0, 0, 256, 256);
  const cols = 4;
  const rows = 6;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = (i * 256) / cols;
      const y = (j * 256) / rows;
      const shade = g.createLinearGradient(x, y, x + 64, y + 43);
      shade.addColorStop(0, '#1b3a86');
      shade.addColorStop(1, '#0f2459');
      g.fillStyle = shade;
      g.fillRect(x + 2, y + 2, 256 / cols - 4, 256 / rows - 4);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const shared = new Map<string, THREE.MeshStandardMaterial>();

function tune(m: THREE.MeshStandardMaterial) {
  switch (m.name) {
    case 'mf_cell':
      m.map = cellTexture();
      m.color.set('#ffffff');
      m.metalness = 0.1;
      m.roughness = 0.32;
      m.emissive.set('#0b1c4d');
      m.emissiveIntensity = 0.12;
      break;
    case 'mf_gold':
      m.envMapIntensity = 1.25;
      break;
    case 'mf_glow':
      m.emissiveIntensity = 2.2;
      break;
    case 'mf_lamp':
      m.emissiveIntensity = 3;
      break;
  }
}

/** All three files share one material per name, so a tweak applies everywhere. */
function adopt(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as THREE.MeshStandardMaterial;
    let s = shared.get(m.name);
    if (!s) {
      tune(m);
      shared.set(m.name, m);
      s = m;
    }
    mesh.material = s;
  });
}

function index(scene: THREE.Object3D): Map<string, THREE.Object3D> {
  const map = new Map<string, THREE.Object3D>();
  for (const child of [...scene.children]) {
    // In Blender the parts are laid out side by side; in the game each starts at the origin.
    child.position.set(0, 0, 0);
    child.removeFromParent();
    map.set(child.name, child);
  }
  return map;
}

let cache: Promise<Assets> | null = null;

export function loadAssets(): Promise<Assets> {
  if (!cache) {
    const loader = new GLTFLoader();
    const base = import.meta.env.BASE_URL;
    cache = Promise.all(['kit', 'rockets', 'pad'].map((n) => loader.loadAsync(`${base}models/${n}.glb`)))
      .then(([kit, rockets, pad]) => {
        for (const g of [kit, rockets, pad]) adopt(g.scene);
        const assets: Assets = { kit: index(kit.scene), rockets: index(rockets.scene), pad: index(pad.scene) };
        // Fairing halves are open shells: both sides must draw.
        for (const rocket of assets.rockets.values())
          rocket.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh && /_fair_/.test(mesh.name + (mesh.parent?.name ?? ''))) {
              const m = (mesh.material as THREE.MeshStandardMaterial).clone();
              m.side = THREE.DoubleSide;
              mesh.material = m;
            }
          });
        return assets;
      })
      .catch((e) => {
        cache = null;
        throw e;
      });
  }
  return cache;
}

/** A fresh copy of a model. Geometry and materials stay shared, so copies are cheap. */
export function take(map: Map<string, THREE.Object3D>, name: string): THREE.Object3D {
  const src = map.get(name);
  if (!src) throw new Error(`Model "${name}" is missing`);
  return src.clone();
}

let webgl: boolean | null = null;

/**
 * Asked once per page: every probe opens a real WebGL context, and browsers allow only a
 * handful at a time, so the probe releases its context straight away.
 */
export function webglAvailable(): boolean {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    webgl = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}
