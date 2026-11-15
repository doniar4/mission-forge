import { evaluate } from './evaluate';
import { emptyDesign, scenarioById } from './scenarios';
import { simulate } from './simulate';
import type { Choices, Design } from './types';

const choices: Choices = {
  'outage-10': 'reroute',
  'budget-21': 'fewer_passes',
  'storm-33': 'safe',
};

export function compareFireWatch() {
  const scenario = scenarioById('firewatch');
  const design: Design = {
    ...emptyDesign(scenario),
    orbit: 'sso',
    instruments: ['thermal_ir', 'multispec'],
    power: 'medium',
    battery: 'b500',
    ground: 'network',
    computer: 'standard',
    adcs: 'wheels',
    propulsion: 'mono',
    vehicle: 'rideshare',
    lifeYears: 3,
  };
  return ['sband', 'xband'].map((comms) => {
    const variant = { ...design, comms };
    return {
      design: variant,
      resources: evaluate(variant, scenario, 'engineer'),
      flight: simulate(variant, scenario, 'engineer', 3, choices),
    };
  });
}
