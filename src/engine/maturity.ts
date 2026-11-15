import type { Check, Design, L } from './types';

/**
 * Where the design stands on JPL's Concept Maturity Levels (CML), the scale JPL uses to say how far
 * a mission concept has got before it is built. The hangar covers the first four levels; the
 * development phase that follows is the build-and-test part of a real project.
 *
 * Source: JPL, "Concept Maturity Levels" (Wessen, Borden, Ziemer, Moeller et al., IEEE Aerospace 2013).
 */
export interface Maturity {
  level: 1 | 2 | 3 | 4;
  name: L;
  meaning: L;
}

/** Findings that mean a basic choice has not been made yet, not that the choices clash. */
const MISSING = new Set(['no_orbit', 'no_instruments', 'no_vehicle']);

export const CML: Record<Maturity['level'], Omit<Maturity, 'level'>> = {
  1: {
    name: { ru: 'Идея', en: 'Cocktail napkin' },
    meaning: { ru: 'Есть задача, но ещё нет аппарата.', en: 'An objective, but no spacecraft yet.' },
  },
  2: {
    name: { ru: 'Первая проверка', en: 'Initial feasibility' },
    meaning: { ru: 'Главные решения начаты, но не всё выбрано.', en: 'The main choices are started, not all made.' },
  },
  3: {
    name: { ru: 'Поиск компромиссов', en: 'Trade space' },
    meaning: { ru: 'Всё выбрано, но решения пока спорят друг с другом.', en: 'Everything is chosen, but the choices still clash.' },
  },
  4: {
    name: { ru: 'Точечный проект', en: 'Point design' },
    meaning: { ru: 'Один согласованный проект, который пропустит комиссия.', en: 'One consistent design the review board will pass.' },
  },
};

export function maturityOf(design: Design, checks: Check[]): Maturity {
  const blockers = checks.filter((c) => c.level === 'blocker');
  const started = !!design.orbit || design.instruments.length > 0 || !!design.vehicle;
  const level: Maturity['level'] = !started
    ? 1
    : blockers.some((c) => MISSING.has(c.id))
      ? 2
      : blockers.length > 0
        ? 3
        : 4;
  return { level, ...CML[level] };
}
