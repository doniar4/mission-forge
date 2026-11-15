import { useEffect, useMemo, useRef } from 'react';
import { play } from '../audio/sfx';
import { chooseDev, describe, devDone } from '../engine/development';
import { evaluate } from '../engine/evaluate';
import { scenarioById } from '../engine/scenarios';
import { memberName } from '../engine/team';
import type { Evaluation } from '../engine/types';
import { useT } from '../i18n';
import { useDesign, useStore } from '../store';
import { ROLES, TopBar } from './common';
import { Budgets } from './Studio';
import { LostBanner, useTeamState } from './Team';

/**
 * Development: the events between the finished design and the launch pad, one quarter at a time.
 * Each offers two or three ways out; the next event appears once this one is decided. In a team
 * each event is decided by the owner of its role, and the others watch.
 */
export function Development() {
  const t = useT();
  const design = useDesign();
  const scenarioId = useStore((s) => s.scenarioId);
  const difficulty = useStore((s) => s.difficulty);
  const choose = useStore((s) => s.devChoose);
  const launch = useStore((s) => s.launch);
  const goto = useStore((s) => s.goto);
  const team = useTeamState();
  const sc = scenarioById(scenarioId);
  const ev = useMemo(() => evaluate(design, sc, difficulty), [design, sc, difficulty]);
  const dev = design.dev;

  // A quiet chime when a new event lands on the desk.
  const shown = dev ? dev.choices.findIndex((c) => c === null) : -1;
  const last = useRef(-2);
  useEffect(() => {
    if (shown >= 0 && shown !== last.current) play('event');
    last.current = shown;
  }, [shown]);

  if (!dev) {
    return (
      <div className="page dev">
        <TopBar left={<span className="brand">{t(sc.name)}</span>} />
        <p className="muted pad">{t('Разработка ещё не начата.', 'Development has not started yet.')}</p>
        <button type="button" className="primary" onClick={() => goto('studio')}>
          {t('В ангар', 'To the hangar')}
        </button>
      </div>
    );
  }

  const done = devDone(design);
  const upto = done ? dev.events.length : shown + 1;

  return (
    <div className="page dev">
      <TopBar
        left={
          <>
            <span className="brand">{t(sc.name)}</span>
            <span className="crumb">{t('Разработка', 'Development')}</span>
          </>
        }
      />
      <LostBanner />
      <div className="dev-grid">
        <main>
          <span className="eyebrow">
            {t('После CML 4 · сборка и испытания (фазы C–D NASA)', 'After CML 4 · build and test (NASA Phases C–D)')}
          </span>
          <h1>{t('Разработка', 'Development')}</h1>
          <p className="lead">
            {t(
              `До запуска — ${dev.events.length} квартала работы. Готовый аппарат почти никогда не совпадает с чертежом: решайте, чем платить за неожиданности.`,
              `${dev.events.length} quarters of work before the launch. A finished spacecraft almost never matches its drawing: decide what to pay for the surprises with.`,
            )}
          </p>
          <ol className="dev-events">
            {dev.events.slice(0, upto).map((e, i) => {
              const story = describe(e, design);
              const choice = dev.choices[i];
              const owner = team?.state?.owners[e.role] ?? null;
              const mine = !team?.state || owner === team.myId;
              return (
                <li key={i} className="dev-event glass" data-done={choice !== null || undefined}>
                  <span className="eyebrow">
                    {t(`Квартал ${i + 1}`, `Quarter ${i + 1}`)}
                    {team?.state && (
                      <span className="role-pill" data-role={e.role}>
                        {' · '}
                        {t(ROLES[e.role].name)}: {memberName(team.state, owner)}
                      </span>
                    )}
                  </span>
                  <h2>{t(story.title)}</h2>
                  <p>{t(story.text)}</p>
                  <div className="dev-options" role="group" aria-label={t('Варианты', 'Options')}>
                    {story.options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="dev-option"
                        aria-pressed={choice === o.id}
                        disabled={choice !== null || !mine}
                        onClick={() => {
                          play('select');
                          choose(i, o.id);
                        }}
                      >
                        <b>{t(o.label)}</b>
                        <span className="muted">{t(o.note)}</span>
                        {choice === null && <Effects now={ev} next={evaluate(chooseDev(design, i, o.id), sc, difficulty)} />}
                      </button>
                    ))}
                  </div>
                  {choice === null && !mine && (
                    <p className="muted small-print">
                      {t(`Решает ${memberName(team!.state!, owner)} — это раздел его роли. Обсудите в чате.`, `${memberName(team!.state!, owner)} decides: it is their role’s part. Talk it over in the chat.`)}
                    </p>
                  )}
                </li>
              );
            })}
            {dev.events.slice(upto).map((_, j) => (
              <li key={`later-${j}`} className="dev-event dev-later">
                <span className="eyebrow">{t(`Квартал ${upto + j + 1}`, `Quarter ${upto + j + 1}`)}</span>
                <span className="muted">{t('впереди', 'ahead')}</span>
              </li>
            ))}
          </ol>
        </main>

        <aside className="dev-side glass" aria-label={t('Ресурсы миссии', 'Mission resources')}>
          <h2 className="panel-title">{t('Ресурсы', 'Resources')}</h2>
          <Budgets ev={ev} design={design} sc={sc} onGo={() => goto('studio')} />
          <div className="launch">
            {!done ? (
              <p className="muted small-print">
                {t(`Осталось решить: ${dev.choices.filter((c) => c === null).length}.`, `Still to decide: ${dev.choices.filter((c) => c === null).length}.`)}
              </p>
            ) : ev.blockers > 0 ? (
              <>
                <p className="dev-verdict" data-state="bad">
                  {t(
                    `После разработки проект не проходит комиссию: ${ev.checks
                      .filter((c) => c.level === 'blocker')
                      .map((c) => c.title.ru.toLowerCase())
                      .join('; ')}. Поправьте его в ангаре.`,
                    `After development the design fails the review: ${ev.checks
                      .filter((c) => c.level === 'blocker')
                      .map((c) => c.title.en.toLowerCase())
                      .join('; ')}. Fix it in the hangar.`,
                  )}
                </p>
                {!team && (
                  <button type="button" className="primary" onClick={() => goto('studio')}>
                    {t('Вернуться в ангар', 'Back to the hangar')}
                  </button>
                )}
              </>
            ) : team ? (
              <p className="muted small-print">{t('Всё решено. Ракета уходит на старт.', 'All decided. The rocket rolls out to the pad.')}</p>
            ) : (
              <>
                <p className="dev-verdict" data-state="ok">
                  {t('Разработка завершена. Комиссия даёт допуск.', 'Development is complete. The board clears the launch.')}
                </p>
                <button
                  type="button"
                  className="launch-btn"
                  onClick={() => {
                    play('beep');
                    launch();
                  }}
                >
                  <span>{t('На старт', 'To the pad')}</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
                <button type="button" className="ghost small" onClick={() => goto('studio')}>
                  {t('Сначала заглянуть в ангар', 'Look into the hangar first')}
                </button>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** What an option would do, in chips: mass, power, money, months, and whether the board objects. */
function Effects({ now, next }: { now: Evaluation; next: Evaluation }) {
  const t = useT();
  const chips: { text: string; good: boolean }[] = [];
  const sign = (x: number) => (x > 0 ? '+' : '−');
  const mass = next.mass.wet - now.mass.wet;
  const power = next.power.average - next.power.load - (now.power.average - now.power.load);
  const cost = next.cost.total - now.cost.total;
  const budget = next.cost.budget - now.cost.budget;
  const months = next.time.devMonths - now.time.devMonths;
  if (Math.abs(mass) >= 0.5) chips.push({ text: `${sign(mass)}${t.n(Math.abs(mass))} ${t('кг', 'kg')}`, good: mass < 0 });
  if (Math.abs(power) >= 0.5) chips.push({ text: t(`запас энергии ${sign(power)}${t.n(Math.abs(power))} Вт`, `power margin ${sign(power)}${t.n(Math.abs(power))} W`), good: power > 0 });
  if (Math.abs(cost) >= 0.05) chips.push({ text: `${sign(cost)}${t.money(Math.abs(cost))}`, good: cost < 0 });
  if (Math.abs(budget) >= 0.5) chips.push({ text: t(`бюджет ${sign(budget)}${t.money(Math.abs(budget))}`, `budget ${sign(budget)}${t.money(Math.abs(budget))}`), good: budget > 0 });
  if (months !== 0) chips.push({ text: t(`${sign(months)}${Math.abs(months)} мес.`, `${sign(months)}${Math.abs(months)} mo`), good: months < 0 });
  if (next.blockers > now.blockers) chips.push({ text: t('не пройдёт комиссию', 'fails the review'), good: false });
  if (chips.length === 0) return null;
  return (
    <span className="part-deltas">
      {chips.map((c) => (
        <span key={c.text} data-good={c.good}>
          {c.text}
        </span>
      ))}
    </span>
  );
}
