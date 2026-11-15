import { play } from '../audio/sfx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DIFFICULTY, MEASURES, ORBITS, byId } from '../engine/catalog';
import { devDone, devStarted } from '../engine/development';
import { evaluate } from '../engine/evaluate';
import { maturityOf } from '../engine/maturity';
import { scenarioById } from '../engine/scenarios';
import { goalsFor, memberName, rolesOf } from '../engine/team';
import type { Check, Design, Evaluation, L, Measure, Scenario } from '../engine/types';
import { useT } from '../i18n';
import { shareLink, useDesign, useStore } from '../store';
import type { Backdrop } from '../three/CraftStage';
import { Gauge, LangToggle, ROLES, SoundToggle } from './common';
import { Craft3D } from './Craft3D';
import { PartRail, type Delta } from './hangar/PartRail';
import { LESSONS, SECTIONS, WHERE, deltas, groupsFor, type RailGroup, type SectionId } from './hangar/parts';
import { RealMissionHint } from './RealMission';
import { LostBanner, TeamPanel, useTeamState } from './Team';

/** The order in which a newcomer should clear the required findings. */
const FIRST = ['no_orbit', 'no_vehicle', 'vehicle_reach', 'no_instruments', 'overweight', 'bus_power', 'ion_power', 'no_engine', 'magnetic', 'tank_limit', 'over_budget'];

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
  const develop = useStore((s) => s.develop);
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
  const [jump, setJump] = useState(0);
  // Free look: the panels step aside and the spacecraft can be turned and zoomed at will.
  const [inspect, setInspect] = useState(false);
  // The dock is as tall as its content; the side panels and the 3D framing read its height from
  // --dock-h, so nothing ever slides under it whatever the screen size.
  const hangarRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const dock = dockRef.current;
    const root = hangarRef.current;
    if (!dock || !root || typeof ResizeObserver === 'undefined') return;
    const set = () => root.style.setProperty('--dock-h', `${Math.ceil(dock.getBoundingClientRect().height)}px`);
    const ro = new ResizeObserver(set);
    ro.observe(dock);
    set();
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!inspect) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setInspect(false);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [inspect]);

  const current = SECTIONS.find((x) => x.id === section)!;
  const canEdit = !team?.state || section === 'brief' || rolesOf(team.state, team.myId).includes(current.role);
  const advanced = difficulty !== 'cadet';
  const groups = useMemo(() => groupsFor(section, { t, design, ev, sc, advanced }), [section, t, design, ev, sc, advanced]);
  const group = groups[Math.min(groupIx, groups.length - 1)];
  const rail = group?.kind === 'rail' ? group : null;

  const go = (s: SectionId) => {
    if (s !== section) play('tick');
    setSection(s);
    // Instruments open on the standard class: a set of those meets the goal.
    setGroupIx(s === 'payload' ? 1 : 0);
    setHover(null);
    setInspect(false);
    setJump((n) => n + 1);
  };
  // On a narrow screen the page scrolls: bring the section that was just opened into view,
  // otherwise a tab click from the bottom of the page seems to do nothing. An instant jump:
  // a smooth scroll gets cancelled when the part rail re-centres itself.
  useEffect(() => {
    if (jump > 0 && !wide) document.querySelector('.dock')?.scrollIntoView({ block: 'start' });
  }, [jump]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!canEdit) return play('deny');
    if (g.multi) {
      play(g.selected.includes(id) ? 'deselect' : 'select');
      toggle(id);
    } else if (!g.selected.includes(id)) {
      play('select');
      patch(g.pick(id));
    }
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
    <div ref={hangarRef} className="hangar" data-section={section} data-inspect={inspect || undefined}>
      <Craft3D
        design={shown}
        ev={shownEv}
        variant="stage"
        focus={inspect ? [] : current.focus}
        backdrop={backdrop}
        offset={wide && !inspect ? [0, 0.06] : [0, 0]}
        rocket={section === 'rocket' && !inspect ? shown.vehicle : null}
        inspect={inspect}
      />
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
                  <button
                    type="button"
                    data-role={s.role}
                    aria-current={section === s.id ? 'step' : undefined}
                    title={
                      list.length > 0
                        ? blocked
                          ? t(`Замечаний комиссии: ${list.length}. Без исправления не запустят.`, `${list.length} review findings. Must be fixed before launch.`)
                          : t(`Рисков: ${list.length}. Запустить можно, но они проявятся в полёте.`, `${list.length} risks. You can fly, but they will show up in space.`)
                        : s.id !== 'brief'
                          ? t('Замечаний нет', 'No findings')
                          : undefined
                    }
                    onClick={() => go(s.id)}
                  >
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
          <button
            type="button"
            className="icon-btn"
            aria-pressed={inspect}
            aria-label={t('Осмотреть аппарат', 'Inspect the spacecraft')}
            title={t('Осмотреть аппарат', 'Inspect the spacecraft')}
            onClick={() => setInspect((x) => !x)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          {!team && (
            <>
              <button
                type="button"
                className="icon-btn tool-extra"
                aria-label={copied ? t('Ссылка скопирована', 'Link copied') : t('Поделиться проектом', 'Share the design')}
                title={copied ? t('Ссылка скопирована', 'Link copied') : t('Поделиться проектом', 'Share the design')}
                onClick={copy}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {copied ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />}
                </svg>
              </button>
              <button
                type="button"
                className="icon-btn tool-extra"
                aria-label={t('Начать проект заново', 'Start the design over')}
                title={t('Начать проект заново', 'Start the design over')}
                onClick={() => {
                  if (window.confirm(t('Очистить проект и начать заново?', 'Clear the design and start over?'))) resetDesign();
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4.5h4.5" />
                </svg>
              </button>
            </>
          )}
          <SoundToggle />
          <LangToggle />
        </div>
      </header>
      <LostBanner />

      {inspect && (
        <div className="inspect-bar glass" role="status">
          <span>{t('Тяните, чтобы повернуть; колесо или щипок — приблизить.', 'Drag to turn; scroll or pinch to zoom.')}</span>
          <button type="button" className="secondary small" onClick={() => setInspect(false)}>
            {t('Вернуться к сборке', 'Back to building')}
          </button>
        </div>
      )}

      <aside className="hangar-left glass" aria-label={t('Ресурсы миссии', 'Mission resources')}>
        <h2 className="panel-title">{t('Ресурсы', 'Resources')}</h2>
        <Budgets ev={ev} design={design} sc={sc} onGo={go} />
      </aside>

      <aside className="hangar-right" aria-label={t('Комиссия и запуск', 'Review and launch')}>
        <Coach checks={ev.checks} design={design} onGo={go} />
        <div className="glass panel-scroll">
          <Review checks={ev.checks} onGo={go} />
          {team ? (
            <TeamPanel goals={goals} blockers={ev.blockers} />
          ) : (
            <div className="launch">
              <button
                type="button"
                className="launch-btn"
                disabled={ev.blockers > 0}
                onClick={() => {
                  play('beep');
                  develop();
                }}
              >
                <span>{devDone(design) ? t('На старт', 'To the pad') : devStarted(design) ? t('К разработке', 'Back to development') : t('В разработку', 'Into development')}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
              <p className="muted small-print">
                {ev.blockers > 0
                  ? t(`Комиссия не допустит к запуску: обязательных замечаний ${ev.blockers}.`, `The board will not clear the launch: ${ev.blockers} required findings.`)
                  : !devDone(design)
                    ? t('Перед запуском — разработка: несколько событий, которые изменят проект.', 'Before launch comes development: a few events that will change the design.')
                    : ev.checks.length > 0
                      ? t('Риски не запрещают полёт, но проявятся в космосе.', 'Risks do not stop the flight, but they will show up in space.')
                      : t('Замечаний нет. Проект готов к запуску.', 'No findings. The design is ready to fly.')}
              </p>
            </div>
          )}
        </div>
      </aside>

      <section ref={dockRef} className="dock glass" aria-labelledby="dock-title">
        <div className="dock-head">
          <div className="dock-title" title={t(LESSONS[section])}>
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
            {next && (
              <button type="button" className={section === 'brief' ? 'primary small' : 'secondary small'} onClick={() => go(next.id)}>
                {section === 'brief' ? t('Начать сборку', 'Start building') : t(`Дальше: ${next.name.ru}`, `Next: ${next.name.en}`)}
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
          {section === 'brief' && <Brief sc={sc} ev={ev} />}
          {rail && <PartRail group={rail} deltas={cardDeltas} disabled={!canEdit} showTitle={groups.length < 2} onPick={(id) => pick(rail, id)} onPreview={setHover} />}
          {group?.kind === 'years' && <Years design={design} sc={sc} title={group.title} hint={group.hint} disabled={!canEdit} onChange={(y) => patch({ lifeYears: y })} />}
        </div>

      </section>
    </div>
  );
}

function Brief({ sc, ev }: { sc: Scenario; ev: Evaluation }) {
  const t = useT();
  const weights = (Object.entries(sc.weights) as [Measure, number][]).sort((a, b) => b[1] - a[1]).slice(0, sc.sandbox ? 11 : 6);
  return (
    <div className="brief-panel">
      <div className="brief-main">
        <p className="brief-text">{t(sc.brief)}</p>
        <RealMissionHint scenarioId={sc.id} />
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
      </div>
      <div className="brief-needs">
        <h3>{t('Что нужно измерить', 'What has to be measured')}</h3>
        <ul className="needs">
          {weights.map(([m, w]) => {
            // Only whether something on board measures it — how well is found out in flight.
            const covered = (ev.science.quality[m] ?? 0) > 0;
            return (
              <li key={m} data-covered={covered || undefined}>
                <span className="needs-name">{t(MEASURES[m])}</span>
                <span className="needs-weight">
                  {t(`${Math.round(w * 100)}% задачи`, `${Math.round(w * 100)}% of goal`)} · {covered ? t('есть прибор', 'instrument on board') : t('нет прибора', 'no instrument')}
                </span>
                <span className="needs-bar" role="img" aria-label={t(`${Math.round(w * 100)}% задачи`, `${Math.round(w * 100)}% of goal`)}>
                  <i style={{ width: `${w * 100}%` }} />
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
function Coach({ checks, design, onGo }: { checks: Check[]; design: Design; onGo: (s: SectionId) => void }) {
  const t = useT();
  const cml = maturityOf(design, checks);
  const required = checks.filter((c) => c.level === 'blocker').sort((a, b) => FIRST.indexOf(a.id) - FIRST.indexOf(b.id));
  const risks = checks.length - required.length;
  const next = required[0];
  const where = next && WHERE[next.id] ? SECTIONS.find((s) => s.id === WHERE[next.id]) : undefined;
  return (
    <div className="coach glass" data-state={next ? 'todo' : risks ? 'risk' : 'ready'} role="status">
      <span className="eyebrow">
        {next ? t('Следующий шаг', 'Next step') : t('Допуск к запуску', 'Cleared for launch')}
        {next && required.length > 1 && (
          <span className="coach-count" aria-label={t(`всего осталось ${required.length}`, `${required.length} left in all`)}>
            {required.length}
          </span>
        )}
      </span>
      <b>
        {next
          ? t(next.title)
          : risks
            ? t(`Можно запускать. Принятых рисков: ${risks}`, `Ready to fly. Accepted risks: ${risks}`)
            : t('Проект готов к запуску', 'The design is ready to fly')}
      </b>
      <span className="coach-why">{next ? t(next.why) : t('Риски не запрещают полёт, но проявятся в космосе.', 'Risks do not stop the flight, but will show up in space.')}</span>
      {/* JPL's Concept Maturity Levels: how far the concept has got, the way mission teams say it. */}
      <span className="coach-cml" title={t(cml.meaning)}>
        <abbr title={t('Уровень зрелости концепта (JPL)', 'Concept Maturity Level (JPL)')}>CML {cml.level}</abbr>
        <span aria-hidden="true"> / 4 · </span>
        <span className="sr-only">{t(' из 4: ', ' of 4: ')}</span>
        {t(cml.name)}
      </span>
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

/**
 * The weakest link of the design, in one line, from what the gauges and cards already show:
 * the factor that would cut the science most. The science outcome itself is never shown before
 * the flight — finding it out is the point of flying.
 */
function weakestLink(ev: Evaluation, design: Design, sc: Scenario): { text: L; section: SectionId } | null {
  if (!design.orbit) return { text: { ru: 'Сначала выберите орбиту — от неё зависит всё остальное.', en: 'Choose an orbit first — everything else depends on it.' }, section: 'orbit' };
  if (design.instruments.length === 0) return { text: { ru: 'На борту нет приборов — измерять нечем.', en: 'No instruments on board — nothing to measure with.' }, section: 'payload' };
  const pct = (x: number) => Math.round(x * 100);
  const fit = ev.science.orbitFit;
  // 0.65 is the science quality a mission is expected to hold (TARGET_QUALITY in evaluate.ts).
  const quality = fit > 0 ? Math.min(1, ev.science.ratePerYear / (100 * fit) / 0.65) : 0;
  const power = ev.power.instLoad > 0 ? Math.min(1, Math.max(0, (ev.power.average - ev.power.busLoad) / ev.power.instLoad)) : 1;
  const data = ev.data.returnFraction;
  const years = Math.min(1, ev.time.effectiveYears / sc.targetYears);
  const blurry = ev.checks.some((c) => c.id === 'pointing_inst');
  const factors: { k: number; text: L; section: SectionId }[] = [
    {
      k: data,
      text: { ru: 'Канал связи не успевает передать всё, что снимают приборы.', en: 'The radio link cannot carry everything the instruments record.' },
      section: 'comms',
    },
    {
      k: power,
      text: { ru: 'Энергии не хватает, чтобы приборы работали всё время.', en: 'There is not enough power to run the instruments all the time.' },
      section: 'power',
    },
    {
      k: quality,
      text: blurry
        ? { ru: 'Аппарат дрожит — снимки смазаны. Нужна ориентация точнее.', en: 'The spacecraft wobbles and blurs the data. It needs finer pointing.' }
        : { ru: 'Приборы видят задачу хуже, чем нужно заказчику: класс выше или ещё один прибор.', en: 'The instruments see less than the customer needs: a higher class or one more instrument.' },
      section: blurry ? 'platform' : 'payload',
    },
    {
      k: fit,
      text: { ru: `Орбита подходит задаче на ${pct(fit)}%.`, en: `The orbit suits the goal at ${pct(fit)}%.` },
      section: 'orbit',
    },
    {
      k: years,
      text: { ru: `Аппарат проработает меньше, чем просит заказчик (${sc.targetYears} г.).`, en: `The spacecraft will not last the ${sc.targetYears} years asked for.` },
      section: years < 1 && ev.time.effectiveYears < ev.time.lifeYears ? 'platform' : 'plan',
    },
  ];
  const worst = factors.reduce((a, b) => (b.k < a.k ? b : a));
  return worst.k < 0.999 ? { text: worst.text, section: worst.section } : null;
}

export function Budgets({ ev, design, sc, onGo }: { ev: Evaluation; design: Design; sc: Scenario; onGo: (s: SectionId) => void }) {
  const t = useT();
  // While the board still has required findings, the coach already says what to do next.
  const weak = ev.blockers > 0 ? null : weakestLink(ev, design, sc);
  return (
    <div className="budgets">
      {weak && (
        <button type="button" className="weak-link" onClick={() => onGo(weak.section)}>
          <span className="weak-label">{t('Слабое место', 'Weakest link')}</span>
          <span className="weak-text">{t(weak.text)}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
      <Gauge
        label={t('Масса', 'Mass')}
        used={ev.mass.wet}
        limit={ev.mass.capacity}
        unit={t('кг', 'kg')}
        hint={t('с топливом / сколько довезёт ракета', 'fuelled / what the rocket can carry')}
        fix={ev.mass.capacity > 0 ? t('Ракета побольше или прибор полегче.', 'A bigger rocket or a lighter instrument.') : t('Выберите ракету — она задаёт предел.', 'Choose a rocket: it sets the limit.')}
      />
      <Gauge
        label={t('Энергия', 'Power')}
        used={ev.power.load}
        limit={ev.power.average}
        unit={t('Вт', 'W')}
        hint={t('потребление / средняя выработка', 'demand / average supply')}
        fix={t('Панели побольше или приборы поскромнее.', 'Bigger arrays or fewer power-hungry instruments.')}
      />
      <Gauge
        label={t('Данные', 'Data')}
        used={ev.data.generated}
        limit={ev.data.downlink}
        unit={t('ГБ/сут', 'GB/day')}
        digits={1}
        twoSided
        hint={t('создают приборы / пропускает связь', 'produced / carried by the link')}
        fix={t('Антенна мощнее или больше станций.', 'A stronger antenna or more stations.')}
      />
      <Gauge
        label={t('Бюджет', 'Budget')}
        used={ev.cost.total}
        limit={ev.cost.budget}
        unit={t('млн $', '$M')}
        hint={t('стоимость миссии / бюджет', 'mission cost / budget')}
        fix={t('Приборы классом ниже, ракета дешевле или миссия короче.', 'Cheaper instruments, a cheaper rocket or a shorter mission.')}
      />
      <Gauge
        label={t('Срок разработки', 'Development')}
        used={ev.time.devMonths}
        limit={ev.time.deadline}
        unit={t('мес.', 'mo')}
        hint={t('нужно на разработку / есть до запуска', 'needed to build / left until launch')}
        fix={t('Меньше приборов или испытания короче.', 'Fewer instruments or shorter testing.')}
      />
    </div>
  );
}

function Review({ checks, onGo }: { checks: Check[]; onGo: (s: SectionId) => void }) {
  const t = useT();
  const sorted = [...checks].sort((a, b) => (a.level === b.level ? 0 : a.level === 'blocker' ? -1 : 1));
  return (
    <details className="review">
      <summary className="panel-title">
        {t('Комиссия', 'Review board')}
        <span className="muted"> {sorted.length > 0 ? sorted.length : ''}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
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
    </details>
  );
}
