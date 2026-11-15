import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import { maturityOf } from './maturity';
import { emptyDesign, scenarioById } from './scenarios';
import type { Design } from './types';

const sc = scenarioById('firewatch');
const at = (patch: Partial<Design>) => {
  const d = { ...emptyDesign(sc), ...patch };
  return maturityOf(d, evaluate(d, sc, 'engineer').checks).level;
};

describe('concept maturity (JPL CML)', () => {
  it('climbs from an idea to a point design as the hangar fills in', () => {
    expect(at({ orbit: null, instruments: [], vehicle: null })).toBe(1);
    expect(at({ orbit: 'sso', instruments: [], vehicle: null })).toBe(2);
    // Everything chosen, but the rocket cannot reach the orbit: the choices clash.
    expect(at({ orbit: 'geo', instruments: ['thermal_ir'], vehicle: 'kolibri' })).toBe(3);
    expect(
      at({ orbit: 'sso', instruments: ['thermal_ir', 'multispec'], power: 'medium', battery: 'b500', comms: 'xband', ground: 'network', computer: 'standard', adcs: 'wheels', propulsion: 'mono', vehicle: 'rideshare', lifeYears: 3 }),
    ).toBe(4);
  });
});
