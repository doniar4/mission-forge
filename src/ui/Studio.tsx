import { useEffect, useMemo, useState } from 'react';
import { DIFFICULTY, MEASURES, ORBITS, byId } from '../engine/catalog';
import { evaluate } from '../engine/evaluate';
import { scenarioById } from '../engine/scenarios';
import { goalsFor, memberName, rolesOf } from '../engine/team';
import type { Check, Design, Evaluation, Measure, Scenario } from '../engine/types';
import { useT } from '../i18n';
import { shareLink, useDesign, useStore } from '../store';
import type { Backdrop } from '../three/CraftStage';
import { Gauge, LangToggle, ROLES } from './common';
import { Craft3D } from './Craft3D';
import { PartRail, type Delta } from './hangar/PartRail';
import { LESSONS, SECTIONS, WHERE, deltas, groupsFor, type RailGroup, type SectionId } from './hangar/parts';
import { LostBanner, TeamPanel, useTeamState } from './Team';

/** The order in which a newcomer should clear the required findings. */
const FIRST = ['no_orbit', 'no_instruments', 'no_engine', 'magnetic', 'tank_limit', 'bus_power', 'ion_power', 'no_vehicle', 'vehicle_reach', 'overweight', 'over_budget'];

/** Wide screens keep the hangar on one screen; narrow ones scroll. */
function useWide() {
  const q = '(min-width: 1100px) and (min-height: 640px)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * The hangar: the spacecraft in the middle of the screen, the parts to choose from on a slider
 * below it, what they cost on the left, what the review board thinks on the right.
 */
export function Studio() {
  const t = useT();
  const scenarioId = useStore((s) => s.scenarioId);
  const difficulty = useStore((s) => s.difficulty);
  const goto = useStore((s) => s.goto);
  const launch = useStore((s) => s.launch);
  const patch = useStore((s) => s.patch);
  const toggle = useStore((s) => s.toggleInstrument);
  const resetDesign = useStore((s) => s.resetDesign);
  const design = useDesign();
  const sc = scenarioById(scenarioId);
  const ev = useMemo(() => evaluate(design, sc, difficulty), [design, sc, difficulty]);
  const team = useTeamState();
  const goals = useMemo(() => goalsFor(sc, ev), [sc, ev]);
  const wide = useWide();
  const [section, setSection] = useState<SectionId>('brief');
  const [groupIx, setGroupIx] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const current = SECTIONS.find((x) => x.id === section)!;
  const canEdit = !team?.state || section === 'brief' || rolesOf(team.state, team.myId).includes(current.role);
  const advanced = difficulty !== 'cadet';
  const groups = useMemo(() => groupsFor(section, { t, design, ev, sc, advanced }), [section, t, design, ev, sc, advanced]);
  const group = groups[Math.min(groupIx, groups.length - 1)];
  const rail = group?.kind === 'rail' ? group : null;

  const go = (s: SectionId) => {
    setSection(s);
    setGroupIx(0);
    setHover(null);
  };

  // What each card would do to the mission, against the design as it stands.
  const cardDeltas = useMemo(() => {
    const out: Record<string, Delta> = {};
    if (!rail) return out;
    for (const c of rail.cards) out[c.id] = deltas(ev, evaluate({ ...design, ...rail.pick(c.id) }, sc, difficulty));
    return out;
  }, [rail, design, ev, sc, difficulty]);

  // Hovering a card fits that part to the spacecraft until the pointer moves on.
  const shown: Design = useMemo(() => (rail && hover && canEdit ? { ...design, ...rail.pick(hover) } : design), [rail, hover, canEdit, design]);
  const shownEv = useMemo(() => (shown === design ? ev : evaluate(shown, sc, difficulty)), [shown, design, ev, sc, difficulty]);
  const backdrop: Backdrop = (() => {
    const o = byId(ORBITS, shown.orbit);
    return (o?.body ?? sc.body) as Backdrop;
  })();

  const pick = (g: RailGroup, id: string) => {
    if (!canEdit) return;
    if (g.multi) toggle(id);
    else if (!g.selected.includes(id)) patch(g.pick(id));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink(scenarioId, difficulty, design));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const issues = (id: SectionId) => ev.checks.filter((c) => WHERE[c.id] === id);
  const index = SECTIONS.findIndex((s) => s.id === section);
  const next = SECTIONS[index + 1];

  return (
    <div className="hangar" data-section={section}>
      <Craft3D design={shown} ev={shownEv} variant="stage" focus={current.focus} backdrop={backdrop} offset={wide ? [0, 0.17] : [0, 0]} />
      <div className="hangar-shade" aria-hidden="true" />

      <header className="hangar-top">
        <div className="hangar-id">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (!team || window.confirm(t('Выйти из комнаты? Проект команды останется у остальных.', 'Leave the room? The team’s design stays with the others.'))) goto('home');
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
            {team ? t('Выйти', 'Leave') : t('Миссии', 'Missions')}
          </button>
          <div>
            <span className="eyebrow">
              {t(DIFFICULTY[difficulty].name)}
              {team?.state && t(` · комната ${team.state.code}`, ` · room ${team.state.code}`)}
            </span>
            <b className="hangar-title">{t(sc.name)}</b>
          </div>
        </div>

        <nav className="steps-bar" aria-label={t('Этапы проекта', 'Design stages')}>
          <ol>
            {SECTIONS.map((s, i) => {
              const list = issues(s.id);
              const blocked = list.some((c) => c.level === 'blocker');
              return (
                <li key={s.id}>
                  <button type="button" data-role={s.role} aria-current={section === s.id ? 'step' : undefined} onClick={() => go(s.id)}>
                    <span className="step-no">{String(i + 1).padStart(2, '0')}</span>
                    <span className="step-name">{t(s.name)}</span>
                    {list.length > 0 ? (
                      <span className="step-flag" data-level={blocked ? 'blocker' : 'warn'} aria-label={t(`замечаний: ${list.length}`, `${list.length} findings`)}>
                        {list.length}
                      </span>
                    ) : (
                      s.id !== 'brief' && (
                        <span className="step-ok" aria-label={t('без замечаний', 'no findings')}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                          </svg>
                        </span>
                      )
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="hangar-tools">
          {!team && (
            <>
              <button type="button" className="ghost" onClick={copy}>
                {copied ? t('Ссылка скопирована', 'Link copied') : t('Поделиться', 'Share')}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  if (window.confirm(t('Очистить проект и начать заново?', 'Clear the design and start over?'))) resetDesign();
                }}
              >
                {t('Сбросить', 'Reset')}
              </button>
            </>
          )}
          <LangToggle />
        </div>
      </header>
      <LostBanner />

      <aside className="hangar-left glass" aria-label={t('Ресурсы миссии', 'Mission resources')}>
        <h2 className="panel-title">{t('Ресурсы', 'Resources')}</h2>
        <Budgets ev={ev} />
      </aside>

      <aside className="hangar-right" aria-label={t('Комиссия и запуск', 'Review and launch')}>
        <Coach checks={ev.checks} onGo={go} />
        <div className="glass panel-scroll">
          <Review checks={ev.checks} onGo={go} />
          {team ? (
            <TeamPanel goals={goals} blockers={ev.blockers} />
          ) : (
            <div className="launch">
              <button type="button" className="launch-btn" disabled={ev.blockers > 0} onClick={launch}>
                <span>{t('На старт', 'To the pad')}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
              <p className="muted small-print">
                {ev.blockers > 0
                  ? t(`Комиссия не допустит к запуску: обязательных замечаний ${ev.blockers}.`, `The board will not clear the launch: ${ev.blockers} required findings.`)
                  : ev.checks.length > 0
                    ? t('Риски не запрещают полёт, но проявятся в космосе.', 'Risks do not stop the flight, but they will show up in space.')
                    : t('Замечаний нет. Проект готов к запуску.', 'No findings. The design is ready to fly.')}
              </p>
            </div>
          )}
        </div>
      </aside>

      <section className="dock glass" aria-labelledby="dock-title">
        <div className="dock-head">
          <div className="dock-title">
            <span className="dock-no">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <span className="role-pill" data-role={current.role}>
                {t(ROLES[current.role].name)}
                {team?.state && section !== 'brief' && <span> · {memberName(team.state, team.state.owners[current.role])}</span>}
              </span>
              <h2 id="dock-title">{t(current.name)}</h2>
            </div>
          </div>
          <p className="dock-lesson">{t(LESSONS[section])}</p>
          <div className="dock-actions">
            {groups.length > 1 && (
              <div className="group-tabs" role="tablist" aria-label={t('Что выбираем', 'What to choose')}>
                {groups.map((g, i) => (
                  <button key={g.id} type="button" role="tab" aria-selected={g === group} onClick={() => setGroupIx(i)}>
                    {g.title}
                  </button>
                ))}
              </div>
            )}
            {next && section !== 'brief' && (
              <button type="button" className="secondary small" onClick={() => go(next.id)}>
                {t(`Дальше: ${next.name.ru}`, `Next: ${next.name.en}`)}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {!canEdit && (
          <p className="readonly" role="note">
            {t('Этот раздел ведёт другой участник. Вы видите всё, но менять можете только свои разделы — предложите правку в чате.', 'Another player holds this section. You can see everything but change only your own — propose an edit in the chat.')}
          </p>
        )}

        <div className="dock-body">
          {section === 'brief' && <Brief sc={sc} ev={ev} onStart={() => go('orbit')} />}
          {rail && <PartRail group={rail} deltas={cardDeltas} disabled={!canEdit} showTitle={groups.length < 2} onPick={(id) => pick(rail, id)} onPreview={setHover} />}
          {group?.kind === 'years' && <Years design={design} sc={sc} title={group.title} hint={group.hint} disabled={!canEdit} onChange={(y) => patch({ lifeYears: y })} />}
        </div>

      </section>
    </div>
  );
}

function Brief({ sc, ev, onStart }: { sc: Scenario; ev: Evaluation; onStart: () => void }) {
  const t = useT();
  const weights = (Object.entries(sc.weights) as [Measure, number][]).sort((a, b) => b[1] - a[1]).slice(0, sc.sandbox ? 11 : 6);
  return (
    <div className="brief-panel">
      <div className="brief-main">
        <p className="brief-text">{t(sc.brief)}</p>
        <dl className="terms">
          <div>
            <dt>{t('Бюджет', 'Budget')}</dt>
            <dd>{t.money(ev.cost.budget)}</dd>
          </div>
          <div>
            <dt>{t('До запуска', 'To launch')}</dt>
            <dd>{t(`${sc.deadlineMonths} мес.`, `${sc.deadlineMonths} mo`)}</dd>
          </div>
          <div>
            <dt>{t('На орбите', 'In orbit')}</dt>
            <dd>{t(`${sc.targetYears} г.`, `${sc.targetYears} yr`)}</dd>
          </div>
        </dl>
        <button type="button" className="primary" onClick={onStart}>
          {t('Начать сборку', 'Start building')}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      <div className="brief-needs">
        <h3>{t('Что нужно измерить', 'What has to be measured')}</h3>
        <ul className="needs">
          {weights.map(([m, w]) => {
            const q = ev.science.quality[m] ?? 0;
            return (
              <li key={m}>
                <span className="needs-name">{t(MEASURES[m])}</span>
                <span className="needs-weight">{t(`${Math.round(w * 100)}% задачи`, `${Math.round(w * 100)}% of goal`)}</span>
                <span className="needs-bar" role="img" aria-label={t(`закрыто на ${Math.round(q * 100)}%`, `${Math.round(q * 100)}% covered`)}>
                  <i style={{ width: `${q * 100}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Years({ design, sc, title, hint, disabled, onChange }: { design: Design; sc: Scenario; title: string; hint: string; disabled: boolean; onChange: (y: number) => void }) {
  const t = useT();
  return (
    <div className="years">
      <div className="years-value">
        <span className="years-big">{design.lifeYears}</span>
        <span>{t(design.lifeYears === 1 ? 'год' : design.lifeYears < 5 ? 'года' : 'лет', design.lifeYears === 1 ? 'year' : 'years')}</span>
      </div>
      <div className="years-control">
        <h3>{title}</h3>
        <p className="rail-hint">{hint}</p>
        <label className="scrub">
          <span className="sr-only">{title}</span>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={design.lifeYears}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ ['--fill' as string]: `${((design.lifeYears - 1) / 9) * 100}%` }}
          />
          <span className="scrub-ticks" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <i key={i} data-on={i + 1 === design.lifeYears} data-target={i + 1 === sc.targetYears || undefined} />
            ))}
          </span>
        </label>
        <p className="rail-hint">{t(`Отметка — срок, который просит заказчик (${sc.targetYears} г.).`, `The marked tick is what the customer asks for (${sc.targetYears} yr).`)}</p>
      </div>
    </div>
  );
}

/** One thing to do next, in plain words: the first required finding, or the go-ahead. */
function Coach({ checks, onGo }: { checks: Check[]; onGo: (s: SectionId) => void }) {
  const t = useT();
  const required = checks.filter((c) => c.level === 'blocker').sort((a, b) => FIRST.indexOf(a.id) - FIRST.indexOf(b.id));
  const risks = checks.length - required.length;
  const next = required[0];
  const where = next && WHERE[next.id] ? SECTIONS.find((s) => s.id === WHERE[next.id]) : undefined;
  return (
    <div className="coach glass" data-state={next ? 'todo' : risks ? 'risk' : 'ready'} role="status">
      <span className="eyebrow">
        {next ? t(`Следующий шаг · осталось ${required.length}`, `Next step · ${required.length} to go`) : t('Допуск к запуску', 'Cleared for launch')}
      </span>
      <b>
        {next
          ? t(next.title)
          : risks
            ? t(`Можно запускать. Принятых рисков: ${risks}`, `Ready to fly. Accepted risks: ${risks}`)
            : t('Проект готов к запуску', 'The design is ready to fly')}
      </b>
      <span className="coach-why">{next ? t(next.why) : t('Риски не запрещают полёт, но проявятся в космосе.', 'Risks do not stop the flight, but will show up in space.')}</span>
      {where && (
        <button type="button" className="ghost small" onClick={() => onGo(where.id)}>
          {t(`К разделу «${where.name.ru}»`, `Go to ${where.name.en}`)}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}

function Budgets({ ev }: { ev: Evaluation }) {
  const t = useT();
  return (
    <div className="budgets">
      <Gauge label={t('Масса', 'Mass')} used={ev.mass.wet} limit={ev.mass.capacity} unit={t('кг', 'kg')} hint={t('с топливом / сколько довезёт ракета', 'fuelled / what the rocket can carry')} />
      <Gauge label={t('Энергия', 'Power')} used={ev.power.load} limit={ev.power.average} unit={t('Вт', 'W')} hint={t('потребление / средняя выработка', 'demand / average supply')} />
      <Gauge label={t('Данные', 'Data')} used={ev.data.generated} limit={ev.data.downlink} unit={t('ГБ/сут', 'GB/day')} digits={1} twoSided hint={t('создают приборы / пропускает связь', 'produced / carried by the link')} />
      <Gauge label={t('Бюджет', 'Budget')} used={ev.cost.total} limit={ev.cost.budget} unit={t('млн $', '$M')} hint={t('стоимость миссии / бюджет', 'mission cost / budget')} />
      <Gauge label={t('Срок разработки', 'Development')} used={ev.time.devMonths} limit={ev.time.deadline} unit={t('мес.', 'mo')} />
      <div className="forecast" data-state={ev.science.projected >= 1 ? 'ok' : ev.science.projected >= 0.5 ? 'tight' : 'over'}>
        <div className="gauge-row">
          <span className="gauge-label">{t('Прогноз науки', 'Science forecast')}</span>
          <span className="gauge-value">{t.pct(ev.science.projected)}</span>
        </div>
        <div className="gauge-track forecast-track" role="img" aria-label={t(`Прогноз науки: ${t.pct(ev.science.projected)} от цели`, `Science forecast: ${t.pct(ev.science.projected)} of target`)}>
          <div className="gauge-fill" style={{ width: `${Math.min(100, (ev.science.projected / 1.4) * 100)}%` }} />
        </div>
        <p className="gauge-hint">{t('отметка — цель заказчика', 'the tick is the customer’s target')}</p>
      </div>
    </div>
  );
}

function Review({ checks, onGo }: { checks: Check[]; onGo: (s: SectionId) => void }) {
  const t = useT();
  const sorted = [...checks].sort((a, b) => (a.level === b.level ? 0 : a.level === 'blocker' ? -1 : 1));
  return (
    <div className="review">
      <h2 className="panel-title">
        {t('Комиссия', 'Review board')}
        <span className="muted"> {sorted.length > 0 ? sorted.length : ''}</span>
      </h2>
      {sorted.length === 0 ? (
        <p className="muted">{t('Замечаний нет.', 'No findings.')}</p>
      ) : (
        <ul>
          {sorted.map((c) => (
            <li key={c.id} data-level={c.level}>
              <details>
                <summary>
                  <span className="review-level">{c.level === 'blocker' ? t('Обязательно', 'Required') : t('Риск', 'Risk')}</span>
                  <span>{t(c.title)}</span>
                </summary>
                <p>{t(c.why)}</p>
                {WHERE[c.id] && (
                  <button type="button" className="link" onClick={() => onGo(WHERE[c.id])}>
                    {t(`Открыть раздел «${SECTIONS.find((s) => s.id === WHERE[c.id])!.name.ru}»`, `Open ${SECTIONS.find((s) => s.id === WHERE[c.id])!.name.en}`)}
                  </button>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
