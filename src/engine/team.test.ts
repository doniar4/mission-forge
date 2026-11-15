import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import { emptyDesign, scenarioById } from './scenarios';
import { describe as describeEvent } from './development';
import { ROLE_LIST, TEAM_MAX, goalsFor, initialTeam, reduce, rolesOf, tally, teamwork, type ClientMsg, type TeamState } from './team';

const ctx = { seed: 7 };
const send = (s: TeamState, from: string, m: ClientMsg) => reduce(s, from, m, ctx);

/** A host plus two players with the four roles shared out: the host holds two. */
function room(): TeamState {
  let s = initialTeam('ABCDE', 'local', 'firewatch', 'engineer', 'Anna');
  s = send(s, 'p1', { t: 'hello', name: 'Boris' });
  s = send(s, 'p2', { t: 'hello', name: 'Clara' });
  s = send(s, 'host', { t: 'claim', role: 'manager' });
  s = send(s, 'p1', { t: 'claim', role: 'science' });
  s = send(s, 'p2', { t: 'claim', role: 'engineer' });
  // Everyone has a role, so the host may now take the fourth.
  s = send(s, 'host', { t: 'claim', role: 'comms' });
  return send(s, 'host', { t: 'start' });
}

/**
 * Development, played safe: each event's owner takes the first option. With `pick` a test can
 * answer differently. Returns the state after the last answer.
 */
function develop(s: TeamState, pick: (i: number) => string = () => ''): TeamState {
  const dev = s.design.dev!;
  dev.events.forEach((e, i) => {
    const owner = s.owners[e.role]!;
    const choice = pick(i) || describeEvent(e, s.design).options[0].id;
    s = send(s, owner, { t: 'dev', i, choice });
  });
  return s;
}

/** The reference firewatch solution, split across the roles that own each part. */
function solve(s: TeamState): TeamState {
  s = send(s, 'p1', { t: 'patch', patch: { orbit: 'sso', instruments: ['thermal_ir', 'cam_wide'] } });
  s = send(s, 'p2', { t: 'patch', patch: { power: 'small', battery: 'b500', adcs: 'wheels', propulsion: 'mono' } });
  s = send(s, 'host', { t: 'patch', patch: { comms: 'xband', ground: 'network', computer: 'standard', vehicle: 'rideshare', lifeYears: 4 } });
  return s;
}

describe('team room', () => {
  it('holds at most four people, one per role', () => {
    let s = initialTeam('ABCDE', 'local', 'firewatch', 'engineer', 'Anna');
    for (const id of ['a', 'b', 'c', 'd']) s = send(s, id, { t: 'hello', name: id });
    expect(TEAM_MAX).toBe(4);
    expect(TEAM_MAX).toBe(ROLE_LIST.length);
    expect(s.members.map((m) => m.id)).toEqual(['host', 'a', 'b', 'c']);
  });

  it('gives four players one role each on auto-assign', () => {
    let s = initialTeam('ABCDE', 'local', 'firewatch', 'engineer', 'Anna');
    for (const id of ['a', 'b', 'c']) s = send(s, id, { t: 'hello', name: id });
    s = send(s, 'host', { t: 'auto' });
    expect(s.members.map((m) => rolesOf(s, m.id).length)).toEqual([1, 1, 1, 1]);
  });

  it('lets nobody take a second role while a teammate has none', () => {
    let s = initialTeam('ABCDE', 'local', 'firewatch', 'engineer', 'Anna');
    s = send(s, 'p1', { t: 'hello', name: 'Boris' });
    s = send(s, 'host', { t: 'claim', role: 'manager' });
    expect(send(s, 'host', { t: 'claim', role: 'comms' })).toBe(s);
    s = send(s, 'p1', { t: 'claim', role: 'science' });
    expect(rolesOf(send(s, 'host', { t: 'claim', role: 'comms' }), 'host')).toEqual(['manager', 'comms']);
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
    // Signed off by all: development first, with events drawn from the shared seed.
    expect(s.phase).toBe('dev');
    expect(s.design.dev!.events).toHaveLength(3);
    s = develop(s);
    expect(s.phase).toBe('flight');
    expect(s.seed).toBe(7);
  });

  it('lets only the owner of the role answer a development event, once', () => {
    let s = solve(room());
    for (const id of ['host', 'p1', 'p2']) s = send(s, id, { t: 'ready', ready: true });
    const e = s.design.dev!.events[0];
    const owner = s.owners[e.role]!;
    const stranger = ['host', 'p1', 'p2'].find((id) => !rolesOf(s, id).includes(e.role))!;
    const option = describeEvent(e, s.design).options[0].id;
    expect(send(s, stranger, { t: 'dev', i: 0, choice: option })).toBe(s);
    const answered = send(s, owner, { t: 'dev', i: 0, choice: option });
    expect(answered.design.dev!.choices[0]).toBe(option);
    expect(send(answered, owner, { t: 'dev', i: 0, choice: option })).toBe(answered);
  });

  it('sends the team back to the hangar when development breaks a limit', () => {
    let s = solve(room());
    for (const id of ['host', 'p1', 'p2']) s = send(s, id, { t: 'ready', ready: true });
    // Force an over-budget outcome: a huge cut the team accepts.
    s = { ...s, design: { ...s.design, dev: { seed: 1, events: [{ kind: 'budget', size: 0.6, role: 'manager' }], choices: [null] } } };
    s = send(s, 'host', { t: 'dev', i: 0, choice: 'accept' });
    expect(s.phase).toBe('design');
    expect(evaluate(s.design, scenarioById('firewatch'), 'engineer').checks.map((c) => c.id)).toContain('over_budget');
    // After fixing and signing off again the mission flies without a second development.
    s = send(s, 'host', { t: 'patch', patch: { lifeYears: 1 } });
    s = send(s, 'p1', { t: 'patch', patch: { instruments: ['thermal_micro'] } });
    expect(evaluate(s.design, scenarioById('firewatch'), 'engineer').blockers).toBe(0);
    for (const id of ['host', 'p1', 'p2']) s = send(s, id, { t: 'ready', ready: true });
    expect(s.phase).toBe('flight');
  });

  it('cancels every sign-off when the design changes', () => {
    let s = solve(room());
    s = send(s, 'host', { t: 'ready', ready: true });
    s = send(s, 'p1', { t: 'ready', ready: true });
    s = send(s, 'p1', { t: 'patch', patch: { instruments: ['thermal_ir'] } });
    expect(s.ready).toEqual({});
  });

  it('frees a leaving player’s roles in the lobby', () => {
    let s = initialTeam('ABCDE', 'local', 'firewatch', 'engineer', 'Anna');
    s = send(s, 'p1', { t: 'hello', name: 'Boris' });
    s = send(s, 'p1', { t: 'claim', role: 'science' });
    s = send(s, 'p1', { t: 'drop' });
    expect(s.owners.science).toBeNull();
    expect(s.members.map((m) => m.id)).toEqual(['host']);
  });

  it('hands a leaver’s roles to the least busy player while designing', () => {
    let s = room();
    s = send(s, 'p2', { t: 'drop' });
    // The host already holds two roles, Boris one: the engineer's sections go to Boris.
    expect(s.owners.engineer).toBe('p1');
    expect(s.members.map((m) => m.id)).toEqual(['host', 'p1']);
    expect(rolesOf(s, 'p1')).toEqual(['science', 'engineer']);
  });

  it('does not wait for the sign-off of someone who left', () => {
    let s = solve(room());
    s = send(s, 'host', { t: 'ready', ready: true });
    s = send(s, 'p1', { t: 'ready', ready: true });
    expect(s.phase).toBe('design');
    // Clara never signs off and closes her tab: the engineer's role goes to Boris, who must look
    // at the new sections and sign off again; then the mission flies.
    s = send(s, 'p2', { t: 'drop' });
    expect(s.phase).toBe('design');
    expect(s.ready.p1).toBeUndefined();
    expect(s.ready.host).toBe(true);
    s = send(s, 'p1', { t: 'ready', ready: true });
    expect(s.phase).toBe('dev');
    s = develop(s);
    expect(s.phase).toBe('flight');
    expect(s.seed).toBe(7);
  });

  it('launches at once when the leaver’s roles go to someone who had already signed off', () => {
    let s = initialTeam('ABCDE', 'local', 'firewatch', 'engineer', 'Anna');
    s = send(s, 'p1', { t: 'hello', name: 'Boris' });
    s = send(s, 'host', { t: 'claim', role: 'manager' });
    s = send(s, 'p1', { t: 'claim', role: 'engineer' });
    s = send(s, 'host', { t: 'claim', role: 'comms' });
    s = send(s, 'host', { t: 'claim', role: 'science' });
    s = send(s, 'host', { t: 'start' });
    s = send(s, 'host', { t: 'patch', patch: { orbit: 'sso', instruments: ['thermal_ir', 'cam_wide'], comms: 'xband', ground: 'network', computer: 'standard', vehicle: 'rideshare', lifeYears: 4 } });
    s = send(s, 'p1', { t: 'patch', patch: { power: 'small', battery: 'b500', adcs: 'wheels', propulsion: 'mono' } });
    s = send(s, 'host', { t: 'ready', ready: true });
    // The engineer leaves; the host now holds every role, but has not seen the engineer's sections
    // as their own yet, so the sign-off is asked for again.
    s = send(s, 'p1', { t: 'drop' });
    expect(rolesOf(s, 'host')).toEqual(['manager', 'science', 'engineer', 'comms']);
    expect(s.phase).toBe('design');
    s = send(s, 'host', { t: 'ready', ready: true });
    expect(s.phase).toBe('dev');
    s = develop(s);
    expect(s.phase).toBe('flight');
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
    s = develop(s);
    const again = reduce(s, 'p1', { t: 'relaunch' }, { seed: 99 });
    expect(again.seed).toBe(99);
    const back = send(again, 'p2', { t: 'back' });
    expect(back.phase).toBe('design');
    expect(back.ready).toEqual({});
    // A new attempt goes through a new development.
    expect(back.design.dev).toBeUndefined();
  });
});

describe('personal goals', () => {
  it('conflict: more science costs the budget reserve', () => {
    const sc = scenarioById('firewatch');
    const lean = { ...emptyDesign(sc), ...solve(room()).design, instruments: ['thermal_ir'], battery: 'b100' };
    const rich = { ...lean, instruments: ['thermal_cryo', 'multispec', 'cam_mid'], power: 'medium', adcs: 'precise' };
    const a = goalsFor(sc, evaluate(lean, sc, 'engineer'));
    const b = goalsFor(sc, evaluate(rich, sc, 'engineer'));
    const met = (g: ReturnType<typeof goalsFor>, id: string) => g.find((x) => x.id === id)!.met;
    expect(met(a, 'reserve')).toBe(true);
    expect(met(b, 'reserve')).toBe(false);
    expect(teamwork(a).total).toBe(10);
  });
});

describe('decisions in flight, voted by the team', () => {
  /** A room that has signed off, developed and is now flying. */
  function flying(): TeamState {
    let s = solve(room());
    for (const id of ['host', 'p1', 'p2']) s = send(s, id, { t: 'ready', ready: true });
    return develop(s);
  }

  it('decides once everyone has voted, by majority', () => {
    let s = flying();
    s = send(s, 'host', { t: 'vote', id: 'storm-14', option: 'observe' });
    s = send(s, 'p1', { t: 'vote', id: 'storm-14', option: 'observe' });
    expect(s.choices['storm-14']).toBeUndefined();
    expect(Object.keys(s.votes['storm-14'])).toHaveLength(2);
    s = send(s, 'p2', { t: 'vote', id: 'storm-14', option: 'safe' });
    expect(s.choices['storm-14']).toBe('observe');
    expect(s.votes['storm-14']).toBeUndefined();
    // Once decided, later votes change nothing.
    expect(send(s, 'p2', { t: 'vote', id: 'storm-14', option: 'safe' })).toBe(s);
  });

  it('lets only the host close a vote when the timer runs out', () => {
    let s = flying();
    s = send(s, 'p1', { t: 'vote', id: 'budget-20', option: 'end_early' });
    expect(send(s, 'p1', { t: 'close', id: 'budget-20' })).toBe(s);
    s = send(s, 'host', { t: 'close', id: 'budget-20' });
    expect(s.choices['budget-20']).toBe('end_early');
  });

  it('falls back to the cautious option on a tie or without votes', () => {
    expect(tally(['safe', 'observe'], { a: 'safe', b: 'observe' })).toBe('safe');
    expect(tally(['recalibrate', 'carry_on'], {})).toBe('recalibrate');
  });

  it('gives the lead of a decision the casting vote in a tie', () => {
    expect(tally(['safe', 'observe'], { a: 'safe', b: 'observe' }, 'b')).toBe('observe');
    // The lead's vote only breaks a tie; it does not outweigh a majority.
    expect(tally(['safe', 'observe'], { a: 'safe', b: 'observe', c: 'safe' }, 'b')).toBe('safe');
    // A lead who did not vote leaves the tie to the cautious option.
    expect(tally(['safe', 'observe'], { a: 'safe', b: 'observe' }, 'z')).toBe('safe');
    // In the room: a ground-station outage is the comms engineer's call (the host holds comms).
    let s = flying();
    s = send(s, 'host', { t: 'vote', id: 'outage-9', option: 'reroute' });
    s = send(s, 'p1', { t: 'vote', id: 'outage-9', option: 'store' });
    s = send(s, 'host', { t: 'close', id: 'outage-9' });
    expect(s.choices['outage-9']).toBe('reroute');
  });

  it('refuses votes for unknown crises, unknown options and outside the flight', () => {
    const s = flying();
    expect(send(s, 'p1', { t: 'vote', id: 'meteor-3', option: 'safe' })).toBe(s);
    expect(send(s, 'p1', { t: 'vote', id: 'constructor-3', option: 'safe' })).toBe(s);
    expect(send(s, 'p1', { t: 'vote', id: 'storm-3', option: 'run' })).toBe(s);
    const designing = solve(room());
    expect(send(designing, 'p1', { t: 'vote', id: 'storm-3', option: 'safe' })).toBe(designing);
  });

  it('forgets decisions when the team flies again', () => {
    let s = flying();
    s = send(s, 'host', { t: 'close', id: 'storm-14' });
    expect(s.choices).toEqual({ 'storm-14': 'safe' });
    s = send(s, 'host', { t: 'relaunch' });
    expect(s.choices).toEqual({});
    expect(s.votes).toEqual({});
  });
});
