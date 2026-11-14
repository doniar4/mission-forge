import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import { emptyDesign, scenarioById } from './scenarios';
import { ROLE_LIST, TEAM_MAX, goalsFor, initialTeam, reduce, rolesOf, teamwork, type ClientMsg, type TeamState } from './team';

const ctx = { seed: 7 };
const send = (s: TeamState, from: string, m: ClientMsg) => reduce(s, from, m, ctx);

/** A host plus two players with the four roles shared out: the host holds two. */
function room(): TeamState {
  let s = initialTeam('ABCDE', 'local', 'firewatch', 'engineer', 'Anna');
  s = send(s, 'p1', { t: 'hello', name: 'Boris' });
  s = send(s, 'p2', { t: 'hello', name: 'Clara' });
  s = send(s, 'host', { t: 'claim', role: 'manager' });
  s = send(s, 'host', { t: 'claim', role: 'comms' });
  s = send(s, 'p1', { t: 'claim', role: 'science' });
  s = send(s, 'p2', { t: 'claim', role: 'engineer' });
  return send(s, 'host', { t: 'start' });
}

/** The reference firewatch solution, split across the roles that own each part. */
function solve(s: TeamState): TeamState {
  s = send(s, 'p1', { t: 'patch', patch: { orbit: 'sso', instruments: ['thermal_ir', 'cam_wide'] } });
  s = send(s, 'p2', { t: 'patch', patch: { power: 'small', battery: 'b500', adcs: 'wheels', propulsion: 'mono' } });
  s = send(s, 'host', { t: 'patch', patch: { comms: 'xband', ground: 'network', computer: 'standard', vehicle: 'rideshare', lifeYears: 4 } });
  return s;
}

describe('team room', () => {
  it('holds at most three people', () => {
    let s = initialTeam('ABCDE', 'local', 'firewatch', 'engineer', 'Anna');
    for (const id of ['a', 'b', 'c', 'd']) s = send(s, id, { t: 'hello', name: id });
    expect(TEAM_MAX).toBe(3);
    expect(s.members.map((m) => m.id)).toEqual(['host', 'a', 'b']);
  });

  it('gives each role to one person only', () => {
    let s = initialTeam('ABCDE', 'local', 'firewatch', 'engineer', 'Anna');
    s = send(s, 'p1', { t: 'hello', name: 'Boris' });
    s = send(s, 'host', { t: 'claim', role: 'science' });
    const stolen = send(s, 'p1', { t: 'claim', role: 'science' });
    expect(stolen).toBe(s);
    expect(rolesOf(stolen, 'host')).toEqual(['science']);
  });

  it('spreads roles evenly across three players on auto-assign', () => {
    let s = initialTeam('ABCDE', 'local', 'firewatch', 'engineer', 'Anna');
    s = send(s, 'p1', { t: 'hello', name: 'B' });
    s = send(s, 'p2', { t: 'hello', name: 'C' });
    s = send(s, 'host', { t: 'auto' });
    const counts = s.members.map((m) => rolesOf(s, m.id).length).sort();
    expect(counts).toEqual([1, 1, 2]);
    expect(ROLE_LIST.every((r) => s.owners[r])).toBe(true);
  });

  it('only the host sets up the mission and starts the design', () => {
    let s = initialTeam('ABCDE', 'local', 'firewatch', 'engineer', 'Anna');
    s = send(s, 'p1', { t: 'hello', name: 'B' });
    expect(send(s, 'p1', { t: 'setup', scenarioId: 'ocean', difficulty: 'cadet' })).toBe(s);
    expect(send(s, 'host', { t: 'start' })).toBe(s); // roles are not all owned yet
    expect(send(s, 'host', { t: 'setup', scenarioId: 'ocean', difficulty: 'cadet' }).scenarioId).toBe('ocean');
  });

  it('lets a player change only the parts their roles own', () => {
    const s = room();
    const wrong = send(s, 'p1', { t: 'patch', patch: { vehicle: 'atlant', power: 'large' } });
    expect(wrong).toBe(s);
    const right = send(s, 'p1', { t: 'patch', patch: { orbit: 'sso', vehicle: 'atlant' } });
    expect(right.design.orbit).toBe('sso');
    expect(right.design.vehicle).toBeNull();
  });

  it('applies two instrument toggles in a row without losing the first', () => {
    let s = room();
    s = send(s, 'p1', { t: 'toggle', id: 'thermal_ir' });
    s = send(s, 'p1', { t: 'toggle', id: 'cam_wide' });
    expect(s.design.instruments).toEqual(['thermal_ir', 'cam_wide']);
    s = send(s, 'p1', { t: 'toggle', id: 'thermal_ir' });
    expect(s.design.instruments).toEqual(['cam_wide']);
    expect(send(s, 'p2', { t: 'toggle', id: 'sar' })).toBe(s); // not the science role
  });

  it('rejects options the difficulty does not allow', () => {
    let s = room();
    s = send(s, 'host', { t: 'setup', scenarioId: 'firewatch', difficulty: 'cadet' }); // ignored: not in lobby
    expect(s.difficulty).toBe('engineer');
    const cadet = initialTeam('ABCDE', 'local', 'firewatch', 'cadet', 'Anna');
    expect(cadet.design.redundancy).toBe('single');
  });

  it('cannot be told to sign off while the review board has blockers', () => {
    const s = room();
    expect(send(s, 'host', { t: 'ready', ready: true }).ready.host).toBeUndefined();
  });

  it('launches once every role owner has signed off, with a shared seed', () => {
    let s = solve(room());
    expect(evaluate(s.design, scenarioById('firewatch'), 'engineer').blockers).toBe(0);
    s = send(s, 'host', { t: 'ready', ready: true });
    s = send(s, 'p1', { t: 'ready', ready: true });
    expect(s.phase).toBe('design');
    s = send(s, 'p2', { t: 'ready', ready: true });
    expect(s.phase).toBe('flight');
    expect(s.seed).toBe(7);
  });

  it('cancels every sign-off when the design changes', () => {
    let s = solve(room());
    s = send(s, 'host', { t: 'ready', ready: true });
    s = send(s, 'p1', { t: 'ready', ready: true });
    s = send(s, 'p1', { t: 'patch', patch: { instruments: ['thermal_ir'] } });
    expect(s.ready).toEqual({});
  });

  it('frees a leaving player’s roles', () => {
    let s = room();
    s = send(s, 'p2', { t: 'drop' });
    expect(s.owners.engineer).toBeNull();
    expect(s.members.map((m) => m.id)).toEqual(['host', 'p1']);
  });

  it('keeps the last sixty chat lines and ignores empty ones', () => {
    let s = room();
    for (let i = 0; i < 70; i++) s = send(s, 'p1', { t: 'chat', text: `line ${i}` });
    expect(s.chat).toHaveLength(60);
    expect(send(s, 'p1', { t: 'chat', text: '   ' })).toBe(s);
  });

  it('ignores strangers', () => {
    const s = room();
    expect(send(s, 'nobody', { t: 'chat', text: 'hi' })).toBe(s);
  });

  it('returns to design and can relaunch with a new seed', () => {
    let s = solve(room());
    for (const id of ['host', 'p1', 'p2']) s = send(s, id, { t: 'ready', ready: true });
    const again = reduce(s, 'p1', { t: 'relaunch' }, { seed: 99 });
    expect(again.seed).toBe(99);
    const back = send(again, 'p2', { t: 'back' });
    expect(back.phase).toBe('design');
    expect(back.ready).toEqual({});
  });
});

describe('personal goals', () => {
  it('conflict: more science costs the budget reserve', () => {
    const sc = scenarioById('firewatch');
    const lean = { ...emptyDesign(sc), ...solve(room()).design, instruments: ['thermal_ir'], battery: 'b100' };
    const rich = { ...lean, instruments: ['thermal_ir', 'cam_wide', 'multispec'], power: 'medium' };
    const a = goalsFor(sc, evaluate(lean, sc, 'engineer'));
    const b = goalsFor(sc, evaluate(rich, sc, 'engineer'));
    const met = (g: ReturnType<typeof goalsFor>, id: string) => g.find((x) => x.id === id)!.met;
    expect(met(a, 'reserve')).toBe(true);
    expect(met(b, 'reserve')).toBe(false);
    expect(teamwork(a).total).toBe(10);
  });
});
