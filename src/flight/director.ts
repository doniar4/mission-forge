import type { Ascent, AscentEvent } from '../engine/ascent';

/*
 * The flight's running order: what is on screen and when. It knows nothing about
 * drawing — the 3D scene and the telemetry panel both read it — and nothing in it
 * changes the mission's result, which simulate() has already decided.
 */

export type FlightPhase = 'pad' | 'countdown' | 'ascent' | 'deploy' | 'cruise' | 'insertion' | 'ops' | 'done';
export type Speed = 0 | 1 | 4;

export interface FlightPlan {
  ascent: Ascent;
  launchFailed: boolean;
  /** Months of cruise before the spacecraft reaches its working orbit. */
  transitMonths: number;
  /** Does the spacecraft brake into the orbit with its own engine? */
  insertion: boolean;
  /** Month records the simulation produced (cruise + operations). */
  totalMonths: number;
}

export const COUNTDOWN = 10;
const DEPLOY = 9;
const CRUISE_MONTH = 1.1;
const INSERTION = 6;
const OPS_MONTH = 0.55;
const AFTERMATH = 4;

/** How much faster than real time the climb is shown: slow at lift-off and around each event. */
function warpAt(met: number, events: AscentEvent[]): number {
  let w = met < 5 ? 1 : met < 16 ? 1 + ((met - 5) / 11) * 21 : 22;
  const fairing = events.find((e) => e.id === 'fairing');
  const seco = events.find((e) => e.id === 'seco');
  if (fairing && seco && met > fairing.t + 12 && met < seco.t - 14) w = 36;
  for (const e of events) {
    if (e.id === 'liftoff' || e.id === 'maxq') continue;
    w = Math.min(w, 2.2 + Math.abs(met - e.t) * 1.5);
  }
  return w;
}

export class Director {
  phase: FlightPhase = 'pad';
  /** Seconds spent in the current phase, at the chosen speed. */
  t = 0;
  /** Mission elapsed time: negative during the countdown, seconds since lift-off after it. */
  met = -COUNTDOWN;
  /** How many of the simulation's month records have been revealed. */
  months = 0;
  speed: Speed = 1;
  warp = 1;
  /** The most recent ascent event that has happened. */
  event: AscentEvent | null = null;
  private nextEvent = 0;
  private listeners = new Set<() => void>();

  constructor(readonly plan: FlightPlan) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }
  private enter(phase: FlightPhase) {
    this.phase = phase;
    this.t = 0;
    this.emit();
  }

  get ascentEnd(): number {
    const s = this.plan.ascent.samples;
    return s[s.length - 1].t;
  }
  /** 0..1 through the current fixed-length phase. */
  get progress(): number {
    if (this.phase === 'deploy') return Math.min(1, this.t / DEPLOY);
    if (this.phase === 'insertion') return Math.min(1, this.t / INSERTION);
    if (this.phase === 'cruise') return Math.min(1, this.t / Math.max(0.01, this.plan.transitMonths * CRUISE_MONTH));
    return 0;
  }

  go() {
    if (this.phase === 'pad') this.enter('countdown');
  }
  setSpeed(s: Speed) {
    this.speed = s;
    this.emit();
  }
  /** Jumps past the climb to the moment the spacecraft is released. */
  skipAscent() {
    if (this.phase !== 'pad' && this.phase !== 'countdown' && this.phase !== 'ascent') return;
    const ev = this.plan.ascent.events;
    this.met = this.ascentEnd;
    this.warp = 1;
    this.nextEvent = ev.length;
    this.event = ev[ev.length - 1] ?? null;
    if (this.plan.launchFailed || !this.plan.ascent.reached) this.enter('ascent');
    else this.enter('deploy');
  }
  skip() {
    this.months = this.plan.totalMonths;
    this.met = this.ascentEnd;
    this.event = this.plan.ascent.events[this.plan.ascent.events.length - 1] ?? null;
    this.enter('done');
  }

  update(dt: number) {
    if (this.speed === 0 || this.phase === 'pad' || this.phase === 'done') return;
    const step = Math.min(dt, 0.1) * this.speed;
    this.t += step;
    const { plan } = this;
    switch (this.phase) {
      case 'countdown':
        this.met = Math.min(0, this.met + step);
        if (this.met >= 0) {
          this.met = 0;
          this.enter('ascent');
        }
        break;
      case 'ascent': {
        if (this.met < this.ascentEnd) {
          this.warp = warpAt(this.met, plan.ascent.events);
          this.met = Math.min(this.ascentEnd, this.met + step * this.warp);
          this.t = 0;
          const ev = plan.ascent.events;
          while (this.nextEvent < ev.length && ev[this.nextEvent].t <= this.met) {
            this.event = ev[this.nextEvent++];
            this.emit();
          }
        } else if (plan.launchFailed || !plan.ascent.reached) {
          if (this.t > AFTERMATH) this.enter('done');
        } else {
          this.warp = 1;
          this.enter('deploy');
        }
        break;
      }
      case 'deploy':
        if (this.t >= DEPLOY) this.enter(plan.transitMonths > 0 ? 'cruise' : plan.insertion ? 'insertion' : 'ops');
        break;
      case 'cruise': {
        const m = Math.min(plan.transitMonths, Math.floor(this.t / CRUISE_MONTH));
        if (m !== this.months) {
          this.months = m;
          this.emit();
        }
        if (this.t >= plan.transitMonths * CRUISE_MONTH) this.enter(plan.insertion ? 'insertion' : 'ops');
        break;
      }
      case 'insertion':
        if (this.t >= INSERTION) this.enter('ops');
        break;
      case 'ops': {
        const m = Math.min(plan.totalMonths, plan.transitMonths + Math.floor(this.t / OPS_MONTH));
        if (m !== this.months) {
          this.months = m;
          this.emit();
        }
        if (this.months >= plan.totalMonths && this.t >= (plan.totalMonths - plan.transitMonths) * OPS_MONTH + 1.2) this.enter('done');
        break;
      }
    }
  }
}
