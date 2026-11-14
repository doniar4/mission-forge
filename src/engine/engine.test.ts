import { describe, expect, it } from 'vitest';
import { sanitize } from './design';
import { OVERLAP, evaluate, propellantFor } from './evaluate';
import { buildReport } from './report';
import { emptyDesign, scenarioById } from './scenarios';
import { simulate } from './simulate';
import { ADCS, ANTENNAS, BATTERIES, COMPUTERS, INSTRUMENTS, POWER, TESTING, VEHICLES } from './catalog';
import type { Design, Measure } from './types';

/**
 * Three sensible (not optimal) solutions per scenario, one per instrument class. They keep the
 * balance honest: entry-level payloads are cheap and return part of the science, standard ones
 * meet the target, professional ones return more for a budget only the easiest level allows.
 */
type Rung = 'entry' | 'std' | 'pro';
const LADDER: Record<string, Record<Rung, Partial<Design>>> = {
  firewatch: {
    entry: { orbit: 'sso', instruments: ['thermal_micro', 'multispec_lite', 'cam_wide'], power: 'small', battery: 'b100', comms: 'sband', ground: 'network', computer: 'standard', adcs: 'magnetic', propulsion: 'mono', vehicle: 'rideshare', lifeYears: 3 },
    std: { orbit: 'sso', instruments: ['thermal_ir', 'multispec'], power: 'medium', battery: 'b500', comms: 'xband', ground: 'network', computer: 'standard', adcs: 'wheels', propulsion: 'mono', vehicle: 'rideshare', lifeYears: 3 },
    pro: { orbit: 'sso', instruments: ['thermal_cryo', 'multispec'], power: 'medium', battery: 'b500', comms: 'xband', ground: 'own', computer: 'standard', adcs: 'precise', propulsion: 'mono', vehicle: 'kolibri', lifeYears: 3 },
  },
  ocean: {
    entry: { orbit: 'sso', instruments: ['alt_lidar', 'sounder_lite', 'scatterometer'], power: 'small', battery: 'b100', comms: 'sband', ground: 'network', computer: 'basic', adcs: 'wheels', propulsion: 'mono', vehicle: 'rideshare', lifeYears: 7 },
    std: { orbit: 'sso', instruments: ['altimeter', 'sounder', 'scatterometer'], power: 'medium', battery: 'b500', comms: 'sband', ground: 'network', computer: 'standard', adcs: 'wheels', propulsion: 'mono', vehicle: 'kolibri', lifeYears: 7, redundancy: 'redundant' },
    pro: { orbit: 'sso', instruments: ['alt_pro', 'sounder', 'scatterometer'], power: 'medium', battery: 'b500', comms: 'sband', ground: 'network', computer: 'standard', adcs: 'wheels', propulsion: 'mono', vehicle: 'vector', lifeYears: 7, redundancy: 'redundant' },
  },
  lunarice: {
    entry: { orbit: 'llo', instruments: ['neutron', 'alt_lidar', 'cam_wide'], power: 'small', battery: 'b500', comms: 'sband', ground: 'dsn', computer: 'standard', adcs: 'wheels', propulsion: 'biprop', vehicle: 'vector', lifeYears: 2 },
    std: { orbit: 'llo', instruments: ['spectrometer', 'neutron', 'altimeter', 'cam_wide'], power: 'medium', battery: 'b500', comms: 'xband', ground: 'dsn', computer: 'standard', adcs: 'wheels', propulsion: 'biprop', vehicle: 'vector', lifeYears: 2 },
    pro: { orbit: 'llo', instruments: ['gamma_suite', 'altimeter', 'cam_wide'], power: 'medium', battery: 'b500', comms: 'xband', ground: 'dsn', computer: 'standard', adcs: 'wheels', propulsion: 'biprop', vehicle: 'vector', lifeYears: 2 },
  },
  sentinel: {
    entry: { orbit: 'l1', instruments: ['particles_lite', 'mag_chip', 'solar_xray'], power: 'small', battery: 'b100', comms: 'xband', ground: 'dsn', computer: 'standard', adcs: 'wheels', propulsion: 'mono', vehicle: 'vector', lifeYears: 5 },
    std: { orbit: 'l1', instruments: ['particles', 'magnetometer', 'euv_imager'], power: 'small', battery: 'b100', comms: 'xband', ground: 'dsn', computer: 'standard', adcs: 'wheels', propulsion: 'mono', vehicle: 'vector', lifeYears: 5, redundancy: 'redundant' },
    pro: { orbit: 'l1', instruments: ['plasma_suite', 'magnetometer', 'coronagraph'], power: 'small', battery: 'b100', comms: 'xband', ground: 'dsn', computer: 'standard', adcs: 'precise', propulsion: 'mono', vehicle: 'vector', lifeYears: 5 },
  },
  marsweather: {
    entry: { orbit: 'lmo', instruments: ['sounder_lite', 'thermal_micro', 'cam_wide', 'mag_chip'], power: 'medium', battery: 'b500', comms: 'xband', ground: 'dsn', computer: 'standard', adcs: 'wheels', propulsion: 'biprop', vehicle: 'atlant', lifeYears: 3 },
    std: { orbit: 'lmo', instruments: ['sounder', 'thermal_ir', 'cam_mid', 'magnetometer'], power: 'large', battery: 'b500', comms: 'kaband', ground: 'dsn', computer: 'standard', adcs: 'wheels', propulsion: 'biprop', vehicle: 'atlant', lifeYears: 3 },
    pro: { orbit: 'lmo', instruments: ['sounder_pro', 'cam_mid', 'magnetometer'], power: 'large', battery: 'b500', comms: 'kaband', ground: 'dsn', computer: 'advanced', adcs: 'wheels', propulsion: 'biprop', vehicle: 'atlant', lifeYears: 3 },
  },
};

const design = (id: string, rung: Rung = 'std'): Design => ({ ...emptyDesign(scenarioById(id)), ...LADDER[id][rung] });

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
  const fly = (id: string, rung: Rung, diff: 'cadet' | 'engineer') => {
    const sc = scenarioById(id);
    const d = design(id, rung);
    const ev = evaluate(d, sc, diff);
    // Fly it many times: a sound design should usually succeed, but not always.
    let wins = 0;
    let partial = 0;
    let points = 0;
    const runs = 200;
    for (let seed = 1; seed <= runs; seed++) {
      const sim = simulate(d, sc, diff, seed);
      if (sim.outcome === 'success') wins++;
      else if (sim.outcome === 'partial') partial++;
      points += buildReport(d, sc, diff, ev, sim).total;
    }
    console.log(
      `${id.padEnd(12)} ${rung.padEnd(5)} cost ${Math.round(ev.cost.total)}/${ev.cost.budget}  wet ${Math.round(ev.mass.wet)}/${Math.round(ev.mass.capacity)} kg` +
        `  power ${Math.round(ev.power.average)}/${Math.round(ev.power.load)} W  data ${ev.data.generated.toFixed(1)}/${ev.data.downlink.toFixed(1)} GB` +
        `  dev ${ev.time.devMonths}/${ev.time.deadline} mo  science ${(ev.science.projected * 100).toFixed(0)}%` +
        `  wins ${wins} partial ${partial} of ${runs}  avg ${Math.round(points / runs)} pts  warns [${ev.checks.map((c) => c.id).join(',')}]`,
    );
    const blockers = ev.checks.filter((c) => c.level === 'blocker').map((c) => c.id);
    return { ev, blockers, wins: wins / runs, partial: partial / runs, points: points / runs };
  };

  for (const id of Object.keys(LADDER)) {
    it(`${id}: the standard design passes review and usually succeeds`, () => {
      const r = fly(id, 'std', 'engineer');
      expect(r.blockers).toEqual([]);
      expect(r.ev.cost.margin).toBeGreaterThan(0.03);
      expect(r.ev.cost.margin).toBeLessThan(0.3);
      expect(r.ev.science.projected).toBeGreaterThan(1);
      expect(r.wins).toBeGreaterThan(0.6);
      expect(r.wins).toBeLessThan(0.98);
    });

    it(`${id}: the entry-level design is cheap and returns part of the science`, () => {
      const r = fly(id, 'entry', 'engineer');
      const std = fly(id, 'std', 'engineer');
      expect(r.blockers).toEqual([]);
      expect(r.ev.cost.total).toBeLessThan(0.8 * r.ev.cost.budget);
      expect(r.ev.science.projected).toBeGreaterThan(0.5);
      expect(r.ev.science.projected).toBeLessThan(0.9);
      expect(r.wins).toBeLessThan(0.2);
      expect(r.wins + r.partial).toBeGreaterThan(0.6);
      // Saving money must not beat doing the job.
      expect(r.points).toBeLessThan(std.points);
    });

    it(`${id}: the professional design returns more science for more money, and still fits`, () => {
      const r = fly(id, 'pro', 'engineer');
      const std = fly(id, 'std', 'engineer');
      expect(r.blockers).toEqual([]);
      expect(r.ev.science.projected).toBeGreaterThan(std.ev.science.projected + 0.05);
      expect(r.ev.cost.total).toBeGreaterThan(std.ev.cost.total);
      expect(r.ev.cost.payload).toBeGreaterThan(std.ev.cost.payload);
      expect(r.wins).toBeGreaterThan(0.6);
      // A different strategy, not a better one: within 10% of the standard design's score.
      expect(Math.abs(r.points - std.points) / std.points).toBeLessThan(0.1);
    });

    it(`${id}: every reference design is one a player could actually build`, () => {
      const sc = scenarioById(id);
      for (const rung of ['entry', 'std', 'pro'] as Rung[]) expect(sanitize(design(id, rung), sc, 'engineer'), rung).toEqual(design(id, rung));
    });

    it(`${id}: the standard instruments can fly on every difficulty`, () => {
      const sc = scenarioById(id);
      for (const diff of ['cadet', 'engineer', 'director'] as const) {
        const d = sanitize(design(id), sc, diff);
        const blockers = evaluate(d, sc, diff).checks.filter((c) => c.level === 'blocker').map((c) => c.id);
        expect(blockers, diff).toEqual([]);
      }
    });
  }
});

describe('instrument classes', () => {
  const families: Measure[] = ['visible', 'thermal', 'multispectral', 'radar', 'altimetry', 'atmosphere', 'composition', 'magnetic', 'particles', 'solar'];
  const best = (m: Measure, tier: number) =>
    INSTRUMENTS.filter((i) => i.tier === tier).sort((a, b) => (b.measures[m] ?? 0) - (a.measures[m] ?? 0))[0];

  it('every kind of measurement has an entry, a standard and a professional instrument', () => {
    for (const m of families) for (const tier of [1, 2, 3]) expect(best(m, tier).measures[m] ?? 0, `${m} class ${tier}`).toBeGreaterThan(0.3);
  });

  it('a higher class measures better and costs more mass, power and money', () => {
    for (const m of families) {
      const [a, b, c] = [1, 2, 3].map((tier) => best(m, tier));
      for (const [lo, hi] of [[a, b], [b, c]]) {
        expect(hi.measures[m]!, `${m}: ${hi.id} quality`).toBeGreaterThan(lo.measures[m]!);
        expect(hi.mass, `${m}: ${hi.id} mass`).toBeGreaterThan(lo.mass);
        expect(hi.power, `${m}: ${hi.id} power`).toBeGreaterThan(lo.power);
        expect(hi.cost, `${m}: ${hi.id} cost`).toBeGreaterThan(lo.cost);
      }
    }
  });

  it('quality gets dearer with every class: no instrument is simply the best buy', () => {
    for (const m of families) {
      const [a, b, c] = [1, 2, 3].map((tier) => best(m, tier));
      const perMillion = (i: (typeof INSTRUMENTS)[number]) => i.measures[m]! / i.cost;
      expect(perMillion(a), m).toBeGreaterThan(perMillion(b));
      expect(perMillion(b), m).toBeGreaterThan(perMillion(c));
    }
  });

  it('flying longer than the customer asked is worth half as much as flying on target', () => {
    const sc = scenarioById('sentinel');
    const on = evaluate({ ...design('sentinel'), lifeYears: 5 }, sc, 'engineer').science.projected;
    const longer = evaluate({ ...design('sentinel'), lifeYears: 7 }, sc, 'engineer').science.projected;
    expect(longer / on).toBeCloseTo(1.2, 1);
    // The extension earns science for at most half the target years again.
    const capped = evaluate({ ...design('sentinel'), lifeYears: 8 }, sc, 'engineer').science.projected;
    const longest = evaluate({ ...design('sentinel'), lifeYears: 10 }, sc, 'engineer').science.projected;
    expect(longest).toBeCloseTo(capped, 5);
    expect(longest / on).toBeCloseTo(1.25, 2);
  });

  it('a cheap duplicate adds little to a measurement a better instrument already covers', () => {
    const sc = scenarioById('firewatch');
    const q = (ids: string[]) => evaluate({ ...design('firewatch'), adcs: 'precise', instruments: ids }, sc, 'engineer').science.quality.thermal ?? 0;
    const alone = q(['thermal_ir']);
    const both = q(['thermal_ir', 'thermal_micro']);
    expect(both - alone).toBeCloseTo(OVERLAP * 0.4 * (1 - alone), 5);
    expect(both).toBeLessThan(q(['thermal_cryo']));
  });

  it('shows the data the payload makes even when it is starved of power', () => {
    const sc = scenarioById('firewatch');
    const ev = evaluate({ ...design('firewatch'), power: 'body' }, sc, 'engineer');
    expect(ev.power.margin).toBeLessThan(0);
    expect(ev.data.generated).toBeGreaterThan(10);
  });
});

describe('platform components', () => {
  const rising = <T,>(list: T[], keys: (keyof T)[]) => {
    for (let i = 1; i < list.length; i++)
      for (const k of keys) expect(list[i][k] as number, `${String(k)} of item ${i}`).toBeGreaterThan(list[i - 1][k] as number);
  };

  it('a bigger choice always costs more mass and money: nothing is free', () => {
    rising(POWER.filter((p) => p.solar), ['watts', 'mass', 'cost']);
    rising(BATTERIES, ['wh', 'mass', 'cost']);
    rising(ANTENNAS.filter((x) => x.id !== 'laser'), ['mbps', 'mass', 'power', 'cost']);
    rising(COMPUTERS, ['storage', 'mass', 'power', 'cost']);
    rising(ADCS, ['pointing', 'mass', 'power', 'cost']);
    rising(VEHICLES, ['leoKg', 'cost']);
    rising(TESTING, ['cost', 'months']);
  });

  it('a single station of your own cannot carry a mission at the Moon or beyond', () => {
    for (const id of ['lunarice', 'sentinel', 'marsweather']) {
      const sc = scenarioById(id);
      const own = evaluate({ ...design(id), ground: 'own' }, sc, 'engineer');
      const dsn = evaluate({ ...design(id), ground: 'dsn' }, sc, 'engineer');
      expect(own.checks.map((c) => c.id), id).toContain('data_bottleneck');
      expect(dsn.data.downlink, id).toBeGreaterThan(own.data.downlink * 20);
    }
  });

  it('an entry-level payload gets by on a cheaper radio than a standard one', () => {
    const sc = scenarioById('lunarice');
    const ids = (rung: Rung) => evaluate({ ...design('lunarice', rung), comms: 'sband' }, sc, 'engineer').checks.map((c) => c.id);
    expect(ids('entry')).not.toContain('data_bottleneck');
    expect(ids('std')).toContain('data_bottleneck');
  });

  const average = (d: Design, id: string) => {
    const sc = scenarioById(id);
    const ev = evaluate(d, sc, 'engineer');
    let wins = 0;
    for (let seed = 1; seed <= 200; seed++) if (simulate(d, sc, 'engineer', seed).outcome === 'success') wins++;
    return { wins, cost: ev.cost.total };
  };

  it('a backup set and thorough testing buy reliability with money', () => {
    const single = average({ ...design('ocean'), redundancy: 'single' }, 'ocean');
    const backup = average({ ...design('ocean'), redundancy: 'redundant' }, 'ocean');
    expect(backup.wins).toBeGreaterThan(single.wins + 15);
    expect(backup.cost).toBeGreaterThan(single.cost);
    const quick = average({ ...design('marsweather'), testing: 'minimal' }, 'marsweather');
    const thorough = average({ ...design('marsweather'), testing: 'extensive' }, 'marsweather');
    expect(thorough.wins).toBeGreaterThan(quick.wins + 15);
    expect(thorough.cost).toBeGreaterThan(quick.cost);
  });
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
