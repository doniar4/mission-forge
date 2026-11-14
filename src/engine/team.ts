import { sanitize } from './design';
import { evaluate } from './evaluate';
import { SCENARIOS, emptyDesign, scenarioById } from './scenarios';
import type { Design, Difficulty, Evaluation, L, Measure, Role, Scenario } from './types';

/** Three people is the sweet spot: four roles, so someone always holds two and has to weigh them against each other. */
export const TEAM_MAX = 3;
export const ROLE_LIST: Role[] = ['manager', 'science', 'engineer', 'comms'];

/** Which parts of the design each role is allowed to change. */
export const ROLE_FIELDS: Record<Role, (keyof Design)[]> = {
  manager: ['vehicle', 'testing', 'redundancy', 'lifeYears'],
  science: ['orbit', 'instruments'],
  engineer: ['power', 'battery', 'adcs', 'propulsion', 'structure'],
  comms: ['comms', 'ground', 'computer'],
};

export type RoomKind = 'online' | 'local';

export interface Member {
  id: string;
  name: string;
}

export interface ChatMsg {
  id: number;
  name: string;
  text: string;
}

export interface TeamState {
  code: string;
  kind: RoomKind;
  phase: 'lobby' | 'design' | 'flight';
  scenarioId: string;
  difficulty: Difficulty;
  design: Design;
  members: Member[];
  owners: Record<Role, string | null>;
  /** Member id -> confirmed the design for launch. */
  ready: Record<string, boolean>;
  chat: ChatMsg[];
  seed: number | null;
  /** Bumped on every change, so a receiver can tell new state from old. */
  rev: number;
}

export type ClientMsg =
  | { t: 'hello'; name: string }
  | { t: 'name'; name: string }
  | { t: 'claim'; role: Role }
  | { t: 'release'; role: Role }
  | { t: 'auto' }
  | { t: 'setup'; scenarioId: string; difficulty: Difficulty }
  | { t: 'start' }
  | { t: 'patch'; patch: Partial<Design> }
  /** Flip one instrument on or off. Sent as a toggle, not a list, so two quick clicks never overwrite each other. */
  | { t: 'toggle'; id: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'chat'; text: string }
  | { t: 'back' }
  | { t: 'relaunch' }
  | { t: 'drop' };

/** The room creator. Only the host can change the mission, hand out roles and start the design phase. */
export const HOST = 'host';

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function initialTeam(code: string, kind: RoomKind, scenarioId: string, difficulty: Difficulty, hostName: string): TeamState {
  const sc = scenarioById(scenarioId);
  return {
    code,
    kind,
    phase: 'lobby',
    scenarioId: sc.id,
    difficulty,
    design: sanitize(emptyDesign(sc), sc, difficulty),
    members: [{ id: HOST, name: clean(hostName, 20) || 'Host' }],
    owners: { manager: null, science: null, engineer: null, comms: null },
    ready: {},
    chat: [],
    seed: null,
    rev: 0,
  };
}

export const rolesOf = (s: TeamState, id: string | null | undefined): Role[] =>
  id ? ROLE_LIST.filter((r) => s.owners[r] === id) : [];

export const memberName = (s: TeamState, id: string | null): string => s.members.find((m) => m.id === id)?.name ?? '—';

export const allRolesOwned = (s: TeamState) => ROLE_LIST.every((r) => s.owners[r] !== null);

/** Everyone who holds at least one role, once each. */
export const owners = (s: TeamState): string[] => [...new Set(ROLE_LIST.map((r) => s.owners[r]).filter((x): x is string => !!x))];

const sameDesign = (a: Design, b: Design) => JSON.stringify(a) === JSON.stringify(b);

/** Gives every free role to the member with the fewest roles, so duties spread evenly. */
function fillRoles(own: Record<Role, string | null>, members: Member[]): Record<Role, string | null> {
  const next = { ...own };
  if (members.length === 0) return next;
  for (const role of ROLE_LIST) {
    if (next[role]) continue;
    const load = (id: string) => ROLE_LIST.filter((r) => next[r] === id).length;
    next[role] = [...members].sort((a, b) => load(a.id) - load(b.id))[0].id;
  }
  return next;
}

/** Launches when every role has an owner and every owner has signed off on a design the board clears. */
function maybeLaunch(s: TeamState, seed: number): TeamState {
  if (s.phase !== 'design' || !allRolesOwned(s) || !owners(s).every((id) => s.ready[id])) return s;
  if (evaluate(s.design, scenarioById(s.scenarioId), s.difficulty).blockers > 0) return s;
  return { ...s, phase: 'flight', seed };
}

function step(s: TeamState, from: string, msg: ClientMsg, ctx: { seed: number }): TeamState {
  const isHost = from === HOST;
  const known = s.members.some((m) => m.id === from);

  if (msg.t === 'hello') {
    if (known || s.members.length >= TEAM_MAX) return s;
    const name = clean(msg.name, 20) || `Player ${s.members.length + 1}`;
    return { ...s, members: [...s.members, { id: from, name }] };
  }
  if (!known) return s;

  switch (msg.t) {
    case 'drop': {
      if (isHost) return s;
      const members = s.members.filter((m) => m.id !== from);
      let own = { ...s.owners };
      for (const r of ROLE_LIST) if (own[r] === from) own[r] = null;
      // While designing, a departure must not leave the team waiting for a sign-off that will never
      // come: the leaver's roles go to whoever holds the fewest. Their new owners have not seen these
      // sections yet, so they sign off again. In the lobby the roles simply become free.
      const handed = s.phase === 'design' ? ROLE_LIST.filter((r) => s.owners[r] === from) : [];
      if (handed.length) own = fillRoles(own, members);
      const ready: Record<string, boolean> = {};
      for (const [id, ok] of Object.entries(s.ready)) if (id !== from && !handed.some((r) => own[r] === id)) ready[id] = ok;
      return maybeLaunch({ ...s, members, owners: own, ready }, ctx.seed);
    }
    case 'name': {
      const name = clean(msg.name, 20);
      if (!name) return s;
      return { ...s, members: s.members.map((m) => (m.id === from ? { ...m, name } : m)) };
    }
    case 'claim': {
      if (s.phase === 'flight' || !ROLE_LIST.includes(msg.role) || s.owners[msg.role] !== null) return s;
      return { ...s, owners: { ...s.owners, [msg.role]: from }, ready: {} };
    }
    case 'release': {
      if (s.phase === 'flight' || s.owners[msg.role] !== from) return s;
      return { ...s, owners: { ...s.owners, [msg.role]: null }, ready: {} };
    }
    case 'auto': {
      if (!isHost || s.phase === 'flight') return s;
      return { ...s, owners: fillRoles(s.owners, s.members), ready: {} };
    }
    case 'setup': {
      if (!isHost || s.phase !== 'lobby' || !SCENARIOS.some((x) => x.id === msg.scenarioId)) return s;
      const diff: Difficulty = ['cadet', 'engineer', 'director'].includes(msg.difficulty) ? msg.difficulty : 'engineer';
      const sc = scenarioById(msg.scenarioId);
      return { ...s, scenarioId: sc.id, difficulty: diff, design: sanitize(emptyDesign(sc), sc, diff) };
    }
    case 'start': {
      if (!isHost || s.phase !== 'lobby' || !allRolesOwned(s)) return s;
      return { ...s, phase: 'design', ready: {} };
    }
    case 'patch': {
      if (s.phase !== 'design' || typeof msg.patch !== 'object' || !msg.patch) return s;
      const allowed = new Set(rolesOf(s, from).flatMap((r) => ROLE_FIELDS[r]));
      const picked: Partial<Design> = {};
      for (const [k, v] of Object.entries(msg.patch)) if (allowed.has(k as keyof Design)) (picked as Record<string, unknown>)[k] = v;
      if (Object.keys(picked).length === 0) return s;
      const sc = scenarioById(s.scenarioId);
      const design = sanitize({ ...s.design, ...picked }, sc, s.difficulty);
      // A changed design is a different design: earlier sign-offs no longer count.
      return sameDesign(design, s.design) ? s : { ...s, design, ready: {} };
    }
    case 'toggle': {
      if (s.phase !== 'design' || !rolesOf(s, from).includes('science') || typeof msg.id !== 'string') return s;
      const has = s.design.instruments.includes(msg.id);
      const instruments = has ? s.design.instruments.filter((x) => x !== msg.id) : [...s.design.instruments, msg.id];
      const sc = scenarioById(s.scenarioId);
      const design = sanitize({ ...s.design, instruments }, sc, s.difficulty);
      return sameDesign(design, s.design) ? s : { ...s, design, ready: {} };
    }
    case 'ready': {
      if (s.phase !== 'design' || rolesOf(s, from).length === 0) return s;
      if (msg.ready) {
        const sc = scenarioById(s.scenarioId);
        if (evaluate(s.design, sc, s.difficulty).blockers > 0) return s;
      }
      return maybeLaunch({ ...s, ready: { ...s.ready, [from]: !!msg.ready } }, ctx.seed);
    }
    case 'chat': {
      const text = clean(msg.text, 240);
      if (!text) return s;
      const name = s.members.find((m) => m.id === from)!.name;
      const id = (s.chat[s.chat.length - 1]?.id ?? 0) + 1;
      return { ...s, chat: [...s.chat, { id, name, text }].slice(-60) };
    }
    case 'back':
      return s.phase === 'flight' ? { ...s, phase: 'design', seed: null, ready: {} } : s;
    case 'relaunch':
      return s.phase === 'flight' ? { ...s, seed: ctx.seed } : s;
  }
  return s;
}

/**
 * The host's referee. Pure: the same state, sender and message always give the same result,
 * and an invalid message returns the very same object so callers can skip a broadcast.
 */
export function reduce(s: TeamState, from: string, msg: ClientMsg, ctx: { seed: number }): TeamState {
  const next = step(s, from, msg, ctx);
  return next === s ? s : { ...next, rev: s.rev + 1 };
}

// ---- personal goals --------------------------------------------------------

export interface Goal {
  id: string;
  role: Role;
  label: L;
  met: boolean;
  /** The current value, so the player sees how far off they are. */
  detail: L;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Each role cares about something different, and the goals pull against one another:
 * science wants more instruments, the manager wants a budget reserve, the engineer wants margin,
 * comms wants every byte home. Nobody can maximise everything alone.
 */
export function goalsFor(sc: Scenario, ev: Evaluation): Goal[] {
  const covered = (Object.entries(sc.weights) as [Measure, number][])
    .filter(([, w]) => w >= 0.2)
    .every(([m]) => (ev.science.quality[m] ?? 0) >= 0.5);
  const has = (id: string) => ev.checks.some((c) => c.id === id);
  const margin = ev.mass.margin;
  const powerOk = ev.power.margin >= 0.1 && ev.power.averageEol >= ev.power.load;
  const g = (role: Role, id: string, label: L, met: boolean, detail: L): Goal => ({ role, id, label, met, detail });
  return [
    g('manager', 'reserve', { ru: 'Резерв бюджета не меньше 10%', en: 'Keep at least a 10% budget reserve' }, ev.cost.margin >= 0.1, {
      ru: `Сейчас ${pct(ev.cost.margin)}`,
      en: `Now ${pct(ev.cost.margin)}`,
    }),
    g('manager', 'schedule', { ru: 'Уложиться в срок разработки', en: 'Finish development on time' }, ev.time.devMonths <= ev.time.deadline, {
      ru: `${ev.time.devMonths} из ${ev.time.deadline} мес.`,
      en: `${ev.time.devMonths} of ${ev.time.deadline} months`,
    }),
    // Not the science forecast itself: the outcome is found out by flying.
    g('science', 'orbit', { ru: 'Орбита подходит задаче не меньше чем на 90%', en: 'The orbit suits the objective at least 90%' }, ev.science.orbitFit >= 0.9, {
      ru: `Сейчас ${pct(ev.science.orbitFit)}`,
      en: `Now ${pct(ev.science.orbitFit)}`,
    }),
    g('science', 'coverage', { ru: 'Все главные измерения закрыты приборами', en: 'Every major measurement is covered' }, covered, {
      ru: covered ? 'Закрыты' : 'Есть незакрытые',
      en: covered ? 'Covered' : 'Some are missing',
    }),
    g('engineer', 'mass', { ru: 'Запас по массе не меньше 10%', en: 'Keep at least a 10% mass margin' }, margin >= 0.1, {
      ru: margin < 0 ? 'Ракета не выбрана или аппарат тяжелее неё' : `Сейчас ${pct(margin)}`,
      en: margin < 0 ? 'No rocket yet, or the spacecraft is too heavy' : `Now ${pct(margin)}`,
    }),
    g('engineer', 'power', { ru: 'Энергии хватает с запасом 10% и до конца миссии', en: 'Power covers the load with 10% margin to the end' }, powerOk, {
      ru: `Запас сейчас ${pct(ev.power.margin)}`,
      en: `Margin now ${pct(ev.power.margin)}`,
    }),
    g('engineer', 'pointing', { ru: 'Наведение достаточно точное для приборов и антенны', en: 'Pointing is fine enough for instruments and antenna' }, !has('pointing_inst') && !has('pointing_ant'), {
      ru: has('pointing_inst') || has('pointing_ant') ? 'Есть замечание' : 'Замечаний нет',
      en: has('pointing_inst') || has('pointing_ant') ? 'A finding is open' : 'No findings',
    }),
    g('comms', 'data', { ru: 'Все данные доходят до Земли', en: 'All data reaches Earth' }, ev.data.returnFraction >= 0.97, {
      ru: `Доходит ${pct(ev.data.returnFraction)}`,
      en: `${pct(ev.data.returnFraction)} gets through`,
    }),
    g('comms', 'storage', { ru: 'Памяти хватает между сеансами связи', en: 'Storage holds data between contacts' }, ev.data.storageNeed <= ev.data.storage, {
      ru: `Нужно ${Math.round(ev.data.storageNeed)} из ${Math.round(ev.data.storage)} ГБ`,
      en: `Need ${Math.round(ev.data.storageNeed)} of ${Math.round(ev.data.storage)} GB`,
    }),
    g('comms', 'radiation', { ru: 'Электроника выдерживает радиацию орбиты', en: 'Electronics survive the orbit’s radiation' }, !has('radiation'), {
      ru: has('radiation') ? 'Есть замечание' : 'Замечаний нет',
      en: has('radiation') ? 'A finding is open' : 'No findings',
    }),
  ];
}

export function teamwork(goals: Goal[]): { met: number; total: number } {
  return { met: goals.filter((x) => x.met).length, total: goals.length };
}
