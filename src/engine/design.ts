import { ADCS, ANTENNAS, BATTERIES, COMPUTERS, INSTRUMENTS, POWER, PROPULSION, STRUCTURES, VEHICLES, byId } from './catalog';
import { emptyDesign, scenarioOrbits } from './scenarios';
import type { Design, Difficulty, Scenario } from './types';

/** Keeps a saved, shared or networked design valid for the scenario and difficulty it is opened in. */
export function sanitize(d: Design, sc: Scenario, diff: Difficulty): Design {
  const base = emptyDesign(sc);
  const allowAdvanced = diff !== 'cadet';
  const ok = <T extends { id: string; advanced?: boolean }>(list: T[], id: string | null, fallback: string) => {
    const item = byId(list, id);
    return item && (allowAdvanced || !item.advanced) ? item.id : fallback;
  };
  const vehicle = byId(VEHICLES, d.vehicle);
  const testing = ['minimal', 'standard', 'extensive'].includes(d.testing) ? d.testing : base.testing;
  const ground = ['own', 'network', 'dsn'].includes(d.ground) ? d.ground : base.ground;
  return {
    ...base,
    ...d,
    orbit: d.orbit && scenarioOrbits(sc).includes(d.orbit) ? d.orbit : null,
    instruments: [...new Set(d.instruments ?? [])].filter((id) => {
      const i = byId(INSTRUMENTS, id);
      return i && (allowAdvanced || !i.advanced);
    }),
    power: ok(POWER, d.power, base.power),
    battery: ok(BATTERIES, d.battery, base.battery),
    comms: ok(ANTENNAS, d.comms, base.comms),
    computer: ok(COMPUTERS, d.computer, base.computer),
    adcs: ok(ADCS, d.adcs, base.adcs),
    propulsion: ok(PROPULSION, d.propulsion, base.propulsion),
    structure: ok(STRUCTURES, d.structure, base.structure),
    vehicle: vehicle && (allowAdvanced || !vehicle.advanced) ? vehicle.id : null,
    redundancy: allowAdvanced && d.redundancy === 'redundant' ? 'redundant' : 'single',
    testing,
    ground,
    lifeYears: Math.min(10, Math.max(1, Math.round(Number(d.lifeYears) || sc.targetYears))),
  };
}
