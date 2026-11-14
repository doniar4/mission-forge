import { describe, expect, it } from 'vitest';
import { PARKING_ALT, failureTime, sampleAt, simulateAscent, type AscentEventId } from './ascent';
import { VEHICLES } from './catalog';

describe('ascent to orbit', () => {
  for (const v of VEHICLES) {
    it(`${v.id} carries its full rated load to the parking orbit`, () => {
      const a = simulateAscent(v.id, v.leoKg);
      const end = a.samples[a.samples.length - 1];
      const at = (id: string) => a.events.find((e) => e.id === id)?.t ?? -1;
      // The ascent line for this vehicle: look at it whenever the rocket numbers change.
      console.log(
          `${v.id.padEnd(9)} lift-off ${(a.liftoffKg / 1000).toFixed(0)} t, thrust ${a.thrustKn.toFixed(0)} kN | maxQ ${at('maxq').toFixed(0)} s, MECO ${at('meco').toFixed(0)} s, SECO ${at('seco').toFixed(0)} s | ` +
            `end ${(end.alt / 1000).toFixed(0)} km, ${end.vh.toFixed(0)} m/s, vr ${end.vr.toFixed(0)} | peak ${Math.max(...a.samples.map((s) => s.g)).toFixed(1)} g | fuel left ${(a.margin * 100).toFixed(1)}%`,
        );
      expect(a.reached).toBe(true);
      expect(Math.abs(end.alt - PARKING_ALT)).toBeLessThan(25_000);
      expect(Math.abs(end.vr)).toBeLessThan(80);
      expect(end.vh).toBeGreaterThan(7700);
      // Rated load is the limit: a little propellant is left, not a lot.
      expect(a.margin).toBeGreaterThan(0.005);
      expect(a.margin).toBeLessThan(0.2);
    });

    it(`${v.id} has more propellant to spare with a light load`, () => {
      const full = simulateAscent(v.id, v.leoKg);
      const light = simulateAscent(v.id, v.leoKg * 0.3);
      expect(light.reached).toBe(true);
      expect(light.margin).toBeGreaterThan(full.margin);
    });
  }

  it('looks like a real launch: max Q low in the atmosphere, staging in order, bounded load', () => {
    const a = simulateAscent('atlant', 5000);
    const order = a.events.map((e) => e.id);
    expect(order[0]).toBe('liftoff');
    const pairs: [AscentEventId, AscentEventId][] = [['maxq', 'meco'], ['boosters', 'meco'], ['meco', 'separation'], ['separation', 'ignition2'], ['ignition2', 'fairing'], ['fairing', 'seco'], ['seco', 'deploy']];
    for (const [x, y] of pairs) expect(order.indexOf(x)).toBeLessThan(order.indexOf(y));
    const maxq = sampleAt(a, a.events.find((e) => e.id === 'maxq')!.t);
    expect(maxq.alt).toBeGreaterThan(6_000);
    expect(maxq.alt).toBeLessThan(20_000);
    expect(Math.max(...a.samples.map((s) => s.g))).toBeLessThanOrEqual(4.6);
    // Altitude never dips back into the ground and speed ends near orbital velocity.
    expect(Math.min(...a.samples.map((s) => s.alt))).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic and can be cut short by a failure', () => {
    expect(simulateAscent('vector', 900)).toEqual(simulateAscent('vector', 900));
    const t = failureTime(12345);
    expect(t).toBe(failureTime(12345));
    expect(t).toBeGreaterThanOrEqual(28);
    expect(t).toBeLessThanOrEqual(123);
    const bad = simulateAscent('vector', 900, t);
    expect(bad.reached).toBe(false);
    expect(bad.events[bad.events.length - 1].id).toBe('failure');
    expect(bad.samples[bad.samples.length - 1].t).toBe(t);
  });
});
