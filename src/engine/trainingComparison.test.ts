import { expect, it } from 'vitest';
import { compareFireWatch } from './trainingComparison';

it('compares antenna choices under matching external events', () => {
  const [s, x] = compareFireWatch();
  expect(x.design).toEqual({ ...s.design, comms: 'xband' });
  for (const result of [s, x]) {
    expect(result.resources.blockers).toBe(0);
    expect(result.flight.monthsOperated).toBe(36);
    expect(result.flight.lost).toBeNull();
    expect(result.flight.crises.map(({ id, chosen }) => [id, chosen])).toEqual([
      ['outage-10', 'reroute'], ['budget-21', 'fewer_passes'], ['storm-33', 'safe'],
    ]);
    expect(result.flight.events.filter((e) => [11, 12].includes(e.month)).map((e) => e.title.en))
      .toEqual(['Ground station outage', 'Solar storm']);
  }
  expect(x.resources.data.generated).toBeCloseTo(s.resources.data.generated);
  expect(x.flight.dataReturned).toBeGreaterThan(s.flight.dataReturned);
  expect(x.resources.cost.total).toBeGreaterThan(s.resources.cost.total);
});
