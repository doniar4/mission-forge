import * as THREE from 'three';
import { take, type Assets } from './assets';
import { Plume } from './fx';

/** Body diameter of each launch vehicle, metres (matches tools/blender/build_rockets.py). */
const DIAMETER: Record<string, number> = { kolibri: 1.2, vector: 2.2, rideshare: 3.4, atlant: 3.7, titan: 4.6 };

export interface Rocket {
  root: THREE.Group;
  s1: THREE.Object3D;
  s2: THREE.Object3D;
  fairings: THREE.Object3D[];
  boosters: THREE.Object3D[];
  height: number;
  diameter: number;
  /** Width of everything standing on the pad, boosters included. */
  baseWidth: number;
  /** Height of the payload adapter: where the spacecraft sits. */
  payloadY: number;
  fairingRadius: number;
  fairingHeight: number;
  /** Where the second stage begins. */
  stage2Y: number;
  corePlume: Plume;
  boosterPlumes: Plume[];
  upperPlume: Plume;
}

export function buildRocket(vehicleId: string, assets: Assets): Rocket {
  const id = assets.rockets.has(vehicleId) ? vehicleId : 'atlant';
  const root = take(assets.rockets, id) as THREE.Group;
  const child = (suffix: string) => root.children.find((c) => c.name === `${id}_${suffix}`);
  const s1 = child('s1')!;
  const s2 = child('s2')!;
  const fairings = [child('fair_a')!, child('fair_b')!];
  const boosters = root.children.filter((c) => /_b\d+$/.test(c.name));
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const fairBox = new THREE.Box3().setFromObject(fairings[0]).union(new THREE.Box3().setFromObject(fairings[1]));
  const diameter = DIAMETER[id] ?? 3;
  const height = box.max.y;
  const stage2Y = s2.position.y;
  const payloadY = fairings[0].position.y;

  const corePlume = new Plume(diameter * 0.42, diameter * 7);
  s1.add(corePlume.mesh);
  const boosterPlumes = boosters.map((b) => {
    const bb = new THREE.Box3().setFromObject(b);
    const p = new Plume((bb.max.x - bb.min.x) * 0.3, diameter * 5.5, '#ffb070');
    b.add(p.mesh);
    return p;
  });
  // The upper engine burns in vacuum: a wide, faint, bluish plume.
  const upperPlume = new Plume(diameter * 0.22, diameter * 3.2, '#9fc4ff');
  const s2Box = new THREE.Box3().setFromObject(s2);
  upperPlume.mesh.position.y = s2Box.min.y - stage2Y;
  s2.add(upperPlume.mesh);

  return {
    root,
    s1,
    s2,
    fairings,
    boosters,
    height,
    diameter,
    baseWidth: box.max.x - box.min.x,
    payloadY: payloadY + 0.16 * (fairBox.max.x - fairBox.min.x),
    fairingRadius: (fairBox.max.x - fairBox.min.x) / 2,
    fairingHeight: fairBox.max.y - fairBox.min.y,
    stage2Y,
    corePlume,
    boosterPlumes,
    upperPlume,
  };
}

/** The launch complex, sized to the rocket standing on it. The rocket's base goes at `mountTop`. */
export function buildPad(rocket: Rocket, assets: Assets): { group: THREE.Group; mountTop: number; arms: THREE.Object3D[] } {
  const group = new THREE.Group();
  const pad = (name: string) => take(assets.pad, name);
  group.add(pad('pad_base'));

  const mountScale = Math.max(3, rocket.baseWidth * 0.62);
  const mount = pad('pad_mount');
  mount.scale.setScalar(mountScale);
  group.add(mount);
  const mountTop = 0.5 * mountScale;

  // The service tower stands on the side the rocket flies away from.
  const towerX = -(rocket.baseWidth / 2 + 6.5);
  const bays = Math.max(3, Math.round(((rocket.height + mountTop) * 0.92) / 4));
  for (let i = 0; i < bays; i++) {
    const bay = pad('tower_seg');
    bay.position.set(towerX, i * 4, 0);
    group.add(bay);
  }
  const top = pad('tower_top');
  top.position.set(towerX, bays * 4, 0);
  group.add(top);

  const arms: THREE.Object3D[] = [];
  for (const share of [0.42, 0.82]) {
    const pivot = new THREE.Group();
    pivot.position.set(towerX + 2, mountTop + rocket.height * share, 0);
    const arm = pad('tower_arm');
    arm.scale.set(Math.max(1, -towerX - 2 - rocket.diameter / 2), 1, 1);
    pivot.add(arm);
    group.add(pivot);
    arms.push(pivot);
  }

  const mastScale = ((rocket.height + mountTop) * 1.3) / 60;
  for (const [x, z] of [[-24, -24], [24, -24], [-24, 24]]) {
    const mast = pad('mast');
    mast.scale.setScalar(Math.max(0.5, mastScale));
    mast.position.set(x, 0, z);
    group.add(mast);
  }
  const sphere = pad('tank_sphere');
  sphere.position.set(-46, 0, 30);
  const tankA = pad('tank_cyl');
  tankA.position.set(-48, 0, -10);
  tankA.rotation.y = Math.PI / 2;
  const tankB = pad('tank_cyl');
  tankB.position.set(-56, 0, -10);
  tankB.rotation.y = Math.PI / 2;
  const bunker = pad('bunker');
  bunker.position.set(-70, 0, 60);
  bunker.rotation.y = 0.6;
  group.add(sphere, tankA, tankB, bunker);
  for (const [x, z, turn] of [[-30, 34, -0.85], [-30, -34, 0.85]] as const) {
    const light = pad('floodlight');
    light.position.set(x, 0, z);
    light.rotation.y = turn;
    group.add(light);
  }
  return { group, mountTop, arms };
}
