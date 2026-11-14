import { describe, expect, it } from 'vitest';
import { evaluate, propellantFor } from './evaluate';
import { buildReport } from './report';
import { emptyDesign, scenarioById } from './scenarios';
import { simulate } from './simulate';
import type { Design } from './types';

/** One sensible (not optimal) solution per scenario. They keep the balance honest. */
const REFERENCE: Record<string, Partial<Design>> = {
  firewatch: {
    orbit: 'sso', instruments: ['thermal_ir', 'cam_wide'], power: 'small', battery: 'b500', comms: 'xband',
    ground: 'network', computer: 'standard', adcs: 'wheels', propulsion: 'mono', vehicle: 'rideshare', lifeYears: 4,
  },
  ocean: {
    orbit: 'sso', instruments: ['altimeter', 'sounder'], power: 'medium', battery: 'b500', comms: 'sband',
    ground: 'network', computer: 'standard', adcs: 'wheels', propulsion: 'mono', vehicle: 'kolibri', lifeYears: 8,
    redundancy: 'redundant',
  },
  lunarice: {
    orbit: 'llo', instruments: ['neutron', 'altimeter', 'cam_wide'], power: 'medium', battery: 'b500', comms: 'xband',
    ground: 'dsn', computer: 'standard', adcs: 'wheels', propulsion: 'biprop', vehicle: 'vector', lifeYears: 2,
  },
  sentinel: {
    orbit: 'l1', instruments: ['particles', 'magnetometer', 'coronagraph'], power: 'small', battery: 'b100', comms: 'xband',
    ground: 'dsn', computer: 'standard', adcs: 'precise', propulsion: 'mono', vehicle: 'vector', lifeYears: 5,
    redundancy: 'redundant',
  },
  marsweather: {
    orbit: 'lmo', instruments: ['sounder', 'thermal_ir', 'cam_wide', 'magnetometer'], power: 'large', battery: 'b500',
    comms: 'kaband', ground: 'dsn', computer: 'standard', adcs: 'wheels', propulsion: 'biprop', vehicle: 'atlant', lifeYears: 3,
  },
};

const design = (id: string): Design => ({ ...emptyDesign(scenarioById(id)), ...REFERENCE[id] });

describe('rocket equation', () => {
  it('needs no propellant for no manoeuvre', () => {
    expect(propellantFor(500, 0, 320)).toBe(0);
  });
  it('grows exponentially with delta-v', () => {
    const one = propellantFor(500, 1000, 320);
    const two = propellantFor(500, 2000, 320);
    expect(two).toBeGreaterThan(one * 2);
  });
  it('rewards a more efficient engine', () => {
    expect(propellantFor(500, 1000, 1600)).toBeLessThan(propellantFor(500, 1000, 320) / 4);
  });
  it('reports impossible manoeuvres as infinite', () => {
    expect(propellantFor(500, 2200, 65)).toBe(Infinity);
  });
});

describe('reference designs', () => {
  for (const id of Object.keys(REFERENCE)) {
    const sc = scenarioById(id);
    it(`${id}: passes review and succeeds when nothing goes wrong`, () => {
      const d = design(id);
      const ev = evaluate(d, sc, 'engineer');
      // Fly it many times: a sound design should usually succeed, but not always.
      let wins = 0;
      let points = 0;
      const runs = 200;
      for (let seed = 1; seed <= runs; seed++) {
        const sim = simulate(d, sc, 'engineer', seed);
        if (sim.outcome === 'success') wins++;
        points += buildReport(d, sc, 'engineer', ev, sim).total;
      }
      console.log(
        `${id.padEnd(12)} cost ${Math.round(ev.cost.total)}/${ev.cost.budget}  wet ${Math.round(ev.mass.wet)}/${Math.round(ev.mass.capacity)} kg` +
          `  power ${Math.round(ev.power.average)}/${Math.round(ev.power.load)} W  data ${ev.data.generated.toFixed(1)}/${ev.data.downlink.toFixed(1)} GB` +
          `  dev ${ev.time.devMonths}/${ev.time.deadline} mo  science ${(ev.science.projected * 100).toFixed(0)}%` +
          `  wins ${wins}/${runs}  avg ${Math.round(points / runs)} pts  warns [${ev.checks.map((c) => c.id).join(',')}]`,
      );
      const blockers = ev.checks.filter((c) => c.level === 'blocker').map((c) => c.id);
      expect(blockers).toEqual([]);
      expect(ev.cost.margin).toBeGreaterThan(0.03);
      expect(ev.cost.margin).toBeLessThan(0.3);
      expect(ev.science.projected).toBeGreaterThan(1);
      expect(wins / runs).toBeGreaterThan(0.6);
      expect(wins / runs).toBeLessThan(0.98);
    });
  }
});

describe('consequences', () => {
  const sc = scenarioById('firewatch');

  it('an empty design is blocked with explanations', () => {
    const ev = evaluate(emptyDesign(sc), sc, 'engineer');
    expect(ev.checks.map((c) => c.id)).toEqual(expect.arrayContaining(['no_orbit', 'no_instruments', 'no_vehicle']));
  });

  it('a radar on tiny solar cells cannot be powered', () => {
    const d: Design = { ...design('firewatch'), instruments: ['sar'], power: 'small' };
    const ids = evaluate(d, sc, 'engineer').checks.map((c) => c.id);
    expect(ids).toContain('power_deficit');
  });

  it('more instruments cost mass, power, money and data', () => {
    const a = evaluate(design('firewatch'), sc, 'engineer');
    const b = evaluate({ ...design('firewatch'), instruments: ['thermal_ir', 'cam_wide', 'multispec'] }, sc, 'engineer');
    expect(b.mass.wet).toBeGreaterThan(a.mass.wet);
    expect(b.power.load).toBeGreaterThan(a.power.load);
    expect(b.cost.total).toBeGreaterThan(a.cost.total);
    expect(b.data.generated).toBeGreaterThan(a.data.generated);
    expect(b.science.ratePerYear).toBeGreaterThan(a.science.ratePerYear);
  });

  it('a weak downlink loses data and science', () => {
    const d: Design = { ...design('firewatch'), comms: 'uhf', ground: 'own' };
    const ev = evaluate(d, sc, 'engineer');
    expect(ev.checks.map((c) => c.id)).toContain('data_bottleneck');
    expect(simulate(d, sc, 'cadet', 7).outcome).not.toBe('success');
  });

  it('magnetorquers do not work away from Earth', () => {
    const moon = scenarioById('lunarice');
    const ev = evaluate({ ...design('lunarice'), adcs: 'magnetic' }, moon, 'engineer');
    expect(ev.checks.map((c) => c.id)).toContain('magnetic');
  });

  it('low Earth orbit decays without an engine', () => {
    const ocean = scenarioById('ocean');
    const d: Design = { ...design('ocean'), orbit: 'leo', propulsion: 'none' };
    expect(evaluate(d, ocean, 'engineer').time.effectiveYears).toBe(4);
    const sim = simulate(d, ocean, 'cadet', 3);
    expect(sim.monthsOperated).toBeLessThanOrEqual(48);
  });

  it('the same seed replays the same mission', () => {
    const d = design('marsweather');
    const mars = scenarioById('marsweather');
    expect(simulate(d, mars, 'director', 42)).toEqual(simulate(d, mars, 'director', 42));
  });
});
