import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ADCS, ANTENNAS, BATTERIES, COMPUTERS, INSTRUMENTS, POWER, PROPULSION, STRUCTURES, VEHICLES, byId } from './engine/catalog';
import { emptyDesign, scenarioById, scenarioOrbits } from './engine/scenarios';
import { simulate } from './engine/simulate';
import type { Design, Difficulty, Scenario, SimResult } from './engine/types';

export type Lang = 'ru' | 'en';
export type Screen = 'home' | 'studio' | 'flight' | 'report';

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
}

interface Store {
  lang: Lang;
  screen: Screen;
  scenarioId: string;
  difficulty: Difficulty;
  designs: Record<string, Design>;
  sim: SimResult | null;
  records: RecordEntry[];
  playerName: string;
  setLang: (l: Lang) => void;
  setDifficulty: (d: Difficulty) => void;
  open: (scenarioId: string) => void;
  patch: (p: Partial<Design>) => void;
  toggleInstrument: (id: string) => void;
  resetDesign: () => void;
  launch: () => void;
  goto: (s: Screen) => void;
  saveRecord: (r: Omit<RecordEntry, 'id' | 'date'>) => void;
  loadShared: (scenarioId: string, difficulty: Difficulty, design: Design) => void;
}

/** Keeps a saved or shared design valid for the scenario and difficulty it is opened in. */
export function sanitize(d: Design, sc: Scenario, diff: Difficulty): Design {
  const base = emptyDesign(sc);
  const allowAdvanced = diff !== 'cadet';
  const ok = <T extends { id: string; advanced?: boolean }>(list: T[], id: string | null, fallback: string) => {
    const item = byId(list, id);
    return item && (allowAdvanced || !item.advanced) ? item.id : fallback;
  };
  const vehicle = byId(VEHICLES, d.vehicle);
  return {
    ...base,
    ...d,
    orbit: d.orbit && scenarioOrbits(sc).includes(d.orbit) ? d.orbit : null,
    instruments: (d.instruments ?? []).filter((id) => {
      const i = byId(INSTRUMENTS, id);
      return i && (allowAdvanced || !i.advanced);
    }),
    power: ok(POWER, d.power, base.power),
    battery: ok(BATTERIES, d.battery, base.battery),
    comms: ok(ANTENNAS, d.comms, base.comms),
    computer: ok(COMPUTERS, d.computer, base.computer),
    adcs: ok(ADCS, d.adcs, base.adcs),
    propulsion: ok(PROPULSION, d.propulsion, base.propulsion),
    structure: ok(STRUCTURES, d.structure, base.structure),
    vehicle: vehicle && (allowAdvanced || !vehicle.advanced) ? vehicle.id : null,
    redundancy: allowAdvanced ? d.redundancy ?? 'single' : 'single',
    lifeYears: Math.min(10, Math.max(1, Math.round(d.lifeYears || sc.targetYears))),
  };
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      lang: 'ru',
      screen: 'home',
      scenarioId: 'firewatch',
      difficulty: 'engineer',
      designs: {},
      sim: null,
      records: [],
      playerName: '',
      setLang: (lang) => set({ lang }),
      setDifficulty: (difficulty) => set({ difficulty }),
      open: (scenarioId) => {
        const sc = scenarioById(scenarioId);
        const { designs, difficulty } = get();
        const design = sanitize(designs[scenarioId] ?? emptyDesign(sc), sc, difficulty);
        set({ scenarioId, screen: 'studio', sim: null, designs: { ...designs, [scenarioId]: design } });
      },
      patch: (p) => {
        const { designs, scenarioId } = get();
        set({ designs: { ...designs, [scenarioId]: { ...currentDesign(get()), ...p } } });
      },
      toggleInstrument: (id) => {
        const d = currentDesign(get());
        const has = d.instruments.includes(id);
        get().patch({ instruments: has ? d.instruments.filter((x) => x !== id) : [...d.instruments, id] });
      },
      resetDesign: () => {
        const { designs, scenarioId } = get();
        set({ designs: { ...designs, [scenarioId]: emptyDesign(scenarioById(scenarioId)) } });
      },
      launch: () => {
        const s = get();
        const seed = Math.floor(Math.random() * 2 ** 31);
        set({ sim: simulate(currentDesign(s), scenarioById(s.scenarioId), s.difficulty, seed), screen: 'flight' });
      },
      goto: (screen) => set({ screen }),
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
      version: 1,
      // A flight in progress is not saved: reloading returns you to the drawing board.
      partialize: (s) => ({
        lang: s.lang,
        scenarioId: s.scenarioId,
        difficulty: s.difficulty,
        designs: s.designs,
        records: s.records,
        playerName: s.playerName,
        screen: s.screen === 'home' ? 'home' : 'studio',
      }),
    },
  ),
);

export function currentDesign(s: Pick<Store, 'designs' | 'scenarioId'>): Design {
  return s.designs[s.scenarioId] ?? emptyDesign(scenarioById(s.scenarioId));
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
