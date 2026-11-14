import { create } from 'zustand';
import { scenarioById } from '../engine/scenarios';
import { simulate } from '../engine/simulate';
import { HOST, TEAM_MAX, initialTeam, reduce, type ClientMsg, type RoomKind, type TeamState } from '../engine/team';
import type { Design, Difficulty, L } from '../engine/types';
import { setTeamHooks, useStore, type TeamLocal } from '../store';
import { RoomError, hostRoom, joinRoom, type ClientLink, type HostLink } from './transport';

/*
 * The host is the referee: it holds the one true TeamState, applies every player's messages with the
 * pure `reduce`, and broadcasts the result. Players only ever send intentions ("claim this role",
 * "change the orbit"); they never change shared state themselves.
 *
 * The flight is not sent over the wire. The host picks a seed, and every screen runs the same
 * deterministic simulation with it, so all players watch an identical mission.
 */

/** Progress and errors of the create/join button on the home screen. */
export const useNet = create<{ busy: boolean; error: L | null; clear: () => void }>((set) => ({
  busy: false,
  error: null,
  clear: () => set({ error: null }),
}));

let host: HostLink | null = null;
let client: ClientLink | null = null;
let hostState: TeamState | null = null;
let lastLaunch = '';
let joinTimer: ReturnType<typeof setTimeout> | undefined;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to confuse a code read aloud
const makeCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

/**
 * Where other players open the game. A page served from localhost is unreachable from their devices,
 * so the development server's address on the local network is used instead (see vite.config.ts).
 */
function shareOrigin(): string {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  return local && __LAN_ORIGIN__ ? __LAN_ORIGIN__ : location.origin;
}
export const isLocalOnly = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && !__LAN_ORIGIN__;
export const roomLink = (code: string, kind: RoomKind) => `${kind === 'online' ? shareOrigin() : location.origin}${location.pathname}#room=${code}&k=${kind}`;

const E = {
  taken: { ru: 'Не удалось подобрать свободный код комнаты. Попробуйте ещё раз.', en: 'Could not find a free room code. Try again.' },
  notfound: {
    ru: 'Комната с таким кодом не найдена. Проверьте код и режим связи: «По интернету» или «На этом компьютере».',
    en: 'No room with that code. Check the code and the connection mode: “Over the internet” or “On this computer”.',
  },
  network: {
    ru: 'Нет связи с сервисом знакомства игроков (PeerJS). Проверьте интернет или играйте в режиме «На этом компьютере».',
    en: 'Cannot reach the player-matching service (PeerJS). Check your internet, or play in “On this computer” mode.',
  },
  full: { ru: `В комнате уже ${TEAM_MAX} игрока: больше мест нет.`, en: `The room already has ${TEAM_MAX} players: no seats left.` },
  closed: { ru: 'Хозяин закрыл комнату.', en: 'The host closed the room.' },
  lost: { ru: 'Связь с хозяином комнаты потеряна.', en: 'The connection to the host was lost.' },
  silent: { ru: 'Хозяин комнаты не ответил.', en: 'The host did not answer.' },
} satisfies Record<string, L>;

const failure = (e: unknown): L => (e instanceof RoomError ? E[e.code] : E.network);

function setTeam(p: Partial<TeamLocal>) {
  useStore.setState((s) => ({ team: s.team ? { ...s.team, ...p } : null }));
}

/** Shows a received state: refreshes the screen, and starts the flight when the host launched one. */
function apply(s: TeamState) {
  if (!useStore.getState().team) return;
  clearTimeout(joinTimer);
  useStore.setState((st) => ({
    team: st.team && { ...st.team, state: s, status: 'online', error: null },
    scenarioId: s.scenarioId,
    difficulty: s.difficulty,
  }));
  const screen = useStore.getState().screen;
  if (s.phase === 'flight') {
    const key = `${s.code}:${s.seed}`;
    if (key !== lastLaunch && s.seed !== null) {
      lastLaunch = key;
      const sim = simulate(s.design, scenarioById(s.scenarioId), s.difficulty, s.seed);
      useStore.setState({ sim, screen: 'flight' });
    }
  } else if (s.phase === 'design') {
    lastLaunch = '';
    if (screen !== 'studio') useStore.setState({ sim: null, screen: 'studio' });
  } else if (screen !== 'lobby') {
    useStore.setState({ screen: 'lobby' });
  }
}

function publish(next: TeamState) {
  if (next === hostState) return;
  hostState = next;
  host?.broadcast({ t: 'state', state: next });
  apply(next);
}

/** One entry point for "I did something": the host referees itself, a player asks the host. */
export function teamSend(msg: ClientMsg) {
  if (host && hostState) publish(reduce(hostState, HOST, msg, { seed: randomSeed() }));
  else client?.send(msg);
}

function register() {
  setTeamHooks({
    patch: (patch: Partial<Design>) => teamSend({ t: 'patch', patch }),
    toggle: (id: string) => teamSend({ t: 'toggle', id }),
    relaunch: () => teamSend({ t: 'relaunch' }),
    back: () => teamSend({ t: 'back' }),
    leave: () => leaveRoom(),
  });
}

export function leaveRoom() {
  clearTimeout(joinTimer);
  joined = null;
  host?.close();
  client?.close();
  host = client = null;
  hostState = null;
  lastLaunch = '';
  setTeamHooks(null);
  useStore.setState({ team: null, sim: null });
}

const isMsg = (m: unknown): m is { t: string } => typeof m === 'object' && m !== null && typeof (m as { t?: unknown }).t === 'string';

export async function createTeam(o: { kind: RoomKind; name: string; scenarioId: string; difficulty: Difficulty }) {
  leaveRoom();
  useNet.setState({ busy: true, error: null });
  try {
    let code = '';
    for (let attempt = 0; attempt < 5 && !host; attempt++) {
      code = makeCode();
      try {
        host = await hostRoom(code, o.kind, {
          onMessage: (from, m) => {
            if (!isMsg(m) || from === HOST || !hostState) return;
            const known = hostState.members.some((x) => x.id === from);
            if (m.t === 'hello' && !known && hostState.members.length >= TEAM_MAX) return host?.sendTo(from, { t: 'full' });
            publish(reduce(hostState, from, m as ClientMsg, { seed: randomSeed() }));
            // A player coming back after a dropped connection is already a member, so nothing changes
            // and nothing is broadcast: send them the room as it stands.
            if (m.t === 'hello') host?.sendTo(from, { t: 'state', state: hostState });
          },
          onLeave: (from) => hostState && publish(reduce(hostState, from, { t: 'drop' }, { seed: 0 })),
        });
      } catch (e) {
        if (!(e instanceof RoomError && e.code === 'taken')) throw e;
      }
    }
    if (!host) throw new RoomError('taken');
    hostState = initialTeam(code, o.kind, o.scenarioId, o.difficulty, o.name);
    useStore.setState({ team: { isHost: true, myId: HOST, status: 'online', error: null, state: null }, sim: null });
    register();
    apply(hostState);
    useStore.setState({ screen: 'lobby' });
  } catch (e) {
    leaveRoom();
    useNet.setState({ error: failure(e) });
  } finally {
    useNet.setState({ busy: false });
  }
}

/** The room this tab joined as a player, so a dropped connection can be picked up again. */
let joined: { code: string; kind: RoomKind; name: string } | null = null;
let retries = 0;

/** Connects to the host and says hello. Throws a RoomError when the room cannot be reached. */
async function connectClient(code: string, kind: RoomKind, name: string) {
  const { link, myId } = await joinRoom(code, kind, {
      onMessage: (m) => {
        if (!isMsg(m)) return;
        if (m.t === 'state') {
          const s = (m as unknown as { state?: TeamState }).state;
          if (s && typeof s === 'object' && s.code === code) apply(s);
        } else if (m.t === 'full') {
          leaveRoom();
          useNet.setState({ error: E.full });
        } else if (m.t === 'closed') {
          joined = null;
          setTeam({ status: 'lost', error: E.closed });
        }
      },
      onClose: () => {
        if (client === link) void reconnect();
      },
    });
  client = link;
  retries = 0;
  link.send({ t: 'hello', name });
  return myId;
}

/** After a dropped connection: a few quiet attempts to get back in before telling the player. */
async function reconnect() {
  if (!joined || !useStore.getState().team) return;
  client?.close();
  client = null;
  setTeam({ status: 'connecting', error: null });
  while (joined && useStore.getState().team && retries < 3) {
    retries++;
    try {
      await connectClient(joined.code, joined.kind, joined.name);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (useStore.getState().team) setTeam({ status: 'lost', error: E.lost });
}

/** The "try again" button of a lost connection. */
export function rejoin() {
  retries = 0;
  void reconnect();
}

export async function joinTeam(codeInput: string, kind: RoomKind, name: string) {
  const code = normalizeCode(codeInput);
  leaveRoom();
  if (code.length !== 5) {
    useNet.setState({ error: { ru: 'Код комнаты состоит из пяти символов.', en: 'A room code has five characters.' } });
    return;
  }
  useNet.setState({ busy: true, error: null });
  try {
    joined = { code, kind, name };
    const myId = await connectClient(code, kind, name);
    useStore.setState({ team: { isHost: false, myId, status: 'connecting', error: null, state: null }, screen: 'lobby', sim: null });
    register();
    joinTimer = setTimeout(() => {
      if (!useStore.getState().team?.state) setTeam({ status: 'lost', error: E.silent });
    }, 6000);
  } catch (e) {
    leaveRoom();
    useNet.setState({ error: failure(e) });
  } finally {
    useNet.setState({ busy: false });
  }
}

if (typeof window !== 'undefined') {
  // A host who closes the tab should not leave players waiting in an empty room.
  window.addEventListener('pagehide', () => host?.close());
}

/** Opens an invitation link (#room=CODE&k=online) when there is one in the address bar. */
export function readRoomLink() {
  const m = location.hash.match(/^#room=([A-Za-z0-9]{5})(?:&k=(online|local))?$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  const { playerName, lang } = useStore.getState();
  void joinTeam(m[1], (m[2] as RoomKind) ?? 'online', playerName || (lang === 'ru' ? 'Игрок' : 'Player'));
}
