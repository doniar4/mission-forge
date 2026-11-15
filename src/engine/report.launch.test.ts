import { expect, it } from 'vitest';
import { buildReport } from './report';
import { emptyDesign, scenarioById } from './scenarios';
import { evaluate } from './evaluate';
import { simulate } from './simulate';
import type { Design } from './types';

it.each([
  ['rideshare', 'rideshare allocation'],
  ['titan', 'payload capacity for the selected orbit'],
])('describes unused capacity for %s without promising cheaper launch', (vehicle, label) => {
  const scenario = scenarioById('training');
  const design: Design = { ...emptyDesign(scenario), orbit: 'sso', instruments: ['cam_mid'], power: 'small', vehicle };
  const evaluation = evaluate(design, scenario, 'engineer');
  expect(evaluation.mass.margin).toBeGreaterThan(0.6);
  const report = buildReport(design, scenario, 'engineer', evaluation, simulate(design, scenario, 'engineer', 3));
  const insight = report.insights.find((item) => item.title.en === 'Payload capacity margin');
  expect(insight?.text.en).toBe(`Used ${Math.round((1 - evaluation.mass.margin) * 100)}% of the ${label}.`);
});
