import { VEHICLES, byId } from './catalog';
import { G0 } from './evaluate';

/*
 * The climb to orbit, integrated second by second: thrust, gravity, air drag and a
 * shrinking mass. The rockets are fictional and sized from their payload capacity,
 * but the physics is the real thing, so the telemetry behaves like a real launch:
 * the load grows as the tanks empty, drag peaks around 10-14 km ("max Q"),
 * and most of the fuel is spent on speed, not height.
 *
 * Pure and deterministic, like the rest of the engine.
 */

const RE = 6_371_000;
const MU = 3.986004418e14;
/** Every launch first reaches a low parking orbit; the trip onwards starts from there. */
export const PARKING_ALT = 200_000;
const MAX_G = 4.5;

export type AscentEventId =
  | 'liftoff'
  | 'maxq'
  | 'boosters'
  | 'meco'
  | 'separation'
  | 'ignition2'
  | 'fairing'
  | 'seco'
  | 'deploy'
  | 'failure';

export interface AscentEvent {
  t: number;
  id: AscentEventId;
}

export interface AscentSample {
  /** Seconds since lift-off. */
  t: number;
  /** Altitude, m. */
  alt: number;
  /** Distance flown over the ground, m. */
  range: number;
  speed: number;
  vr: number;
  vh: number;
  /** What the spacecraft feels, in g. */
  g: number;
  /** Thrust direction above the local horizon, rad. */
  pitch: number;
  /** Dynamic pressure, Pa. */
  q: number;
  stage: 1 | 2;
  burning: boolean;
  boosters: boolean;
  /** Propellant left in the first and second stage, 0..1. */
  fuel1: number;
  fuel2: number;
}

export interface Ascent {
  vehicleId: string;
  /** Mass the rocket has to carry, as an equivalent load to low orbit, kg. */
  loadKg: number;
  liftoffKg: number;
  thrustKn: number;
  hasBoosters: boolean;
  samples: AscentSample[];
  events: AscentEvent[];
  reached: boolean;
  /** Second-stage propellant left at engine cut-off, 0..1. */
  margin: number;
  failedAt: number | null;
}

interface Stack {
  coreProp: number;
  coreDry: number;
  coreThrust: number;
  boostProp: number;
  boostDry: number;
  boostThrust: number;
  boostBurn: number;
  s2Prop: number;
  s2Dry: number;
  s2Thrust: number;
  area: number;
}

/** [strap-on share of the first stage, strap-on burn time s, body diameter m, carrier capacity kg] */
const SHAPE: Record<string, [number, number, number, number?]> = {
  rideshare: [0, 0, 3.4, 6000],
  kolibri: [0, 0, 1.2],
  vector: [0, 0, 2.2],
  atlant: [0.3, 95, 3.7],
  titan: [0.5, 140, 4.6],
};
const ISP1_SL = 282;
const ISP1_VAC = 311;
const ISP_BOOST = 298;
const ISP2 = 357;

function stackFor(vehicleId: string): Stack {
  const veh = byId(VEHICLES, vehicleId) ?? VEHICLES[VEHICLES.length - 2];
  const [share, burn, diameter, carrier] = SHAPE[veh.id] ?? [0, 0, 3];
  const cap = carrier ?? veh.leoKg;
  const m2 = 7.5 * cap;
  const m1 = 37.5 * cap;
  const boost = m1 * share;
  const core = m1 - boost;
  const liftoff = m1 + m2 + cap;
  const boostProp = boost * 0.91;
  const boostThrust = burn > 0 ? (boostProp * ISP_BOOST * G0) / burn : 0;
  return {
    coreProp: core * 0.93,
    coreDry: core * 0.07,
    coreThrust: 1.36 * liftoff * G0 - boostThrust,
    boostProp,
    boostDry: boost * 0.09,
    boostThrust,
    boostBurn: burn,
    s2Prop: m2 * 0.91,
    s2Dry: m2 * 0.09,
    s2Thrust: 0.85 * (m2 + cap) * G0,
    area: Math.PI * (diameter / 2) ** 2 * (share > 0 ? 1.6 : 1),
  };
}

interface Run {
  samples: AscentSample[];
  events: AscentEvent[];
  reached: boolean;
  margin: number;
  altError: number;
  vrEnd: number;
}

function fly(st: Stack, load: number, kick: number, failAt: number | null): Run {
  const dt = 0.25;
  const samples: AscentSample[] = [];
  const events: AscentEvent[] = [{ t: 0, id: 'liftoff' }];
  let r = RE;
  let th = 0;
  let vr = 0;
  let vh = 0;
  let t = 0;
  let coreProp = st.coreProp;
  let boostProp = st.boostProp;
  let s2Prop = st.s2Prop;
  let boostersOn = st.boostThrust > 0;
  let phase: 'first' | 'coast' | 'second' | 'orbit' = 'first';
  let fairingOn = true;
  let kickStart = -1;
  let coastUntil = 0;
  let orbitUntil = 0;
  let qMax = 0;
  let qMaxT = 0;
  let reached = false;
  let step = 0;

  while (t < 1400) {
    const h = r - RE;
    const v = Math.hypot(vr, vh);
    const rho = h < 150_000 ? 1.225 * Math.exp(-h / 7400) : 0;
    const q = 0.5 * rho * v * v;
    if (q > qMax) {
      qMax = q;
      qMaxT = t;
    }
    const mass =
      load +
      (phase === 'first' ? coreProp + st.coreDry + (boostersOn ? boostProp + st.boostDry : 0) : 0) +
      s2Prop +
      st.s2Dry;
    const g = MU / (r * r);

    let thrust = 0;
    let pitch = Math.PI / 2;
    let burnCore = 0;
    let burnBoost = 0;
    let burn2 = 0;
    if (phase === 'first') {
      const isp = ISP1_VAC - (ISP1_VAC - ISP1_SL) * Math.exp(-h / 7000);
      let core = st.coreThrust;
      const boost = boostersOn ? st.boostThrust : 0;
      // Engines throttle back near burn-out so the payload is not crushed.
      if ((core + boost) / mass > MAX_G * G0) core = Math.max(0.3 * st.coreThrust, MAX_G * G0 * mass - boost);
      thrust = core + boost;
      burnCore = core / (isp * G0);
      burnBoost = boost / (ISP_BOOST * G0);
      if (h < 150 || v < 40) pitch = Math.PI / 2;
      else {
        if (kickStart < 0) kickStart = t;
        const k = Math.min(1, (t - kickStart) / 6);
        // A small nudge off vertical, then gravity bends the path: thrust simply follows the velocity.
        pitch = t - kickStart < 12 ? Math.PI / 2 - kick * k : Math.atan2(vr, Math.max(1, vh));
      }
    } else if (phase === 'second') {
      thrust = st.s2Thrust;
      if (thrust / mass > MAX_G * G0) thrust = MAX_G * G0 * mass;
      burn2 = thrust / (ISP2 * G0);
      // Hold the climb so it levels off at the parking altitude while all spare thrust builds speed.
      const tau = 75;
      const want = (PARKING_ALT - h) / (tau * tau) - (2 * vr) / tau + g - (vh * vh) / r;
      pitch = Math.asin(Math.min(0.92, Math.max(-0.4, want / (thrust / mass))));
    } else {
      pitch = Math.atan2(vr, Math.max(1, vh));
    }

    if (step % 4 === 0) {
      samples.push({
        t,
        alt: h,
        range: th * RE,
        speed: v,
        vr,
        vh,
        g: thrust / mass / G0,
        pitch,
        q,
        stage: phase === 'first' ? 1 : 2,
        burning: thrust > 0,
        boosters: boostersOn,
        fuel1: coreProp / st.coreProp,
        fuel2: s2Prop / st.s2Prop,
      });
    }
    if (failAt !== null && t >= failAt) {
      events.push({ t, id: 'failure' });
      break;
    }
    if (phase === 'orbit' && t >= orbitUntil) break;

    const drag = v > 1 ? (q * 0.32 * st.area) / mass : 0;
    const ar = (thrust / mass) * Math.sin(pitch) - (drag * vr) / Math.max(1, v) - g + (vh * vh) / r;
    const ah = (thrust / mass) * Math.cos(pitch) - (drag * vh) / Math.max(1, v) - (vr * vh) / r;
    vr += ar * dt;
    vh += ah * dt;
    r += vr * dt;
    th += (vh / r) * dt;
    if (r < RE) {
      r = RE;
      vr = Math.max(0, vr);
    }
    coreProp -= burnCore * dt;
    boostProp -= burnBoost * dt;
    s2Prop -= burn2 * dt;
    t += dt;
    step++;

    if (phase === 'first') {
      if (boostersOn && (boostProp <= 0 || t >= st.boostBurn)) {
        boostersOn = false;
        events.push({ t, id: 'boosters' });
      }
      if (coreProp <= 0) {
        phase = 'coast';
        coastUntil = t + 7;
        events.push({ t, id: 'meco' }, { t: t + 3, id: 'separation' });
      }
    } else if (phase === 'coast' && t >= coastUntil) {
      phase = 'second';
      events.push({ t, id: 'ignition2' });
    } else if (phase === 'second') {
      if (fairingOn && r - RE > 115_000) {
        fairingOn = false;
        events.push({ t, id: 'fairing' });
      }
      if (vh >= Math.sqrt(MU / r)) {
        reached = true;
        phase = 'orbit';
        orbitUntil = t + 40;
        events.push({ t, id: 'seco' }, { t: t + 22, id: 'deploy' });
      } else if (s2Prop <= 0) {
        phase = 'orbit';
        orbitUntil = t + 20;
        events.push({ t, id: 'seco' });
      }
    }
  }
  events.push({ t: qMaxT, id: 'maxq' });
  events.sort((a, b) => a.t - b.t);
  return { samples, events, reached, margin: Math.max(0, s2Prop / st.s2Prop), altError: Math.abs(r - RE - PARKING_ALT), vrEnd: Math.abs(vr) };
}

const memo = new Map<string, Ascent>();

/**
 * Flies the vehicle with a given load. `loadKg` is the spacecraft's fuelled mass divided by the
 * orbit's capacity factor, so a trip to the Moon weighs on the rocket like the heavier low-orbit
 * load it is equivalent to. `failAt` cuts the flight short at that second (a launch failure).
 */
export function simulateAscent(vehicleId: string, loadKg: number, failAt: number | null = null): Ascent {
  const key = `${vehicleId}:${Math.round(loadKg)}:${failAt ?? ''}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const st = stackFor(vehicleId);
  // Try a fan of pitch-over angles and keep the one that reaches orbit with the most propellant left.
  let best: Run | null = null;
  let bestKick = 0.03;
  let bestScore = -Infinity;
  for (let i = 0; i < 28; i++) {
    const kick = 0.006 + i * 0.006;
    const run = fly(st, loadKg, kick, null);
    const score = (run.reached ? 1000 : 0) + run.margin * 400 - run.altError / 2000 - run.vrEnd / 4;
    if (score > bestScore) {
      bestScore = score;
      best = run;
      bestKick = kick;
    }
  }
  const run = failAt === null ? best! : fly(st, loadKg, bestKick, failAt);
  const out: Ascent = {
    vehicleId,
    loadKg,
    liftoffKg: st.coreProp + st.coreDry + st.boostProp + st.boostDry + st.s2Prop + st.s2Dry + loadKg,
    thrustKn: (st.coreThrust + st.boostThrust) / 1000,
    hasBoosters: st.boostThrust > 0,
    samples: run.samples,
    events: run.events,
    reached: failAt === null && run.reached,
    margin: failAt === null ? run.margin : 0,
    failedAt: failAt,
  };
  if (memo.size > 24) memo.clear();
  memo.set(key, out);
  return out;
}

/** The sample at time t, interpolated between the stored seconds. */
export function sampleAt(a: Ascent, t: number): AscentSample {
  const s = a.samples;
  if (t <= 0) return s[0];
  const last = s[s.length - 1];
  if (t >= last.t) return last;
  const i = Math.min(s.length - 2, Math.floor(t));
  const p = s[i];
  const n = s[i + 1];
  const k = (t - p.t) / (n.t - p.t);
  const mix = (x: number, y: number) => x + (y - x) * k;
  return {
    ...p,
    t,
    alt: mix(p.alt, n.alt),
    range: mix(p.range, n.range),
    speed: mix(p.speed, n.speed),
    vr: mix(p.vr, n.vr),
    vh: mix(p.vh, n.vh),
    g: p.burning === n.burning ? mix(p.g, n.g) : p.g,
    pitch: mix(p.pitch, n.pitch),
    q: mix(p.q, n.q),
    fuel1: mix(p.fuel1, n.fuel1),
    fuel2: mix(p.fuel2, n.fuel2),
  };
}

/**
 * When a doomed launch comes apart, seconds after lift-off. Derived from the mission seed with
 * its own generator, so the mission simulation's random sequence is untouched.
 */
export function failureTime(seed: number): number {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  const u = ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  return Math.round(28 + u * 95);
}
