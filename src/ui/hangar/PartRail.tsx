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

/**
 * One part at a time: the card in the middle, big arrows on either side, dots and a counter
 * underneath. The arrows only browse; the button on the card (or a click on it) fits the part.
 * Hovering or focusing the card fits it to the spacecraft for a moment (onPreview).
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
  const multi = !!group.multi;
  const count = group.cards.length;
  const start = () => Math.max(0, group.cards.findIndex((c) => group.selected.includes(c.id)));
  const [cur, setCur] = useState(start);
  // A new group (another stage or instrument class) opens on its fitted part, or the first.
  useEffect(() => setCur(start()), [group.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const index = Math.min(cur, count - 1);
  const card = group.cards[index];
  const on = group.selected.includes(card.id);
  const d = deltas[card.id];
  const swipe = useRef<{ x: number; done: boolean } | null>(null);

  const go = (to: number) => {
    const next = Math.min(count - 1, Math.max(0, to));
    if (next === index) return;
    setCur(next);
    onPreview(null);
  };
  const pick = () => {
    if (disabled || (on && !multi)) return;
    onPick(card.id);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      go(index + (e.key === 'ArrowRight' ? 1 : -1));
    }
  };
  // A sideways swipe on a touch screen browses like the arrows.
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') swipe.current = { x: e.clientX, done: false };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    if (!s || s.done) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 48) {
      s.done = true;
      go(index + (dx < 0 ? 1 : -1));
    }
  };

  const action = multi
    ? on
      ? t('Убрать с борта', 'Remove')
      : t('Добавить на борт', 'Add to spacecraft')
    : on
      ? t('Установлено', 'Fitted')
      : t('Установить', 'Fit this');

  return (
    <div className="rail-wrap rail-one">
      {(showTitle || group.hint) && (
        <div className="rail-head">
          <div className="rail-story">
            {showTitle && <h3>{group.title}</h3>}
            {group.hint && <p className="rail-hint">{group.hint}</p>}
          </div>
        </div>
      )}

      <div className="rail-stage" role="group" aria-roledescription={t('карусель', 'carousel')} aria-label={group.title} onKeyDown={onKey}>
        <button type="button" className="rail-arrow" onClick={() => go(index - 1)} disabled={index === 0} aria-label={t('Предыдущий вариант', 'Previous option')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>

        <div
          className="part part-one"
          data-on={on || undefined}
          data-warn={!!card.warning || undefined}
          data-tall={card.tall || undefined}
          aria-live="polite"
          onMouseEnter={() => !disabled && onPreview(card.id)}
          onMouseLeave={() => onPreview(null)}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={() => (swipe.current = null)}
        >
          <button type="button" className="part-art" onClick={pick} disabled={disabled} tabIndex={-1} aria-hidden="true">
            <img src={card.thumb} alt="" decoding="async" draggable={false} />
          </button>
          <div className="part-body">
            <div className="part-name">
              {card.tier && (
                <span className="part-tier" data-tier={card.tier.level} title={card.tier.name}>
                  <i aria-hidden="true" />
                  <i aria-hidden="true" />
                  <i aria-hidden="true" />
                  <span className="sr-only">{card.tier.name}</span>
                </span>
              )}
              <span>{card.name}</span>
              {on && <span className="part-state">{multi ? t('на борту', 'on board') : t('установлено', 'fitted')}</span>}
            </div>
            <p className="part-desc">
              {card.desc}
              {card.note && <span className="rail-note"> {card.note}</span>}
            </p>
            {card.stats.length > 0 && (
              <dl className="part-stats">
                {card.stats.map((s) => (
                  <div key={s.label}>
                    <dt>{s.label}</dt>
                    <dd>{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {card.warning && <span className="part-warning">{card.warning}</span>}
            {d && !on && <Deltas d={d} />}
            {card.tags && card.tags.some((g) => g.good) && (
              <span className="part-tags">
                {card.tags
                  .filter((g) => g.good)
                  .map((g) => (
                    <span key={g.text} data-good>
                      {g.text}
                    </span>
                  ))}
              </span>
            )}
          </div>
          <button
            type="button"
            className={on && !multi ? 'part-pick' : multi && on ? 'part-pick secondary' : 'part-pick primary'}
            data-done={(on && !multi) || undefined}
            disabled={disabled || (on && !multi)}
            onClick={pick}
          >
            {on && !multi && (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            )}
            {action}
          </button>
        </div>

        <button type="button" className="rail-arrow" onClick={() => go(index + 1)} disabled={index >= count - 1} aria-label={t('Следующий вариант', 'Next option')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {count > 1 && (
        <div className="rail-dots">
          <span className="rail-count" aria-live="polite">
            {index + 1} / {count}
          </span>
          <span className="rail-dots-list">
            {group.cards.map((c, i) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                aria-current={i === index || undefined}
                data-on={group.selected.includes(c.id) || undefined}
                onClick={() => go(i)}
              />
            ))}
          </span>
        </div>
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
    <span
      className="part-deltas"
      title={t(
        'Как изменится весь аппарат: кроме самой детали, растут корпус, проводка, энергосистема и цена разработки.',
        'How the whole spacecraft changes: besides the part itself, the structure, wiring, power system and development cost grow too.',
      )}
    >
      <span className="part-deltas-label">{t('Весь аппарат:', 'Whole spacecraft:')}</span>
      {chips.map((c) => (
        <span key={c.text} data-good={c.good}>
          {c.text}
        </span>
      ))}
    </span>
  );
}
