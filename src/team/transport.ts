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

interface PeerLike {
  id: string;
  on: (ev: string, cb: (...a: never[]) => void) => void;
  connect: (id: string, o?: object) => ConnLike;
  destroy: () => void;
}
interface ConnLike {
  peer: string;
  open: boolean;
  on: (ev: string, cb: (...a: never[]) => void) => void;
  send: (m: unknown) => void;
  close: () => void;
}

async function newPeer(id?: string): Promise<PeerLike> {
  // Loaded on demand, so players who never go online do not download it.
  const { Peer } = await import('peerjs');
  const peer = (id ? new Peer(id) : new Peer()) as unknown as PeerLike;
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
  });
  return peer;
}

async function hostPeer(code: string, h: HostHandlers): Promise<HostLink> {
  const peer = await newPeer(peerId(code));
  const conns = new Map<string, ConnLike>();
  peer.on('connection', ((conn: ConnLike) => {
    conn.on('open', (() => conns.set(conn.peer, conn)) as never);
    conn.on('data', ((m: unknown) => h.onMessage(conn.peer, m)) as never);
    conn.on('close', (() => {
      conns.delete(conn.peer);
      h.onLeave(conn.peer);
    }) as never);
  }) as never);
  // Later network hiccups are survivable; the broker is only needed to introduce new players.
  peer.on('error', (() => undefined) as never);
  return {
    broadcast: (m) => conns.forEach((c) => c.open && c.send(m)),
    sendTo: (id, m) => conns.get(id)?.send(m),
    close: () => {
      conns.forEach((c) => c.send({ t: 'closed' }));
      // Give the farewell a moment to leave before tearing the connection down.
      sleep(200).then(() => peer.destroy());
    },
  };
}

async function joinPeer(code: string, h: ClientHandlers): Promise<{ link: ClientLink; myId: string }> {
  const peer = await newPeer();
  const conn = peer.connect(peerId(code), { reliable: true });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RoomError('notfound')), 12000);
    conn.on('open', (() => {
      clearTimeout(timer);
      resolve();
    }) as never);
    peer.on('error', ((e: { type?: string }) => {
      clearTimeout(timer);
      reject(e?.type === 'peer-unavailable' ? new RoomError('notfound') : new RoomError('network', e?.type));
    }) as never);
  }).catch((e) => {
    peer.destroy();
    throw e;
  });
  conn.on('data', ((m: unknown) => h.onMessage(m)) as never);
  conn.on('close', h.onClose as never);
  return { myId: peer.id, link: { send: (m) => conn.send(m), close: () => peer.destroy() } };
}
