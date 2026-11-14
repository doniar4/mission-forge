import { describe, expect, it } from 'vitest';
import { sanitize } from './design';
import { chooseDev, describe as describeEvent, devDone, devMods, makeDev } from './development';
import { evaluate } from './evaluate';
import { buildReport } from './report';
import { emptyDesign, scenarioById } from './scenarios';
import { simulate } from './simulate';
import type { Design, DevEvent, Difficulty } from './types';

/** The standard reference designs (see engine.test.ts): each meets its target with the standard class. */
const STD: Record<string, Partial<Design>> = {
  firewatch: { orbit: 'sso', instruments: ['thermal_ir', 'multispec'], power: 'medium', battery: 'b500', comms: 'xband', ground: 'network', computer: 'standard', adcs: 'wheels', propulsion: 'mono', vehicle: 'rideshare', lifeYears: 3 },
  ocean: { orbit: 'sso', instruments: ['altimeter', 'sounder', 'scatterometer'], power: 'medium', battery: 'b500', comms: 'sband', ground: 'network', computer: 'standard', adcs: 'wheels', propulsion: 'mono', vehicle: 'kolibri', lifeYears: 7, redundancy: 'redundant' },
  lunarice: { orbit: 'llo', instruments: ['spectrometer', 'neutron', 'altimeter', 'cam_wide'], power: 'medium', battery: 'b500', comms: 'xband', ground: 'dsn', computer: 'standard', adcs: 'wheels', propulsion: 'biprop', vehicle: 'vector', lifeYears: 2 },
  sentinel: { orbit: 'l1', instruments: ['particles', 'magnetometer', 'euv_imager'], power: 'small', battery: 'b100', comms: 'xband', ground: 'dsn', computer: 'standard', adcs: 'wheels', propulsion: 'mono', vehicle: 'vector', lifeYears: 5, redundancy: 'redundant' },
  marsweather: { orbit: 'lmo', instruments: ['sounder', 'thermal_ir', 'cam_mid', 'magnetometer'], power: 'large', battery: 'b500', comms: 'kaband', ground: 'dsn', computer: 'standard', adcs: 'wheels', propulsion: 'biprop', vehicle: 'atlant', lifeYears: 3 },
};
const std = (id: string): Design => ({ ...emptyDesign(scenarioById(id)), ...STD[id] });
const started = (id: string, seed: number, diff: Difficulty = 'engineer'): Design => {
  const d = std(id);
  return { ...d, dev: makeDev(d, scenarioById(id), diff, seed) };
};
/** A design whose single development event is the one given. */
const withEvent = (id: string, e: DevEvent): Design => ({ ...std(id), dev: { seed: 1, events: [e], choices: [null] } });

/** A careful player: for each event, the option that keeps the review board happiest, then the most science. */
function careful(d: Design, sc = scenarioById('firewatch'), diff: Difficulty = 'engineer'): Design {
  let cur = d;
  cur.dev!.events.forEach((e, i) => {
    const options = describeEvent(e, cur).options.map((o) => chooseDev(cur, i, o.id));
    options.sort((a, b) => {
      const ea = evaluate(a, sc, diff);
      const eb = evaluate(b, sc, diff);
      return ea.blockers - eb.blockers || eb.science.projected - ea.science.projected;
    });
    cur = options[0];
  });
  return cur;
}

describe('development events', () => {
  it('are drawn from the seed: the same seed, the same events', () => {
    const sc = scenarioById('lunarice');
    expect(makeDev(std('lunarice'), sc, 'engineer', 42)).toEqual(makeDev(std('lunarice'), sc, 'engineer', 42));
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) for (const e of makeDev(std('lunarice'), sc, 'engineer', seed).events) kinds.add(e.kind);
    expect([...kinds].sort()).toEqual(['budget', 'delay', 'gift', 'mass', 'power', 'test']);
  });

  it('bring more and harder events on harder levels, and never the shake test to cadets', () => {
    const sc = scenarioById('firewatch');
    for (let seed = 1; seed <= 30; seed++) {
      const cadet = makeDev(std('firewatch'), sc, 'cadet', seed);
      expect(cadet.events).toHaveLength(2);
      expect(cadet.events.some((e) => e.kind === 'test')).toBe(false);
      expect(makeDev(std('firewatch'), sc, 'engineer', seed).events).toHaveLength(3);
      expect(makeDev(std('firewatch'), sc, 'director', seed).events).toHaveLength(4);
      expect(new Set(makeDev(std('firewatch'), sc, 'director', seed).events.map((e) => e.kind)).size).toBe(4);
    }
  });

  it('are about this design: a growing instrument is on board, a gift is not', () => {
    const sc = scenarioById('ocean');
    for (let seed = 1; seed <= 40; seed++)
      for (const e of makeDev(std('ocean'), sc, 'director', seed).events) {
        if (e.kind === 'mass') expect(STD.ocean.instruments).toContain(e.target);
        if (e.kind === 'gift') expect(STD.ocean.instruments).not.toContain(e.target);
      }
  });

  it('an instrument that grows heavier costs mass; lightening it costs money and months; dropping it costs science', () => {
    const sc = scenarioById('firewatch');
    const d = withEvent('firewatch', { kind: 'mass', target: 'thermal_ir', size: 0.3, role: 'science' });
    const before = evaluate(d, sc, 'engineer');
    const accept = evaluate(chooseDev(d, 0, 'accept'), sc, 'engineer');
    const slim = evaluate(chooseDev(d, 0, 'slim'), sc, 'engineer');
    const drop = chooseDev(d, 0, 'drop');
    expect(accept.mass.payload).toBeCloseTo(before.mass.payload + 22 * 0.3, 5);
    expect(slim.mass.payload).toBeCloseTo(before.mass.payload, 5);
    expect(slim.cost.total).toBeGreaterThan(before.cost.total);
    expect(slim.time.devMonths).toBe(before.time.devMonths + 2);
    expect(drop.instruments).not.toContain('thermal_ir');
    expect(evaluate(drop, sc, 'engineer').science.projected).toBeLessThan(before.science.projected);
  });

  it('a budget cut shrinks the budget; arguing keeps half of it for three months of talks', () => {
    const sc = scenarioById('firewatch');
    const d = withEvent('firewatch', { kind: 'budget', size: 0.1, role: 'manager' });
    const base = evaluate(d, sc, 'engineer');
    const accept = evaluate(chooseDev(d, 0, 'accept'), sc, 'engineer');
    const argue = evaluate(chooseDev(d, 0, 'argue'), sc, 'engineer');
    expect(accept.cost.budget).toBe(Math.round(base.cost.budget * 0.9));
    expect(argue.cost.budget).toBe(Math.round(base.cost.budget * 0.95));
    expect(argue.time.devMonths).toBe(base.time.devMonths + 3);
  });

  it('weak arrays cut the power; skipping the repeat test makes failures likelier', () => {
    const sc = scenarioById('firewatch');
    const p = withEvent('firewatch', { kind: 'power', size: 0.1, role: 'engineer' });
    expect(evaluate(chooseDev(p, 0, 'accept'), sc, 'engineer').power.average).toBeCloseTo(evaluate(p, sc, 'engineer').power.average * 0.9, 5);
    expect(chooseDev(p, 0, 'bigger').power).toBe('large');
    const t = withEvent('firewatch', { kind: 'test', size: 1.8, role: 'manager' });
    expect(devMods(chooseDev(t, 0, 'fly')).risk).toBe(1.8);
    const fly = chooseDev(t, 0, 'fly');
    const retest = chooseDev(t, 0, 'retest');
    let lostFly = 0;
    let lostRetest = 0;
    for (let seed = 1; seed <= 300; seed++) {
      if (simulate(fly, sc, 'engineer', seed).lost) lostFly++;
      if (simulate(retest, sc, 'engineer', seed).lost) lostRetest++;
    }
    expect(lostFly).toBeGreaterThan(lostRetest);
  });

  it('a gift instrument flies free of charge, but not free of mass', () => {
    const sc = scenarioById('firewatch');
    const d = withEvent('firewatch', { kind: 'gift', target: 'cam_wide', size: 0, role: 'science' });
    const take = chooseDev(d, 0, 'take');
    expect(take.instruments).toContain('cam_wide');
    const a = evaluate(d, sc, 'engineer');
    const b = evaluate(take, sc, 'engineer');
    expect(b.cost.payload).toBe(a.cost.payload + 0.3);
    expect(b.mass.wet).toBeGreaterThan(a.mass.wet);
    expect(b.cost.total - a.cost.total).toBeLessThan(0.3 + 0.3);
  });

  it('a choice is made once, and only from the options offered', () => {
    const d = withEvent('firewatch', { kind: 'budget', size: 0.1, role: 'manager' });
    expect(chooseDev(d, 0, 'nonsense')).toBe(d);
    const once = chooseDev(d, 0, 'accept');
    expect(chooseDev(once, 0, 'argue')).toBe(once);
    expect(devDone(once)).toBe(true);
  });

  it('survives a hand-edited link: sanitize keeps a sane record and drops a broken one', () => {
    const sc = scenarioById('firewatch');
    const d = started('firewatch', 7);
    expect(sanitize(d, sc, 'engineer').dev).toEqual(d.dev);
    const wild = { ...d, dev: { seed: 1, events: [{ kind: 'budget', size: 99, role: 'manager' }], choices: [null] } } as unknown as Design;
    expect(sanitize(wild, sc, 'engineer').dev!.events[0].size).toBe(0.6);
    expect(sanitize({ ...d, dev: { events: 'x' } } as unknown as Design, sc, 'engineer').dev).toBeUndefined();
  });

  it('leave a careful player a way to the pad on every mission and level', () => {
    for (const id of Object.keys(STD))
      for (const diff of ['engineer', 'director'] as const) {
        const sc = scenarioById(id);
        let ok = 0;
        for (let seed = 1; seed <= 40; seed++) {
          const d = careful(started(id, seed, diff), sc, diff);
          if (evaluate(d, sc, diff).blockers === 0) ok++;
        }
        console.log(`${id.padEnd(12)} ${diff.padEnd(9)} cleared after development: ${ok}/40`);
        // On the hardest level up to about a third of developments push the design over a limit, and
        // the player goes back to the hangar to trim it: that is the point of the level. On the
        // normal level the event choices alone must nearly always be enough.
        expect(ok, `${id} ${diff}`).toBeGreaterThanOrEqual(diff === 'director' ? 24 : 38);
      }
  });
});

describe('forecast range', () => {
  it('is wide before development, narrower after, and always brackets the projection', () => {
    for (const id of Object.keys(STD)) {
      const sc = scenarioById(id);
      const before = evaluate(std(id), sc, 'engineer').science;
      const after = evaluate(careful(started(id, 3), sc), sc, 'engineer').science;
      expect(before.range[0]).toBeLessThan(before.projected);
      expect(before.range[1]).toBeGreaterThan(before.projected);
      expect(after.range[1] - after.range[0]).toBeLessThan(before.range[1] - before.range[0]);
    }
  });

  it('holds what really happens in most flights after development', () => {
    for (const id of Object.keys(STD)) {
      const sc = scenarioById(id);
      let inside = 0;
      let flights = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const d = careful(started(id, seed), sc);
        const ev = evaluate(d, sc, 'engineer');
        if (ev.blockers) continue;
        for (let f = 1; f <= 10; f++) {
          const sim = simulate(d, sc, 'engineer', seed * 100 + f);
          flights++;
          // Round like the range itself.
          const got = Math.round(sim.sciencePct * 20) / 20;
          if (got >= ev.science.range[0] && got <= ev.science.range[1]) inside++;
        }
      }
      expect(inside / flights, id).toBeGreaterThan(0.6);
    }
  });

  it('development choices change the score, so they matter', () => {
    const sc = scenarioById('lunarice');
    const d = withEvent('lunarice', { kind: 'test', size: 1.8, role: 'manager' });
    const avg = (x: Design) => {
      const ev = evaluate(x, sc, 'engineer');
      let p = 0;
      for (let s = 1; s <= 200; s++) p += buildReport(x, sc, 'engineer', ev, simulate(x, sc, 'engineer', s)).total;
      return p / 200;
    };
    expect(Math.abs(avg(chooseDev(d, 0, 'fly')) - avg(chooseDev(d, 0, 'retest')))).toBeGreaterThan(3);
  });
});
