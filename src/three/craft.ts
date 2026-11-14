import * as THREE from 'three';
import type { Design } from '../engine/types';
import { take, type Assets } from './assets';

/*
 * Builds the player's spacecraft from kit parts.
 * Body frame: +Z is the instrument deck (it looks at the target), +Y is the top deck with the
 * antennas, the engine fires out of -Y, and the solar wings run along X.
 */

/** Room each instrument needs on the deck, metres (width, height). */
const FOOT: Record<string, [number, number]> = {
  cam_wide: [0.26, 0.26],
  cam_hires: [0.72, 0.56],
  thermal_ir: [0.62, 0.42],
  multispec: [0.48, 0.42],
  altimeter: [1.0, 0.92],
  sounder: [0.44, 0.38],
  spectrometer: [0.4, 0.42],
  neutron: [0.28, 0.26],
  particles: [0.4, 0.28],
  coronagraph: [0.3, 0.3],
};

/** Panels per wing, panel length along the wing and panel width, metres. */
const WINGS: Record<string, [number, number, number]> = {
  small: [2, 0.55, 0.8],
  medium: [3, 0.8, 1.2],
  large: [4, 1.2, 1.9],
  xl: [6, 1.6, 2.6],
};

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export interface Craft {
  root: THREE.Group;
  /** Radius of a sphere around the deployed spacecraft, metres. */
  radius: number;
  size: THREE.Vector3;
  /** What each visible choice is made of, keyed like "power:medium" or "inst:sar". */
  tags: Map<string, THREE.Object3D[]>;
  /** Where the radio signal leaves, in the body frame. */
  antenna: THREE.Vector3;
  /** Where the engine exhaust leaves, in the body frame (null without an engine). */
  exhaust: THREE.Vector3 | null;
  /** 0 = arrays folded for launch, 1 = deployed. */
  setDeploy(t: number): void;
  /** Turns the wings so the cells face a direction given in the body frame. */
  trackSun(dir: THREE.Vector3): void;
  /** Points the dish along a direction given in the body frame. */
  aimDish(dir: THREE.Vector3): void;
}

export function buildCraft(design: Design, dryKg: number, assets: Assets): Craft {
  const root = new THREE.Group();
  const tags = new Map<string, THREE.Object3D[]>();
  const add = <T extends THREE.Object3D>(tag: string, o: T, parent: THREE.Object3D = root): T => {
    parent.add(o);
    if (!tags.has(tag)) tags.set(tag, []);
    tags.get(tag)!.push(o);
    return o;
  };
  const kit = (name: string) => take(assets.kit, name);

  // ---- how big the bus has to be ------------------------------------------
  const s = clamp(0.3 + 0.06 * Math.sqrt(Math.max(1, dryKg)), 0.6, 3.4);
  const gap = 0.06;
  const items = design.instruments
    .filter((id) => FOOT[id])
    .map((id) => ({ id, w: FOOT[id][0], h: FOOT[id][1] }))
    .sort((a, b) => b.h - a.h);
  const area = items.reduce((a, i) => a + i.w * i.h, 0);
  const target = Math.max(s, Math.sqrt(area) * 1.25, ...items.map((i) => i.w));
  const rows: { items: typeof items; w: number; h: number }[] = [];
  for (const it of items) {
    let row = rows[rows.length - 1];
    if (!row || row.w + gap + it.w > target + 1e-6) rows.push((row = { items: [], w: 0, h: 0 }));
    row.w += (row.items.length ? gap : 0) + it.w;
    row.h = Math.max(row.h, it.h);
    row.items.push(it);
  }
  const hasSar = design.instruments.includes('sar');
  const stackH = rows.reduce((a, r) => a + r.h, 0) + gap * Math.max(0, rows.length - 1) + (hasSar ? 1.0 + (rows.length ? gap : 0) : 0);
  const w = Math.max(s, ...rows.map((r) => r.w + 0.1));
  const h = Math.max(s * 1.12, stackH + 0.1);
  const d = s;

  // ---- bus -----------------------------------------------------------------
  const bus = add(`structure:${design.structure}`, kit('bus'));
  bus.scale.set(w, d, h);
  bus.rotation.x = -Math.PI / 2; // the dark deck of the model faces +Z
  if (design.redundancy === 'redundant') {
    const spare = add('redundancy', kit('spare'));
    spare.position.set(-w * 0.26, h / 2, d * 0.24);
  }

  // ---- instruments on the +Z deck -----------------------------------------
  let y = stackH / 2;
  for (const row of rows) {
    let x = -row.w / 2;
    for (const it of row.items) {
      const inst = add(`inst:${it.id}`, kit(`inst_${it.id}`));
      inst.rotation.x = Math.PI / 2;
      inst.position.set(x + it.w / 2, y - row.h / 2, d / 2);
      x += it.w + gap;
    }
    y -= row.h + gap;
  }
  if (hasSar) {
    const sar = add('inst:sar', kit('inst_sar'));
    sar.rotation.x = Math.PI / 2;
    sar.position.set(0, y - 0.5, d / 2);
  }
  if (design.instruments.includes('magnetometer')) {
    const boom = add('inst:magnetometer', kit('inst_magnetometer'));
    boom.position.set(-w / 2, h / 2, -d / 2);
    boom.quaternion.setFromUnitVectors(UP, new THREE.Vector3(-0.55, 0.62, -0.55).normalize());
  }

  // ---- power ----------------------------------------------------------------
  const hinges: { root: THREE.Group; track: THREE.Group; first: THREE.Group; rest: THREE.Group[]; side: 1 | -1 }[] = [];
  const wing = WINGS[design.power];
  if (wing) {
    const [n, len, width] = wing;
    for (const side of [1, -1] as const) {
      const wr = add(`power:${design.power}`, new THREE.Group());
      wr.position.set((side * w) / 2, 0, 0);
      if (side < 0) wr.rotation.y = Math.PI;
      const track = new THREE.Group();
      wr.add(track);
      const first = new THREE.Group();
      track.add(first);
      const yoke = kit('yoke');
      yoke.scale.setScalar(width);
      first.add(yoke);
      const rest: THREE.Group[] = [];
      let parent: THREE.Object3D = first;
      let offset = 0.4 * width;
      for (let i = 0; i < n; i++) {
        const hinge = new THREE.Group();
        hinge.position.x = offset;
        parent.add(hinge);
        const panel = kit('panel');
        panel.scale.set(len, 1, width);
        hinge.add(panel);
        rest.push(hinge);
        parent = hinge;
        offset = len;
      }
      hinges.push({ root: wr, track, first, rest, side });
    }
  } else if (design.power === 'body') {
    // position x, y, z; rotation x, z; scale x, z
    const faces: [number, number, number, number, number, number, number][] = [
      [w / 2, 0, 0, 0, -Math.PI / 2, h, d],
      [-w / 2, 0, 0, 0, Math.PI / 2, h, d],
      [0, 0, -d / 2, -Math.PI / 2, 0, w, h],
    ];
    for (const [px, py, pz, rx, rz, sx, sz] of faces) {
      const cells = add('power:body', kit('cells'));
      cells.position.set(px, py, pz);
      cells.rotation.set(rx, 0, rz);
      cells.scale.set(sx, 1, sz);
    }
  } else if (design.power === 'rtg') {
    const rtg = add('power:rtg', kit('rtg'));
    rtg.position.set(w / 2, -h * 0.15, -d * 0.1);
    rtg.quaternion.setFromUnitVectors(UP, new THREE.Vector3(1, -0.3, -0.25).normalize());
  }

  // ---- antennas on the top deck --------------------------------------------
  let dishPivot: THREE.Group | null = null;
  const top = h / 2;
  const commsTag = `comms:${design.comms}`;
  if (design.comms === 'uhf') {
    const a = add(commsTag, kit('ant_uhf'));
    a.scale.setScalar(clamp(s, 0.8, 1.6));
    a.position.set(0, top, 0);
  } else if (design.comms === 'sband') {
    const a = add(commsTag, kit('ant_sband'));
    a.scale.setScalar(clamp(s * 1.1, 1, 1.8));
    a.position.set(0, top, 0);
  } else if (design.comms === 'xband' || design.comms === 'kaband') {
    const big = design.comms === 'kaband';
    const mastScale = big ? 1.5 : 0.85;
    const mast = add(commsTag, kit('ant_mast'));
    mast.scale.setScalar(mastScale);
    mast.position.set(0, top, 0);
    dishPivot = add(commsTag, new THREE.Group());
    dishPivot.position.set(0, top + 0.64 * mastScale, 0);
    const dish = kit('dish');
    dish.scale.setScalar(big ? 1.6 : 0.75);
    dishPivot.add(dish);
  } else if (design.comms === 'laser') {
    const a = add(commsTag, kit('ant_laser'));
    a.scale.setScalar(1.3);
    a.position.set(0, top, 0);
  }

  // ---- attitude control ------------------------------------------------------
  const adcsTag = `adcs:${design.adcs}`;
  if (design.adcs === 'magnetic') {
    const t = add(adcsTag, kit('adcs_torquer'));
    t.position.set(w * 0.28, top, -d * 0.26);
  } else {
    const wheels = add(adcsTag, kit('adcs_wheels'));
    wheels.position.set(w * 0.28, top, -d * 0.26);
    if (design.adcs === 'precise') {
      const st = add(adcsTag, kit('adcs_startracker'));
      st.position.set(-w * 0.26, top, -d * 0.28);
    }
  }

  // ---- engine on the -Y deck -------------------------------------------------
  let exhaust: THREE.Vector3 | null = null;
  if (design.propulsion !== 'none') {
    const es = clamp(s / 1.1, 0.6, 2.4);
    const eng = add(`propulsion:${design.propulsion}`, kit(`eng_${design.propulsion}`));
    eng.rotation.x = Math.PI;
    eng.scale.setScalar(es);
    eng.position.set(0, -h / 2, 0);
    const length = { coldgas: 0.14, mono: 0.28, biprop: 0.72, ion: 0.26 }[design.propulsion] ?? 0.3;
    exhaust = new THREE.Vector3(0, -h / 2 - length * es, 0);
    // Small thrusters on the top corners turn the spacecraft and trim its orbit.
    const ts = clamp(s, 0.7, 2);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const q = add(`propulsion:${design.propulsion}`, kit('rcs'));
      q.scale.setScalar(ts);
      q.position.set((sx * w) / 2, h * 0.38, (sz * d) / 2);
      q.rotation.y = Math.atan2(-sz, sx);
    }
  }

  // ---- what every spacecraft has -------------------------------------------------
  // The ring that held it to the rocket stays on the bottom deck.
  const ring = add('bus', kit('adapter'));
  ring.rotation.x = Math.PI / 2;
  ring.scale.setScalar(Math.min(w, d) * 0.78);
  ring.position.set(0, -h / 2, 0);
  // Two sun sensors on the top deck, so the spacecraft can always find the Sun.
  for (const sx of [1, -1]) {
    const sensor = add('bus', kit('sunsensor'));
    sensor.scale.setScalar(clamp(s, 0.8, 2));
    sensor.position.set(sx * w * 0.38, top, d * 0.38);
  }

  // ---- behaviour --------------------------------------------------------------
  const setDeploy = (t: number) => {
    const fold = 1 - clamp(t, 0, 1);
    for (const hg of hinges) {
      hg.first.rotation.z = (fold * Math.PI) / 2;
      hg.rest.forEach((hinge, i) => {
        hinge.rotation.z = (i % 2 === 0 ? -1 : 1) * fold * Math.PI * 0.985;
      });
    }
  };
  const trackSun = (dir: THREE.Vector3) => {
    for (const hg of hinges) hg.track.rotation.x = hg.side > 0 ? Math.atan2(dir.z, dir.y) : Math.atan2(-dir.z, dir.y);
  };
  const aimDish = (dir: THREE.Vector3) => {
    dishPivot?.quaternion.setFromUnitVectors(UP, dir);
  };
  setDeploy(1);
  trackSun(new THREE.Vector3(0, 0.25, 1).normalize());
  aimDish(new THREE.Vector3(0.25, 0.8, 0.55).normalize());

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(box.max.length(), box.min.length());
  const antenna = dishPivot ? dishPivot.position.clone() : new THREE.Vector3(0, top + 0.15, 0);
  return { root, radius, size, tags, antenna, exhaust, setDeploy, trackSun, aimDish };
}
