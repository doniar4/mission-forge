import { describe, expect, it } from 'vitest';
import { CRISIS_OPTIONS, simulate } from './simulate';
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
  it('most flights meet at least one decision, never more than two', () => {
    const met = flights.filter((s) => s.crises.length > 0).length;
    expect(met / flights.length).toBeGreaterThan(0.7);
    for (const s of flights) expect(s.crises.length).toBeLessThanOrEqual(2);
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
