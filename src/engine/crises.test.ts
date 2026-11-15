import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import { CRISIS_LEAD, CRISIS_OPTIONS, outageKept, simulate } from './simulate';
import { ROLE_LIST } from './team';
import { emptyDesign, scenarioById } from './scenarios';
import type { Design } from './types';

const sc = scenarioById('firewatch');
const design: Design = {
  ...emptyDesign(sc),
  orbit: 'sso',
  instruments: ['thermal_ir', 'multispec', 'cam_mid'],
  power: 'medium',
  battery: 'b500',
  comms: 'xband',
  ground: 'network',
  computer: 'standard',
  adcs: 'wheels',
  propulsion: 'mono',
  vehicle: 'vector',
  lifeYears: 3,
};
const flights = Array.from({ length: 60 }, (_, i) => simulate(design, sc, 'engineer', i + 1)).filter((s) => !s.launchFailed);

describe('crises in flight', () => {
  it('most flights meet at least one decision, never more than three', () => {
    const met = flights.filter((s) => s.crises.length > 0).length;
    expect(met / flights.length).toBeGreaterThan(0.7);
    for (const s of flights) expect(s.crises.length).toBeLessThanOrEqual(3);
    // A three-year mission often meets a third decision; a two-year one never does.
    expect(flights.some((s) => s.crises.length === 3)).toBe(true);
    const short = { ...design, lifeYears: 2 };
    for (let seed = 1; seed <= 40; seed++) expect(simulate(short, sc, 'engineer', seed).crises.length).toBeLessThanOrEqual(2);
  });

  it('every role leads at least one kind of decision', () => {
    for (const r of ROLE_LIST) expect(Object.values(CRISIS_LEAD)).toContain(r);
  });

  it('meets debris only with an engine to dodge it', () => {
    const kinds = (d: typeof design) =>
      new Set(Array.from({ length: 120 }, (_, i) => simulate(d, sc, 'engineer', i + 1)).flatMap((s) => s.crises.map((c) => c.kind)));
    expect(kinds(design).has('debris')).toBe(true);
    expect(kinds({ ...design, propulsion: 'none' }).has('debris')).toBe(false);
  });

  it('holding data through an outage loses only what storage cannot fit', () => {
    let seen = 0;
    for (const computer of ['basic', 'advanced']) {
      const d = { ...design, computer };
      const ev = evaluate(d, sc, 'engineer');
      const fits = outageKept(ev.data.storage, ev.data.generated) >= 1;
      for (let seed = 1; seed <= 200; seed++) {
        const sim = simulate(d, sc, 'engineer', seed);
        const c = sim.crises.find((x) => x.kind === 'outage');
        if (!c || sim.lost) continue;
        seen++;
        const e = sim.events.find((x) => x.month === c.month && /копить|hold the data/i.test(x.title.en + x.title.ru));
        expect(e?.kind).toBe(fits ? 'info' : 'warn');
      }
    }
    expect(seen).toBeGreaterThan(10);
  });

  it('holding course past debris sometimes costs an instrument; dodging never does', () => {
    let hit = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const safe = simulate(design, sc, 'engineer', seed);
      const c = safe.crises.find((x) => x.kind === 'debris');
      if (!c || safe.lost) continue;
      expect(safe.events.some((e) => e.month === c.month && e.kind === 'bad')).toBe(false);
      const bold = simulate(design, sc, 'engineer', seed, { [c.id]: 'hold' });
      if (bold.events.some((e) => e.month === c.month && e.kind === 'bad')) hit++;
    }
    expect(hit).toBeGreaterThan(0);
  });

  it('without a decision the cautious option is taken', () => {
    for (const s of flights) for (const c of s.crises) {
      expect(c.chosen).toBe(CRISIS_OPTIONS[c.kind][0]);
      expect(c.defaulted).toBe(true);
    }
  });

  it('a decision changes nothing before its month, and the same choices replay the same flight', () => {
    for (const s of flights.slice(0, 20)) {
      const c = s.crises[0];
      if (!c) continue;
      const bold = { [c.id]: c.options[1] };
      const other = simulate(design, sc, 'engineer', s.seed, bold);
      expect(other.months.slice(0, c.month - 1)).toEqual(s.months.slice(0, c.month - 1));
      expect(other.crises[0].chosen).toBe(c.options[1]);
      expect(simulate(design, sc, 'engineer', s.seed, bold)).toEqual(other);
    }
  });

  it('observing a storm is a gamble: often more science, sometimes a lost instrument', () => {
    let more = 0;
    let burned = 0;
    let storms = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const safe = simulate(design, sc, 'engineer', seed);
      const storm = safe.crises.find((c) => c.kind === 'storm');
      if (!storm || safe.launchFailed) continue;
      storms++;
      const bold = simulate(design, sc, 'engineer', seed, { [storm.id]: 'observe' });
      if (bold.sciencePct > safe.sciencePct) more++;
      if (bold.events.some((e) => e.month === storm.month && e.kind === 'bad')) burned++;
    }
    expect(storms).toBeGreaterThan(30);
    expect(more / storms).toBeGreaterThan(0.6);
    expect(burned).toBeGreaterThan(0);
  });

  it('ending early flies fewer months than planned', () => {
    for (const s of flights) {
      const cut = s.crises.find((c) => c.kind === 'budget');
      if (!cut || s.lost) continue;
      const early = simulate(design, sc, 'engineer', s.seed, { [cut.id]: 'end_early' });
      if (!early.lost) expect(early.monthsOperated).toBeLessThan(s.plannedMonths);
    }
  });
});
