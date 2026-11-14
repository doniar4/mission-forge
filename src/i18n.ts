import { useMemo } from 'react';
import type { L } from './engine/types';
import { useStore, type Lang } from './store';

export interface Translator {
  /** t(bilingualObject) or t('по-русски', 'in English') */
  (a: L | string, b?: string): string;
  lang: Lang;
  n: (x: number, digits?: number) => string;
  money: (x: number) => string;
  pct: (x: number) => string;
}

export function makeT(lang: Lang): Translator {
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  const n = (x: number, digits = 0) =>
    Number.isFinite(x) ? x.toLocaleString(locale, { maximumFractionDigits: digits }) : '∞';
  const t = ((a: L | string, b?: string) => (typeof a === 'string' ? (lang === 'ru' ? a : b ?? a) : a[lang])) as Translator;
  t.lang = lang;
  t.n = n;
  t.money = (x) => (lang === 'ru' ? `$${n(x, x < 10 ? 1 : 0)} млн` : `$${n(x, x < 10 ? 1 : 0)}M`);
  t.pct = (x) => `${n(x * 100)}%`;
  return t;
}

export function useT(): Translator {
  const lang = useStore((s) => s.lang);
  return useMemo(() => makeT(lang), [lang]);
}
