import { setMuted } from './audio/sfx';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sanitize } from './engine/design';
import { emptyDesign, scenarioById } from './engine/scenarios';
import { simulate } from './engine/simulate';
import type { TeamState } from './engine/team';
import type { Choices, Design, Difficulty, L, SimResult } from './engine/types';

export type Lang = 'ru' | 'en';
export type Screen = 'home' | 'lobby' | 'studio' | 'flight' | 'report';

export interface RecordEntry {
  id: string;
  name: string;
  scenarioId: string;
  difficulty: Difficulty;
  score: number;
  grade: string;
  outcome: SimResult['outcome'];
  date: string;
  design: Design;
  team?: boolean;
}

/** This device's view of a team room. The room's state itself is owned by the host. */
export interface TeamLocal {
  isHost: boolean;
  myId: string;
  status: 'connecting' | 'online' | 'lost';
  /** Why the connection failed or ended. */
  error: L | null;
  state: TeamState | null;
}

/** Filled in by the network layer. The store calls it so it never imports the network code (no import cycle). */
export interface TeamHooks {
  patch: (p: Partial<Design>) => void;
  toggle: (id: string) => void;
  relaunch: () => void;
  back: () => void;
  leave: () => void;
}
let hooks: TeamHooks | null = null;
export const setTeamHooks = (h: TeamHooks | null) => {
  hooks = h;
};

interface Store {
  lang: Lang;
  screen: Screen;
  scenarioId: string;
  difficulty: Difficulty;
  designs: Record<string, Design>;
  sim: SimResult | null;
  /** Decisions taken in the current flight, by crisis id. */
  choices: Choices;
  records: RecordEntry[];
  playerName: string;
  team: TeamLocal | null;
  setLang: (l: Lang) => void;
  /** Game sounds on or off; remembered between visits. */
  sound: boolean;
  setSound: (on: boolean) => void;
  setDifficulty: (d: Difficulty) => void;
  setPlayerName: (n: string) => void;
  open: (scenarioId: string) => void;
  patch: (p: Partial<Design>) => void;
  toggleInstrument: (id: string) => void;
  resetDesign: () => void;
  launch: () => void;
  /** Take a decision in flight: the mission is re-flown with it from the same seed. */
  decide: (crisisId: string, option: string) => void;
  redesign: () => void;
  goto: (s: Screen) => void;
  saveRecord: (r: Omit<RecordEntry, 'id' | 'date'>) => void;
  loadShared: (scenarioId: string, difficulty: Difficulty, design: Design) => void;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      // English first: the game is judged by an international jury. Russian is one click away.
      lang: 'en',
      screen: 'home',
      scenarioId: 'firewatch',
      difficulty: 'engineer',
      designs: {},
      sim: null,
      choices: {},
      records: [],
      playerName: '',
      team: null,
      setLang: (lang) => set({ lang }),
      sound: true,
      setSound: (sound) => {
        setMuted(!sound);
        set({ sound });
      },
      setDifficulty: (difficulty) => set({ difficulty }),
      setPlayerName: (playerName) => set({ playerName }),
      open: (scenarioId) => {
        const sc = scenarioById(scenarioId);
        const { designs, difficulty } = get();
        const design = sanitize(designs[scenarioId] ?? emptyDesign(sc), sc, difficulty);
        set({ scenarioId, screen: 'studio', sim: null, designs: { ...designs, [scenarioId]: design } });
      },
      patch: (p) => {
        if (get().team) return hooks?.patch(p);
        const { designs, scenarioId } = get();
        set({ designs: { ...designs, [scenarioId]: { ...currentDesign(get()), ...p } } });
      },
      toggleInstrument: (id) => {
        if (get().team) return hooks?.toggle(id);
        const d = currentDesign(get());
        const has = d.instruments.includes(id);
        get().patch({ instruments: has ? d.instruments.filter((x) => x !== id) : [...d.instruments, id] });
      },
      resetDesign: () => {
        if (get().team) return;
        const { designs, scenarioId } = get();
        set({ designs: { ...designs, [scenarioId]: emptyDesign(scenarioById(scenarioId)) } });
      },
      launch: () => {
        const s = get();
        // In a team the host's referee picks the seed, so every screen replays the same flight.
        if (s.team) return hooks?.relaunch();
        const seed = Math.floor(Math.random() * 2 ** 31);
        set({ sim: simulate(currentDesign(s), scenarioById(s.scenarioId), s.difficulty, seed), choices: {}, screen: 'flight' });
      },
      decide: (crisisId, option) => {
        const s = get();
        if (!s.sim || s.team) return;
        const choices = { ...s.choices, [crisisId]: option };
        set({ choices, sim: simulate(currentDesign(s), scenarioById(s.scenarioId), s.difficulty, s.sim.seed, choices) });
      },
      redesign: () => {
        if (get().team) return hooks?.back();
        set({ screen: 'studio' });
      },
      goto: (screen) => {
        if (screen === 'home' && get().team) hooks?.leave();
        set({ screen });
      },
      saveRecord: (r) =>
        set((s) => ({
          playerName: r.name,
          records: [...s.records, { ...r, id: crypto.randomUUID(), date: new Date().toISOString() }]
            .sort((a, b) => b.score - a.score)
            .slice(0, 100),
        })),
      loadShared: (scenarioId, difficulty, design) => {
        const sc = scenarioById(scenarioId);
        set((s) => ({
          scenarioId: sc.id,
          difficulty,
          screen: 'studio',
          sim: null,
          designs: { ...s.designs, [sc.id]: sanitize(design, sc, difficulty) },
        }));
      },
    }),
    {
      name: 'mission-forge',
      // v2: English became the default language. Saved games keep everything else.
      version: 2,
      migrate: (saved, from) => (from < 2 ? { ...(saved as object), lang: 'en' } : saved) as Store,
      onRehydrateStorage: () => (s) => {
        if (s) setMuted(!s.sound);
      },
      // A flight in progress or a team room is not saved: reloading returns you to the drawing board.
      partialize: (s) => ({
        lang: s.lang,
        sound: s.sound,
        scenarioId: s.scenarioId,
        difficulty: s.difficulty,
        designs: s.designs,
        records: s.records,
        playerName: s.playerName,
        screen: s.team || s.screen === 'home' ? 'home' : 'studio',
      }),
    },
  ),
);

// One blank design per mission. A selector must return the same object for the same state,
// or React re-renders for ever when a saved game has a screen but no draft.
const blank = new Map<string, Design>();
function blankDesign(scenarioId: string): Design {
  let d = blank.get(scenarioId);
  if (!d) blank.set(scenarioId, (d = emptyDesign(scenarioById(scenarioId))));
  return d;
}

export function currentDesign(s: Pick<Store, 'designs' | 'scenarioId' | 'team'>): Design {
  return s.team?.state?.design ?? s.designs[s.scenarioId] ?? blankDesign(s.scenarioId);
}

export const useDesign = () => useStore(currentDesign);

// ---- Sharing a design as a link ------------------------------------------

export function shareLink(scenarioId: string, difficulty: Difficulty, design: Design): string {
  const json = JSON.stringify({ s: scenarioId, f: difficulty, d: design });
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return `${location.origin}${location.pathname}#m=${b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

/** Reads a shared design from the address bar, if there is one. */
export function readSharedLink(): void {
  const m = location.hash.match(/^#m=([\w-]+)$/);
  if (!m) return;
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    const diff: Difficulty = ['cadet', 'engineer', 'director'].includes(data.f) ? data.f : 'engineer';
    if (typeof data.s === 'string' && data.d && typeof data.d === 'object') {
      useStore.getState().loadShared(data.s, diff, data.d as Design);
    }
  } catch {
    // A broken link is ignored: the player simply lands on the home screen.
  }
  history.replaceState(null, '', location.pathname + location.search);
}
