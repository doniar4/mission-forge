import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useT } from '../../i18n';
import type { RailGroup } from './parts';

export interface Delta {
  mass: number;
  power: number;
  cost: number;
  science: number;
  blockers: number;
}

const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A row of part cards to slide through. For a one-of-many choice the slider underneath
 * scrubs straight through the options; for instruments each card toggles.
 * Hovering or focusing a card fits it to the spacecraft for a moment (onPreview).
 */
export function PartRail({
  group,
  deltas,
  disabled,
  showTitle = true,
  onPick,
  onPreview,
}: {
  group: RailGroup;
  deltas: Record<string, Delta>;
  disabled: boolean;
  /** Off when tabs above already name the group. */
  showTitle?: boolean;
  onPick: (id: string) => void;
  onPreview: (id: string | null) => void;
}) {
  const t = useT();
  // The card under the pointer (or keyboard focus) tells its story above the rail.
  const [peek, setPeek] = useState<string | null>(null);
  const look = (id: string | null) => {
    setPeek(id);
    if (!disabled) onPreview(id);
  };
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const multi = !!group.multi;
  const index = multi ? -1 : group.cards.findIndex((c) => group.selected.includes(c.id));
  const told = group.cards.find((c) => c.id === peek) ?? (index >= 0 ? group.cards[index] : undefined);

  const centre = (i: number, smooth = true) => {
    const el = track.current?.children[i] as HTMLElement | undefined;
    if (!el || !track.current) return;
    const left = el.offsetLeft - (track.current.clientWidth - el.clientWidth) / 2;
    track.current.scrollTo({ left, behavior: smooth && !still() ? 'smooth' : 'auto' });
  };
  // Keep the chosen card in the middle of the rail when the choice changes.
  useEffect(() => {
    if (index >= 0) centre(index);
  }, [index, group.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (index >= 0) centre(index, false);
  }, [group.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = (dir: 1 | -1) => {
    if (multi || index < 0) {
      track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.7, behavior: still() ? 'auto' : 'smooth' });
      return;
    }
    const next = Math.min(group.cards.length - 1, Math.max(0, index + dir));
    if (next !== index) onPick(group.cards[next].id);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const cards = [...(track.current?.querySelectorAll<HTMLButtonElement>('.part') ?? [])];
    const at = cards.indexOf(document.activeElement as HTMLButtonElement);
    const to = Math.min(cards.length - 1, Math.max(0, (at < 0 ? Math.max(0, index) : at) + (e.key === 'ArrowRight' ? 1 : -1)));
    cards[to]?.focus();
    if (!multi && !disabled) onPick(group.cards[to].id);
  };

  // Mouse drag to slide; a drag must not count as a click on the card under the pointer.
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || !track.current) return;
    drag.current = { x: e.clientX, left: track.current.scrollLeft, moved: false };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !track.current) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 5) d.moved = true;
    if (d.moved) track.current.scrollLeft = d.left - dx;
  };
  const up = () => {
    setTimeout(() => (drag.current = null), 0);
  };

  return (
    <div className="rail-wrap">
      <div className="rail-head">
        <div className="rail-story" aria-live="polite">
          {showTitle && <h3>{group.title}</h3>}
          {group.hint && <p className="rail-hint">{group.hint}</p>}
          {told && (
            <p className="rail-desc">
              <b>{told.name}.</b> {told.desc}
              {told.note && <span className="rail-note"> {told.note}</span>}
            </p>
          )}
        </div>
        <div className="rail-nav">
          <button type="button" className="round" onClick={() => step(-1)} disabled={!multi && index <= 0} aria-label={t('Предыдущий вариант', 'Previous option')}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            className="round"
            onClick={() => step(1)}
            disabled={!multi && index >= group.cards.length - 1 && index >= 0}
            aria-label={t('Следующий вариант', 'Next option')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={track}
        className="rail-track"
        role={multi ? 'group' : 'radiogroup'}
        aria-label={group.title}
        onKeyDown={onKey}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={() => {
          up();
          look(null);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) look(null);
        }}
      >
        {group.cards.map((c, i) => {
          const on = group.selected.includes(c.id);
          const d = deltas[c.id];
          return (
            <button
              key={c.id}
              type="button"
              className="part"
              data-tall={c.tall || undefined}
              data-warn={!!c.warning || undefined}
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={on}
              tabIndex={multi || on || (index < 0 && i === 0) ? 0 : -1}
              disabled={disabled}
              onMouseEnter={() => look(c.id)}
              onFocus={() => look(c.id)}
              onClick={() => {
                if (drag.current?.moved) return;
                onPick(c.id);
              }}
            >
              <span className="part-art">
                <img src={c.thumb} alt="" loading="lazy" decoding="async" draggable={false} />
                <span className="part-mark" aria-hidden="true">
                  {on && (
                    <svg viewBox="0 0 24 24">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </span>
              </span>
              <span className="part-body">
                <span className="part-name">
                  {c.tier && (
                    <span className="part-tier" data-tier={c.tier.level} title={c.tier.name}>
                      <i aria-hidden="true" />
                      <i aria-hidden="true" />
                      <i aria-hidden="true" />
                      <span className="sr-only">{c.tier.name}</span>
                    </span>
                  )}
                  {c.name}
                </span>
                {d && !on && <Deltas d={d} />}
                {d && on && multi && (
                  <span className="part-state">{t('на борту', 'on board')}</span>
                )}
                {on && !multi && <span className="part-state">{t('установлено', 'fitted')}</span>}
                {c.warning && <span className="part-warning">{c.warning}</span>}
                {c.stats.length > 0 && (
                  <span className="part-stats">
                    {c.stats.map((s) => (
                      <span key={s.label}>
                        <span>{s.label}</span>
                        <b>{s.value}</b>
                      </span>
                    ))}
                  </span>
                )}
                {c.tags && (
                  <span className="part-tags">
                    {c.tags.map((g) => (
                      <span key={g.text} data-good={g.good || undefined}>
                        {g.text}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {!multi && group.cards.length > 1 && (
        <label className="scrub">
          <span className="sr-only">{group.title}</span>
          <input
            type="range"
            min={0}
            max={group.cards.length - 1}
            step={1}
            value={Math.max(0, index)}
            disabled={disabled}
            aria-valuetext={group.cards[Math.max(0, index)].name}
            onChange={(e) => onPick(group.cards[Number(e.target.value)].id)}
            style={{ ['--fill' as string]: `${(Math.max(0, index) / (group.cards.length - 1)) * 100}%` }}
          />
          <span className="scrub-ticks" aria-hidden="true">
            {group.cards.map((c, i) => (
              <i key={c.id} data-on={i === index} />
            ))}
          </span>
        </label>
      )}
    </div>
  );
}

function Deltas({ d }: { d: Delta }) {
  const t = useT();
  const chips: { text: string; good: boolean }[] = [];
  const sign = (x: number) => (x > 0 ? '+' : '−');
  if (Math.abs(d.science) >= 0.01) chips.push({ text: t(`наука ${sign(d.science)}${t.n(Math.abs(d.science) * 100)}%`, `science ${sign(d.science)}${t.n(Math.abs(d.science) * 100)}%`), good: d.science > 0 });
  if (Math.abs(d.mass) >= 0.5) chips.push({ text: `${sign(d.mass)}${t.n(Math.abs(d.mass))} ${t('кг', 'kg')}`, good: d.mass < 0 });
  if (Math.abs(d.power) >= 0.5) chips.push({ text: `${sign(d.power)}${t.n(Math.abs(d.power))} ${t('Вт', 'W')}`, good: d.power < 0 });
  if (Math.abs(d.cost) >= 0.1) chips.push({ text: `${sign(d.cost)}${t.money(Math.abs(d.cost))}`, good: d.cost < 0 });
  if (d.blockers > 0) chips.push({ text: t('не пройдёт комиссию', 'fails the review'), good: false });
  if (chips.length === 0) return null;
  return (
    <span className="part-deltas" aria-label={t('Что изменится', 'What changes')}>
      {chips.map((c) => (
        <span key={c.text} data-good={c.good}>
          {c.text}
        </span>
      ))}
    </span>
  );
}
