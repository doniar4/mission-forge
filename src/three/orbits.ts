import * as THREE from 'three';
import type { OrbitId } from '../engine/types';
import { BODY_RADIUS, type BodyId } from './planet';

/*
 * The shape of each working orbit for the 3D view, in megametres.
 * Sizes and inclinations are real; the time it takes to go round is compressed for the screen.
 */
export interface OrbitGeo {
  /** What the spacecraft circles: a planet, or the empty L1 point between Earth and the Sun. */
  body: BodyId | 'l1';
  a: number;
  e: number;
  inc: number;
  /** Seconds on screen per revolution at normal speed. */
  period: number;
  /** Turns of the planet per revolution of the spacecraft. */
  spin: number;
}

const deg = THREE.MathUtils.degToRad;
const E = BODY_RADIUS.earth;
const M = BODY_RADIUS.moon;
const R = BODY_RADIUS.mars;

export const ORBIT_GEO: Record<OrbitId, OrbitGeo> = {
  leo: { body: 'earth', a: E + 0.5, e: 0, inc: deg(52), period: 44, spin: 0.066 },
  sso: { body: 'earth', a: E + 0.7, e: 0, inc: deg(98), period: 44, spin: 0.069 },
  geo: { body: 'earth', a: 42.164, e: 0, inc: 0, period: 110, spin: 1 },
  llo: { body: 'moon', a: M + 0.1, e: 0, inc: deg(90), period: 44, spin: 0.003 },
  elo: { body: 'moon', a: M + 3.1, e: 0.6, inc: deg(90), period: 70, spin: 0.01 },
  l1: { body: 'l1', a: 240, e: 0, inc: 0, period: 150, spin: 0 },
  lmo: { body: 'mars', a: R + 0.3, e: 0, inc: deg(93), period: 44, spin: 0.077 },
  emo: { body: 'mars', a: R + 15.15, e: 0.801, inc: deg(75), period: 80, spin: 1.4 },
};

/** How far the Sun sits off the orbit's plane so that the share of each revolution in shadow matches the catalogue. */
export function betaFor(geo: OrbitGeo, sunFraction: number): number {
  if (geo.body === 'l1') return 0;
  if (geo.e > 0.05) return deg(40);
  const k = Math.sqrt(1 - (BODY_RADIUS[geo.body] / geo.a) ** 2);
  const c = k / Math.cos(Math.PI * Math.min(0.49, Math.max(0.001, 1 - sunFraction)));
  return c >= 1 ? 0 : Math.acos(c);
}

export interface OrbitFrame {
  /** Position relative to the body's centre, Mm. */
  pos: THREE.Vector3;
  /** Local axes: x along the motion, y away from the body, z completing the right-handed set. */
  x: THREE.Vector3;
  y: THREE.Vector3;
  z: THREE.Vector3;
  /** Angle travelled from the ascending node, rad. */
  u: number;
}

export class Orbit {
  readonly node = new THREE.Vector3(1, 0, 0);
  readonly m = new THREE.Vector3();
  readonly normal = new THREE.Vector3();
  /** Argument of periapsis: the low point is over the north for the stretched orbits. */
  private argp: number;

  constructor(readonly geo: OrbitGeo) {
    this.m.set(0, Math.sin(geo.inc), -Math.cos(geo.inc));
    this.normal.crossVectors(this.node, this.m);
    this.argp = geo.e > 0.05 ? Math.PI / 2 : 0;
  }

  /** State after `mean` radians of mean anomaly. */
  at(mean: number, out: OrbitFrame): OrbitFrame {
    const { a, e } = this.geo;
    let Ea = mean;
    for (let i = 0; i < 7; i++) Ea -= (Ea - e * Math.sin(Ea) - mean) / (1 - e * Math.cos(Ea));
    const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(Ea / 2), Math.sqrt(1 - e) * Math.cos(Ea / 2));
    const r = a * (1 - e * Math.cos(Ea));
    const u = this.argp + nu;
    out.u = u;
    out.y.copy(this.node).multiplyScalar(Math.cos(u)).addScaledVector(this.m, Math.sin(u));
    out.x.copy(this.node).multiplyScalar(-Math.sin(u)).addScaledVector(this.m, Math.cos(u));
    out.z.crossVectors(out.x, out.y);
    out.pos.copy(out.y).multiplyScalar(r);
    return out;
  }

  /** A closed line along the orbit, for the map view. */
  line(color: THREE.ColorRepresentation): THREE.LineLoop {
    const pts: THREE.Vector3[] = [];
    const f: OrbitFrame = { pos: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), u: 0 };
    for (let i = 0; i < 256; i++) pts.push(this.at((i / 256) * Math.PI * 2, f).pos.clone());
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
  }
}

export const newFrame = (): OrbitFrame => ({ pos: new THREE.Vector3(), x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1), u: 0 });
