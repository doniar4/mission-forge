import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Body, L, Role } from '../engine/types';
import { useT } from '../i18n';
import { useStore } from '../store';

export const ROLES: Record<Role, { name: L; duty: L }> = {
  manager: {
    name: { ru: 'Руководитель миссии', en: 'Mission manager' },
    duty: { ru: 'Бюджет, сроки, ракета, испытания', en: 'Budget, schedule, rocket, testing' },
  },
  science: {
    name: { ru: 'Научный руководитель', en: 'Science lead' },
    duty: { ru: 'Орбита и научные приборы', en: 'Orbit and science instruments' },
  },
  engineer: {
    name: { ru: 'Системный инженер', en: 'Systems engineer' },
    duty: { ru: 'Энергия, ориентация, двигатель, корпус', en: 'Power, attitude, propulsion, structure' },
  },
  comms: {
    name: { ru: 'Инженер связи и данных', en: 'Comms and data engineer' },
    duty: { ru: 'Антенна, наземные станции, компьютер', en: 'Antenna, ground stations, computer' },
  },
};

export function LangToggle() {
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  return (
    <div className="lang" role="group" aria-label="Language">
      {(['en', 'ru'] as const).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l === 'ru' ? 'Рус' : 'Eng'}
        </button>
      ))}
    </div>
  );
}

/** Sound on/off, next to the language switch. */
export function SoundToggle() {
  const t = useT();
  const sound = useStore((s) => s.sound);
  const setSound = useStore((s) => s.setSound);
  return (
    <button
      type="button"
      className="icon-btn"
      aria-pressed={sound}
      aria-label={sound ? t('Выключить звук', 'Turn sound off') : t('Включить звук', 'Turn sound on')}
      title={sound ? t('Выключить звук', 'Turn sound off') : t('Включить звук', 'Turn sound on')}
      onClick={() => setSound(!sound)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" />
        {sound ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /> : <path d="M16 9l5 6M21 9l-5 6" />}
      </svg>
    </button>
  );
}

export function TopBar({ left, children }: { left?: ReactNode; children?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-left">{left}</div>
      <div className="topbar-right">
        {children}
        <SoundToggle />
        <LangToggle />
      </div>
    </header>
  );
}

/** A small drawing of the mission's destination. */
export function BodyGlyph({ body, size = 44 }: { body: Body; size?: number }) {
  return (
    <svg className={`glyph glyph-${body}`} width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
      {body === 'earth' && (
        <>
          <circle cx="22" cy="22" r="15" />
          <path d="M9 17c5 2 7-3 12-1s4 7 9 6 4-4 6-3M11 30c4-2 8 1 12-1" />
          <ellipse cx="22" cy="22" rx="20" ry="6" transform="rotate(-24 22 22)" className="ring" />
        </>
      )}
      {body === 'moon' && (
        <>
          <circle cx="22" cy="22" r="15" />
          <circle cx="16" cy="17" r="3.5" />
          <circle cx="27" cy="26" r="5" />
          <circle cx="25" cy="13" r="1.8" />
        </>
      )}
      {body === 'mars' && (
        <>
          <circle cx="22" cy="22" r="15" />
          <path d="M8 19c6-3 10 3 16 0s8 1 12 0M12 31c4-3 9-1 13-3" />
          <path d="M17 8.5c3 1.5 7 1.5 10 0" />
        </>
      )}
      {body === 'sun' && (
        <>
          <circle cx="22" cy="22" r="9" />
          <path d="M22 4v6M22 34v6M4 22h6M34 22h6M9.3 9.3l4.2 4.2M30.5 30.5l4.2 4.2M9.3 34.7l4.2-4.2M30.5 13.5l4.2-4.2" />
        </>
      )}
    </svg>
  );
}

export function Stars({ n }: { n: number }) {
  const t = useT();
  return (
    <span className="stars" aria-label={t(`Сложность ${n} из 3`, `Difficulty ${n} of 3`)}>
      {[1, 2, 3].map((i) => (
        <i key={i} data-on={i <= n} />
      ))}
    </span>
  );
}

/**
 * A budget bar: how much of a limit is used.
 * `invert` is for resources where more supply than demand is good (shown as demand / supply).
 * `twoSided` marks a demand that is not simply better when lower (more data is also more
 * science): its change is shown without a good or bad colour.
 */
export function Gauge({
  label,
  used,
  limit,
  unit,
  hint,
  digits = 0,
  twoSided = false,
  fix,
}: {
  label: string;
  used: number;
  limit: number;
  unit: string;
  hint?: string;
  digits?: number;
  twoSided?: boolean;
  /** What to change when the limit is broken, shown only then. */
  fix?: string;
}) {
  const t = useT();
  // What the last decision did to this resource, shown for a moment: every choice has a price.
  const before = useRef({ used, limit });
  const [change, setChange] = useState<{ value: number; of: 'used' | 'limit' } | null>(null);
  useEffect(() => {
    const dUsed = used - before.current.used;
    const dLimit = limit - before.current.limit;
    before.current = { used, limit };
    const scale = Math.max(Math.abs(used), Math.abs(limit), 1);
    const next = Math.abs(dUsed) > scale * 0.004 ? { value: dUsed, of: 'used' as const } : Math.abs(dLimit) > scale * 0.004 ? { value: dLimit, of: 'limit' as const } : null;
    if (!next) return;
    setChange(next);
    const id = setTimeout(() => setChange(null), 2600);
    return () => clearTimeout(id);
  }, [used, limit]);
  // Tiny limits (a 0.03 GB/day link) must not round down to a misleading zero.
  if (limit > 0 && limit < 1) digits = Math.max(digits, 2);
  const ratio = limit > 0 ? used / limit : used > 0 ? 2 : 0;
  const state = limit <= 0 && used > 0 ? 'none' : ratio > 1 ? 'over' : ratio > 0.9 ? 'tight' : 'ok';
  return (
    <div className="gauge" data-state={state} title={hint}>
      <div className="gauge-row">
        <span className="gauge-label">
          {label}
          {change && Number.isFinite(change.value) && (
            <span
              className="gauge-delta"
              data-good={change.of === 'used' && twoSided ? 'neutral' : change.of === 'limit' ? change.value > 0 : change.value < 0}
            >
              {change.of === 'limit' ? t('предел ', 'limit ') : ''}
              {change.value > 0 ? '+' : '−'}
              {t.n(Math.abs(change.value), Math.abs(change.value) < 10 ? Math.max(digits, 1) : digits)}
            </span>
          )}
        </span>
        <span className="gauge-value">
          {t.n(used, digits)} <span className="of">/ {limit > 0 ? t.n(limit, digits) : '—'} {unit}</span>
        </span>
      </div>
      <div className="gauge-track" role="img" aria-label={`${label}: ${t.n(used, digits)} / ${t.n(limit, digits)} ${unit}`}>
        <div className="gauge-fill" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      {hint && <p className="gauge-hint">{hint}</p>}
      {fix && (state === 'over' || state === 'none') && <p className="gauge-fix">{fix}</p>}
    </div>
  );
}
