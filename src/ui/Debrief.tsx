import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { play } from '../audio/sfx';
import { DIFFICULTY, ORBITS, POWER, byId, pick } from '../engine/catalog';
import { evaluate } from '../engine/evaluate';
import { buildReport } from '../engine/report';
import { scenarioById } from '../engine/scenarios';
import { goalsFor, memberName, teamwork, ROLE_LIST } from '../engine/team';
import { useT } from '../i18n';
import { useDesign, useStore } from '../store';
import { ROLES, TopBar } from './common';
import { ScienceChart } from './ScienceChart';
import { BudgetProfile } from './TelemetryTrace';
import { Craft3D } from './Craft3D';
import { CRISIS_OPTIONS } from '../engine/simulate';
import { CRISIS_TITLE } from './CrisisCard';
import { RealMissionCompare } from './RealMission';

const still = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Counts from 0 to `to` once the number scrolls into view (instantly with reduced motion). */
function CountUp({ to, ms = 1400, format = (x: number) => String(Math.round(x)) }: { to: number; ms?: number; format?: (x: number) => string }) {
  const [value, setValue] = useState(() => (still() ? to : 0));
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (still()) {
      setValue(to);
      return;
    }
    let raf = 0;
    let started = false;
    const run = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / ms);
        // Ease out: fast at first, settling on the number.
        setValue(to * (1 - Math.pow(1 - k, 4)));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      if (!started && entries.some((e) => e.isIntersecting)) {
        started = true;
        run();
      }
    });
    if (el.current) io.observe(el.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, ms]);
  return (
    <span ref={el} aria-label={format(to)}>
      <span aria-hidden="true">{format(value)}</span>
    </span>
  );
}

/** A block that rises into place when it scrolls into view. */
function Reveal({
  children,
  className = '',
  as: Tag = 'section',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'li';
  delay?: number;
}) {
  const el = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(still);
  useEffect(() => {
    if (shown || !el.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el.current);
    return () => io.disconnect();
  }, [shown]);
  return (
    <Tag ref={el as never} className={`rv ${className}`} data-in={shown || undefined} style={{ ['--d' as string]: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/**
 * The mission report: a cinematic first screen with the grade and the headline numbers, then the
 * score, the reasons, the science curve, the real mission it compares with, and the way back in.
 */
export function Debrief() {
  const t = useT();
  const sim = useStore((s) => s.sim)!;
  const scenarioId = useStore((s) => s.scenarioId);
  const difficulty = useStore((s) => s.difficulty);
  const goto = useStore((s) => s.goto);
  const redesign = useStore((s) => s.redesign);
  const team = useStore((s) => s.team);
  const launch = useStore((s) => s.launch);
  const saveRecord = useStore((s) => s.saveRecord);
  const playerName = useStore((s) => s.playerName);
  const design = useDesign();
  const sc = scenarioById(scenarioId);
  const ev = useMemo(() => evaluate(design, sc, difficulty), [design, sc, difficulty]);
  const goals = useMemo(() => (team ? goalsFor(sc, ev) : []), [team, sc, ev]);
  const report = useMemo(
    () => buildReport(design, sc, difficulty, ev, sim, team ? teamwork(goals) : undefined),
    [design, sc, difficulty, ev, sim, team, goals],
  );
  const [name, setName] = useState(playerName);
  const [saved, setSaved] = useState(false);
  const factor = DIFFICULTY[difficulty].scoreFactor;

  const [line1, line2] = sim.launchFailed
    ? [t('Потерян', 'Lost'), t('при запуске', 'at launch')]
    : sim.outcome === 'success'
      ? [t('Миссия', 'Mission'), t('выполнена', 'accomplished')]
      : sim.outcome === 'partial'
        ? [t('Выполнена', 'Partly'), t('частично', 'accomplished')]
        : [t('Цель', 'Target'), t('не достигнута', 'missed')];

  const delivered = sim.dataGenerated > 0 ? sim.dataReturned / sim.dataGenerated : 0;
  const figures: { label: string; value: number; format: (x: number) => string; note: string }[] = [
    { label: t('Наука', 'Science'), value: sim.sciencePct * 100, format: (x) => `${Math.round(x)}%`, note: t('от цели заказчика', 'of the customer’s target') },
    { label: t('Работа', 'In operation'), value: sim.monthsOperated, format: (x) => `${Math.round(x)}`, note: t(`из ${sim.plannedMonths} мес.`, `of ${sim.plannedMonths} months`) },
    { label: t('Стоимость', 'Cost'), value: ev.cost.total, format: (x) => t.money(x), note: t(`из ${t.money(ev.cost.budget)}`, `of ${t.money(ev.cost.budget)}`) },
    { label: t('Данные', 'Data'), value: delivered * 100, format: (x) => `${Math.round(x)}%`, note: t('дошли до Земли', 'reached Earth') },
  ];
  const pad2 = (i: number) => String(i + 1).padStart(2, '0');
  let no = 0;
  const next = () => pad2(no++);

  return (
    <div className="report" data-outcome={sim.launchFailed ? 'failure' : sim.outcome} data-body={sc.body}>
      <div className="report-bar">
        <TopBar
          left={
            <>
              <button type="button" className="link" onClick={() => goto('home')}>
                {t('Все миссии', 'All missions')}
              </button>
              <span className="crumb">
                {t(sc.name)}, {t(DIFFICULTY[difficulty].name).toLowerCase()}
              </span>
            </>
          }
        />
      </div>

      {/* ---- the verdict ---- */}
      <header className="report-hero">
        <div className="report-sky" aria-hidden="true">
          <span className="report-planet" />
          <span className="report-glow" />
        </div>
        <p className="report-eyebrow">
          <span>{t('Отчёт о миссии', 'Mission report')}</span>
          <span>{t(sc.name)}</span>
          <span>{t(DIFFICULTY[difficulty].name)}</span>
        </p>
        <h1 className="report-title">
          <span className="report-line">
            <span>{line1}</span>
          </span>
          <span className="report-line">
            <span>{line2}</span>
          </span>
        </h1>
        <div className="report-grade" data-grade={report.grade} role="img" aria-label={t(`Оценка ${report.grade}, ${report.total} очков из 1000`, `Grade ${report.grade}, ${report.total} of 1000 points`)}>
          <span className="report-letter" aria-hidden="true">
            {report.grade}
          </span>
          <span className="report-points" aria-hidden="true">
            <CountUp to={report.total} ms={1600} />
            <small>/ 1000</small>
          </span>
        </div>
        <dl className="report-figures">
          {figures.map((f, i) => (
            <div key={f.label} style={{ ['--d' as string]: `${500 + i * 90}ms` }}>
              <dt>{f.label}</dt>
              <dd>
                <CountUp to={f.value} format={f.format} />
              </dd>
              <span>{f.note}</span>
            </div>
          ))}
        </dl>
        <div className="report-actions report-hero-actions">
          <button type="button" className="primary" onClick={redesign}>
            {t('Доработать проект', 'Improve the design')}
          </button>
          <button type="button" className="secondary" onClick={launch}>
            {t('Запустить ещё раз', 'Fly it again')}
          </button>
        </div>
        <span className="report-scroll" aria-hidden="true">
          {t('Разбор', 'Debrief')}
          <i />
        </span>
      </header>

      <main className="report-body">
        {/* ---- the score ---- */}
        <Reveal className="report-section">
          <div className="report-head">
            <span className="report-no">{next()}</span>
            <h2>{t('Из чего сложился счёт', 'How the score adds up')}</h2>
          </div>
          <ol className="report-lines">
            {report.lines.map((l, i) => (
              <Reveal as="li" key={l.id} delay={i * 70}>
                <span className="report-line-name">{t(l.label)}</span>
                <span className="report-line-bar">
                  <i style={{ ['--w' as string]: `${(l.points / l.max) * 100}%` }} />
                </span>
                <span className="report-line-num">
                  {l.points}
                  <small>/{l.max}</small>
                </span>
              </Reveal>
            ))}
          </ol>
          <p className="report-total">
            {factor !== 1 && <span>{t(`× ${t.n(factor, 2)} за сложность`, `× ${t.n(factor, 2)} for difficulty`)}</span>}
            <b>
              {report.total} <small>{t('очков', 'points')}</small>
            </b>
          </p>
        </Reveal>

        {/* ---- why ---- */}
        <Reveal className="report-section">
          <div className="report-head">
            <span className="report-no">{next()}</span>
            <h2>{t('Почему так вышло', 'Why it went this way')}</h2>
          </div>
          <ol className="report-insights">
            {report.insights.map((x, i) => (
              <Reveal as="li" key={i} delay={i * 60} className="report-insight">
                <span className="report-insight-no" data-kind={x.kind}>
                  {pad2(i)}
                </span>
                <div>
                  <h3>{t(x.title)}</h3>
                  <p>{t(x.text)}</p>
                </div>
              </Reveal>

            ))}
          </ol>
        </Reveal>

        {/* ---- decisions in flight ---- */}
        {sim.crises.length > 0 && (
          <Reveal className="report-section">
            <div className="report-head">
              <span className="report-no">{next()}</span>
              <h2>{t('Решения в полёте', 'Decisions in flight')}</h2>
            </div>
            <ul className="decisions">
              {sim.crises.map((c) => {
                // What came of it: the log entry the decision wrote that month.
                const outcome = sim.events.find((e) => e.month === c.month && e.title.en.startsWith('Decision'));
                const bold = CRISIS_OPTIONS[c.kind].indexOf(c.chosen) > 0;
                return (
                  <li key={c.id} data-tone={bold ? 'bold' : 'safe'}>
                    <b>
                      {t(CRISIS_TITLE(c))}, {t(`месяц ${c.month}`, `month ${c.month}`)}
                      {c.defaulted && <span className="muted"> · {t('решено по умолчанию', 'default taken')}</span>}
                    </b>
                    {outcome && (
                      <span>
                        {t(outcome.title)}. {t(outcome.text)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Reveal>
        )}

        {/* ---- science over time ---- */}
        {!sim.launchFailed && (
          <Reveal className="report-section report-chart">
            <div className="report-head">
              <span className="report-no">{next()}</span>
              <h2>{t('Наука по месяцам', 'Science month by month')}</h2>
            </div>
            <ScienceChart months={sim.months} />
          </Reveal>
        )}

        {/* ---- power and data budgets, as the spacecraft lived them ---- */}
        {!sim.launchFailed && design.orbit && (
          <Reveal className="report-section report-chart">
            <div className="report-head">
              <span className="report-no">{next()}</span>
              <h2>{t('Энергия и данные на орбите', 'Power and data in orbit')}</h2>
            </div>
            <BudgetProfile
              sunFraction={pick(POWER, design.power).solar ? (byId(ORBITS, design.orbit)?.sunFraction ?? 1) : 1}
              eclipseLoad={ev.power.batteryWh > 0 ? ev.power.eclipseNeedWh / ev.power.batteryWh : 0}
              contactFraction={ev.data.contactHours / 24}
              storageLoad={ev.data.storage > 0 ? ev.data.storageNeed / ev.data.storage : 9}
              showData={ev.data.generated > 0}
            />
          </Reveal>
        )}

        {/* ---- the real mission ---- */}
        <Reveal className="report-section report-real">
          <span className="report-no report-real-no" aria-hidden="true">
            {next()}
          </span>
          <RealMissionCompare scenarioId={scenarioId} design={design} ev={ev} />
        </Reveal>

        {team?.state && (
          <Reveal className="report-section">
            <div className="report-head">
              <span className="report-no">{next()}</span>
              <h2>{t('Цели ролей', 'Role goals')}</h2>
            </div>
            <ul className="goals report-goals">
              {ROLE_LIST.map((r) => (
                <li key={r} data-role={r}>
                  <b>
                    {t(ROLES[r].name)}
                    <span className="muted"> {memberName(team.state!, team.state!.owners[r])}</span>
                  </b>
                  <ul>
                    {goals
                      .filter((g) => g.role === r)
                      .map((g) => (
                        <li key={g.id} data-met={g.met}>
                          <span className="goal-mark" aria-hidden="true">
                            {g.met ? '✓' : '✗'}
                          </span>
                          <span>
                            <span className="sr-only">{g.met ? t('Выполнено: ', 'Done: ') : t('Не выполнено: ', 'Not done: ')}</span>
                            {t(g.label)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Reveal>
        )}

        {/* ---- the craft and the record ---- */}
        <Reveal className="report-section report-final">
          <div className="report-craft">
            <Craft3D design={design} ev={ev} />
          </div>
          <div className="report-save">
            <h2>{saved ? t('Сохранено', 'Saved') : t('В таблицу рекордов', 'Into the records')}</h2>
            {saved ? (
              <p className="muted">{t('Результат и проект — на главной странице.', 'The result and the design are on the home page.')}</p>
            ) : (
              <form
                className="save"
                onSubmit={(e) => {
                  e.preventDefault();
                  play('select');
                  saveRecord({
                    name: name.trim() || t('Без названия', 'Unnamed'),
                    scenarioId,
                    difficulty,
                    score: report.total,
                    grade: report.grade,
                    outcome: sim.outcome,
                    design,
                    team: !!team,
                  });
                  setSaved(true);
                }}
              >
                <label htmlFor="team">{t('Название команды', 'Team name')}</label>
                <div className="save-row">
                  <input id="team" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder={t('например, «Орбита-7»', 'e.g. Orbit Seven')} />
                  <button type="submit" className="secondary">
                    {t('Сохранить', 'Save')}
                  </button>
                </div>
              </form>
            )}
            <div className="report-again">
              <p>{t('Ещё одна попытка? Другая орбита, другие приборы — другой результат.', 'One more go? Another orbit, other instruments — another outcome.')}</p>
              <div className="report-actions">
                <button type="button" className="primary" onClick={redesign}>
                  {t('Доработать проект', 'Improve the design')}
                </button>
                <button type="button" className="ghost" onClick={() => goto('home')}>
                  {t('Другая миссия', 'Another mission')}
                </button>
              </div>
            </div>
          </div>
        </Reveal>
      </main>
    </div>
  );
}
