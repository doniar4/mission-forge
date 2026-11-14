import type { RoomKind } from '../engine/team';

/*
 * Two ways to link players, behind one small interface.
 *
 *  online - WebRTC through PeerJS. The free PeerJS broker only introduces the browsers to each other
 *           (it sees random ids and the room code); the design and the chat travel browser to browser.
 *  local  - BroadcastChannel between tabs or windows of one browser. Works offline, which suits a
 *           classroom laptop and testing.
 *
 * Both are a star: every player talks to the host, and the host talks to everyone.
 */

export type RoomErrorCode = 'taken' | 'notfound' | 'network';
export class RoomError extends Error {
  constructor(
    public code: RoomErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface HostLink {
  broadcast: (m: unknown) => void;
  sendTo: (id: string, m: unknown) => void;
  close: () => void;
}
export interface HostHandlers {
  onMessage: (from: string, m: unknown) => void;
  onLeave: (from: string) => void;
}
export interface ClientLink {
  send: (m: unknown) => void;
  close: () => void;
}
export interface ClientHandlers {
  onMessage: (m: unknown) => void;
  onClose: () => void;
}

const peerId = (code: string) => `mission-forge-${code}`;
const channelName = (code: string) => `mission-forge-room-${code}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function hostRoom(code: string, kind: RoomKind, h: HostHandlers): Promise<HostLink> {
  return kind === 'local' ? hostLocal(code, h) : hostPeer(code, h);
}

/** Resolves with the link and this player's id once the connection to the host is open. */
export function joinRoom(code: string, kind: RoomKind, h: ClientHandlers): Promise<{ link: ClientLink; myId: string }> {
  return kind === 'local' ? joinLocal(code, h) : joinPeer(code, h);
}

// ---- local: BroadcastChannel ---------------------------------------------

async function hostLocal(code: string, h: HostHandlers): Promise<HostLink> {
  if (typeof BroadcastChannel === 'undefined') throw new RoomError('network', 'BroadcastChannel is not supported');
  const bc = new BroadcastChannel(channelName(code));
  // Another host on the same code would answer the probe.
  const taken = await new Promise<boolean>((resolve) => {
    bc.onmessage = (e) => e.data?.k === 'here' && resolve(true);
    bc.postMessage({ k: 'probe' });
    setTimeout(() => resolve(false), 250);
  });
  if (taken) {
    bc.close();
    throw new RoomError('taken');
  }
  bc.onmessage = (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.k === 'probe') bc.postMessage({ k: 'here' });
    else if (d.k === 'hello') bc.postMessage({ k: 'welcome', to: d.from });
    else if (d.k === 'msg') h.onMessage(String(d.from), d.body);
    else if (d.k === 'bye') h.onLeave(String(d.from));
  };
  return {
    broadcast: (body) => bc.postMessage({ k: 'all', body }),
    sendTo: (to, body) => bc.postMessage({ k: 'to', to, body }),
    close: () => {
      bc.postMessage({ k: 'all', body: { t: 'closed' } });
      bc.close();
    },
  };
}

async function joinLocal(code: string, h: ClientHandlers): Promise<{ link: ClientLink; myId: string }> {
  if (typeof BroadcastChannel === 'undefined') throw new RoomError('network', 'BroadcastChannel is not supported');
  const bc = new BroadcastChannel(channelName(code));
  const myId = Math.random().toString(36).slice(2, 10);
  const opened = await new Promise<boolean>((resolve) => {
    bc.onmessage = (e) => e.data?.k === 'welcome' && e.data.to === myId && resolve(true);
    bc.postMessage({ k: 'hello', from: myId });
    setTimeout(() => resolve(false), 3000);
  });
  if (!opened) {
    bc.close();
    throw new RoomError('notfound');
  }
  const leave = () => bc.postMessage({ k: 'bye', from: myId });
  bc.onmessage = (e) => {
    const d = e.data;
    if (d?.k === 'all' || (d?.k === 'to' && d.to === myId)) h.onMessage(d.body);
  };
  window.addEventListener('pagehide', leave);
  return {
    myId,
    link: {
      send: (body) => bc.postMessage({ k: 'msg', from: myId, body }),
      close: () => {
        window.removeEventListener('pagehide', leave);
        leave();
        bc.close();
      },
    },
  };
}

// ---- online: PeerJS --------------------------------------------------------

/*
 * Every player has a key that survives a dropped connection (kept in sessionStorage per room), so a
 * player who reconnects is the same member to the host and keeps their roles. The first message on a
 * new connection is the key; after that the host knows that connection by it.
 *
 * WebRTC can take a long time to notice a dead peer, so both sides send a ping every PING ms and
 * treat SILENCE ms without hearing anything as a lost connection.
 */
const PING = 3000;
const SILENCE = 12000;

interface PeerLike {
  id: string;
  destroyed: boolean;
  disconnected: boolean;
  on: (ev: string, cb: (...a: never[]) => void) => void;
  connect: (id: string, o?: object) => ConnLike;
  reconnect: () => void;
  destroy: () => void;
}
interface ConnLike {
  peer: string;
  open: boolean;
  on: (ev: string, cb: (...a: never[]) => void) => void;
  send: (m: unknown) => void;
  close: () => void;
}

const isWire = (m: unknown, k: string): m is { k: string; key?: string } =>
  typeof m === 'object' && m !== null && (m as { k?: unknown }).k === k;

function safeSend(c: ConnLike, m: unknown) {
  try {
    if (c.open) c.send(m);
  } catch {
    // A connection that is closing throws; the heartbeat will notice it is gone.
  }
}

async function newPeer(id?: string): Promise<PeerLike> {
  // Loaded on demand, so players who never go online do not download it.
  const { Peer } = await import('peerjs');
  const peer = (id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 })) as unknown as PeerLike;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RoomError('network', 'The PeerJS broker did not answer')), 10000);
    peer.on('open', (() => {
      clearTimeout(timer);
      resolve();
    }) as never);
    peer.on('error', ((e: { type?: string }) => {
      clearTimeout(timer);
      reject(e?.type === 'unavailable-id' ? new RoomError('taken') : new RoomError('network', e?.type));
    }) as never);
  }).catch((e) => {
    peer.destroy();
    throw e;
  });
  // The broker is only needed to introduce players; if it drops us, come back so newcomers can still join.
  peer.on('disconnected', (() => {
    setTimeout(() => {
      if (!peer.destroyed && peer.disconnected) peer.reconnect();
    }, 1000);
  }) as never);
  return peer;
}

async function hostPeer(code: string, h: HostHandlers): Promise<HostLink> {
  const peer = await newPeer(peerId(code));
  /** The live connection of each player, by key, and when we last heard from it. */
  const conns = new Map<string, { conn: ConnLike; seen: number }>();
  const drop = (key: string, conn: ConnLike) => {
    const cur = conns.get(key);
    // A player who already reconnected on a new connection is still here.
    if (!cur || cur.conn !== conn) return;
    conns.delete(key);
    h.onLeave(key);
  };
  peer.on('connection', ((conn: ConnLike) => {
    let key = '';
    conn.on('data', ((m: unknown) => {
      if (isWire(m, 'id') && typeof m.key === 'string' && m.key) {
        const old = conns.get(m.key);
        key = m.key;
        conns.set(key, { conn, seen: Date.now() });
        if (old && old.conn !== conn) old.conn.close();
        return;
      }
      if (!key) return;
      const cur = conns.get(key);
      if (cur?.conn === conn) cur.seen = Date.now();
      if (isWire(m, 'ping')) return safeSend(conn, { k: 'pong' });
      if (isWire(m, 'pong')) return;
      h.onMessage(key, m);
    }) as never);
    conn.on('close', (() => key && drop(key, conn)) as never);
    conn.on('error', (() => key && drop(key, conn)) as never);
  }) as never);
  // Later network hiccups are survivable; the broker is only needed to introduce new players.
  peer.on('error', (() => undefined) as never);
  const beat = setInterval(() => {
    const now = Date.now();
    conns.forEach(({ conn, seen }, key) => {
      if (now - seen > SILENCE) {
        drop(key, conn);
        conn.close();
      } else safeSend(conn, { k: 'ping' });
    });
  }, PING);
  return {
    broadcast: (m) => conns.forEach(({ conn }) => safeSend(conn, m)),
    sendTo: (id, m) => {
      const c = conns.get(id);
      if (c) safeSend(c.conn, m);
    },
    close: () => {
      clearInterval(beat);
      conns.forEach(({ conn }) => safeSend(conn, { t: 'closed' }));
      // Give the farewell a moment to leave before tearing the connection down.
      sleep(200).then(() => peer.destroy());
    },
  };
}

/** This tab's key for a room: the same after a reload or a dropped connection. */
function playerKey(code: string): string {
  const name = `mission-forge-key-${code}`;
  try {
    const saved = sessionStorage.getItem(name);
    if (saved) return saved;
    const key = Math.random().toString(36).slice(2, 12);
    sessionStorage.setItem(name, key);
    return key;
  } catch {
    return Math.random().toString(36).slice(2, 12);
  }
}

async function connectOnce(code: string): Promise<{ peer: PeerLike; conn: ConnLike }> {
  const peer = await newPeer();
  const conn = peer.connect(peerId(code), { reliable: true, serialization: 'json' });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RoomError('notfound')), 12000);
    conn.on('open', (() => {
      clearTimeout(timer);
      resolve();
    }) as never);
    conn.on('error', (() => {
      clearTimeout(timer);
      reject(new RoomError('network', 'connection'));
    }) as never);
    peer.on('error', ((e: { type?: string }) => {
      clearTimeout(timer);
      reject(e?.type === 'peer-unavailable' ? new RoomError('notfound') : new RoomError('network', e?.type));
    }) as never);
  }).catch((e) => {
    peer.destroy();
    throw e;
  });
  return { peer, conn };
}

async function joinPeer(code: string, h: ClientHandlers): Promise<{ link: ClientLink; myId: string }> {
  // A host that has just reloaded takes a moment to reappear at the broker: try a few times.
  let made: { peer: PeerLike; conn: ConnLike } | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3 && !made; attempt++) {
    if (attempt) await sleep(1500);
    try {
      made = await connectOnce(code);
    } catch (e) {
      lastError = e;
    }
  }
  if (!made) throw lastError instanceof RoomError ? lastError : new RoomError('network');
  const { peer, conn } = made;
  const key = playerKey(code);
  conn.send({ k: 'id', key });

  let seen = Date.now();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(beat);
    h.onClose();
  };
  const beat = setInterval(() => {
    if (Date.now() - seen > SILENCE) {
      close();
      peer.destroy();
    } else safeSend(conn, { k: 'ping' });
  }, PING);
  conn.on('data', ((m: unknown) => {
    seen = Date.now();
    if (isWire(m, 'ping')) return safeSend(conn, { k: 'pong' });
    if (isWire(m, 'pong')) return;
    h.onMessage(m);
  }) as never);
  conn.on('close', close as never);
  conn.on('error', close as never);
  return {
    myId: key,
    link: {
      send: (m) => safeSend(conn, m),
      close: () => {
        closed = true;
        clearInterval(beat);
        peer.destroy();
      },
    },
  };
}
