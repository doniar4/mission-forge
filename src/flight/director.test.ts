import { describe, expect, it } from 'vitest';
import { failureTime, simulateAscent } from '../engine/ascent';
import { Director, type FlightPhase, type FlightPlan } from './director';

const plan = (over: Partial<FlightPlan> = {}): FlightPlan => ({
  ascent: simulateAscent('vector', 900),
  launchFailed: false,
  transitMonths: 0,
  insertion: false,
  totalMonths: 24,
  ...over,
});

/** Plays the flight at 20 frames a second and records the phases it passes through. */
function play(d: Director, seconds = 400): FlightPhase[] {
  const seen: FlightPhase[] = [d.phase];
  for (let i = 0; i < seconds * 20 && d.phase !== 'done'; i++) {
    d.update(0.05);
    if (seen[seen.length - 1] !== d.phase) seen.push(d.phase);
  }
  return seen;
}

describe('flight director', () => {
  it('waits on the pad until the countdown is started', () => {
    const d = new Director(plan());
    play(d, 5);
    expect(d.phase).toBe('pad');
    d.go();
    expect(d.phase).toBe('countdown');
  });

  it('runs a mission in Earth orbit from countdown to the last month', () => {
    const d = new Director(plan());
    d.go();
    expect(play(d)).toEqual(['countdown', 'ascent', 'deploy', 'ops', 'done']);
    expect(d.months).toBe(24);
  });

  it('adds a cruise and an insertion burn for a mission that travels', () => {
    const d = new Director(plan({ transitMonths: 8, insertion: true, totalMonths: 44 }));
    d.go();
    expect(play(d)).toEqual(['countdown', 'ascent', 'deploy', 'cruise', 'insertion', 'ops', 'done']);
    expect(d.months).toBe(44);
  });

  it('reveals every ascent event in order, and none before lift-off', () => {
    const p = plan();
    const d = new Director(p);
    d.go();
    const order: string[] = [];
    d.subscribe(() => {
      if (d.event && order[order.length - 1] !== d.event.id) order.push(d.event.id);
    });
    while (d.phase === 'countdown') d.update(0.05);
    expect(order).toEqual([]);
    play(d);
    expect(order).toEqual(p.ascent.events.map((e) => e.id));
  });

  it('ends at the failure when the launch vehicle is lost', () => {
    const t = failureTime(7);
    const d = new Director(plan({ ascent: simulateAscent('vector', 900, t), launchFailed: true, totalMonths: 0 }));
    d.go();
    expect(play(d)).toEqual(['countdown', 'ascent', 'done']);
    expect(d.event?.id).toBe('failure');
    expect(d.met).toBe(t);
    expect(d.months).toBe(0);
  });

  it('can skip the climb or the whole flight, and pause', () => {
    const a = new Director(plan());
    a.skipAscent();
    expect(a.phase).toBe('deploy');
    expect(a.event?.id).toBe('deploy');

    const b = new Director(plan());
    b.skip();
    expect(b.phase).toBe('done');
    expect(b.months).toBe(24);

    const c = new Director(plan());
    c.go();
    c.setSpeed(0);
    const met = c.met;
    c.update(1);
    expect(c.met).toBe(met);
  });

  it('plays the climb in well under a minute at normal speed', () => {
    const d = new Director(plan());
    d.go();
    let frames = 0;
    while (d.phase === 'countdown' || d.phase === 'ascent') {
      d.update(0.05);
      frames++;
    }
    const seconds = frames * 0.05;
    expect(seconds).toBeGreaterThan(25);
    expect(seconds).toBeLessThan(60);
  });
});
