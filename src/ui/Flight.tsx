import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { failureTime, sampleAt, simulateAscent, type AscentEventId } from '../engine/ascent';
import { ORBITS, POWER, VEHICLES, byId, pick } from '../engine/catalog';
import { evaluate } from '../engine/evaluate';
import { scenarioById } from '../engine/scenarios';
import { ROLE_LIST } from '../engine/team';
import type { Body, L } from '../engine/types';
import { COUNTDOWN, Director, type FlightPlan, type Speed } from '../flight/director';
import { ASCENT_NOTES, ASCENT_ORDER } from '../flight/notes';
import { useT } from '../i18n';
import { useDesign, useStore } from '../store';
import type { FlightStage, FlightView } from '../three/FlightStage';
import { LangToggle, ROLES } from './common';
import { FlightScene } from './FlightScene';
import { OrbitView } from './OrbitView';
import { ScienceChart } from './ScienceChart';

const SHADOW: Record<Body, L> = {
  earth: { ru: 'в тени Земли', en: 'in Earth’s shadow' },
  moon: { ru: 'в тени Луны', en: 'in the Moon’s shadow' },
  mars: { ru: 'в тени Марса', en: 'in Mars’s shadow' },
  sun: { ru: 'в тени', en: 'in shadow' },
};

const clock = (met: number) => {
  const s = Math.abs(Math.round(met));
  return `T${met < 0 ? '−' : '+'}${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function Flight() {
  const t = useT();
  const sim = useStore((s) => s.sim)!;
  const goto = useStore((s) => s.goto);
  const difficulty = useStore((s) => s.difficulty);
  const inTeam = useStore((s) => !!s.team);
  const sc = scenarioById(useStore((s) => s.scenarioId));
  const design = useDesign();
  const ev = useMemo(() => evaluate(design, sc, difficulty), [design, sc, difficulty]);
  const orbit = byId(ORBITS, design.orbit)!;
  const vehicle = byId(VEHICLES, design.vehicle) ?? VEHICLES[0];
  const transitTotal = useMemo(() => sim.months.filter((m) => m.phase === 'transit').length, [sim]);

  // The launch is flown for real: the heavier the spacecraft for its rocket, the less propellant is left over.
  const plan = useMemo<FlightPlan>(
    () => ({
      ascent: simulateAscent(vehicle.id, ev.mass.wet / orbit.capFactor, sim.launchFailed ? failureTime(sim.seed) : null),
      launchFailed: sim.launchFailed,
      transitMonths: transitTotal,
      insertion: orbit.insertionDv > 0,
      totalMonths: sim.months.length,
    }),
    [sim, vehicle.id, ev.mass.wet, orbit, transitTotal],
  );
  const director = useMemo(() => new Director(plan), [plan]);
  const view = useMemo<FlightView>(
    () => ({
      design,
      dryKg: ev.mass.dry,
      orbit: orbit.id,
      vehicleId: vehicle.id,
      sunFraction: orbit.sunFraction,
      solar: pick(POWER, design.power).solar,
      eclipseLoad: ev.power.batteryWh > 0 ? ev.power.eclipseNeedWh / ev.power.batteryWh : 0,
      contactFraction: ev.data.contactHours / 24,
      dataLoad: ev.data.downlink > 0 ? ev.data.generated / ev.data.downlink : 9,
      storageLoad: ev.data.storage > 0 ? ev.data.storageNeed / ev.data.storage : 9,
      hasData: ev.data.generated > 0,
    }),
    [design, ev, orbit, vehicle.id],
  );

  const stage = useRef<FlightStage | null>(null);
  const [has3d, setHas3d] = useState(false);
  const [mapView, setMapView] = useState(false);
  const [, bump] = useReducer((x: number) => x + 1, 0);

  // The director's clock. The scene and this panel both read it; ten times a second is plenty for numbers.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      director.update((now - last) / 1000);
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const off = director.subscribe(bump);
    const tick = setInterval(bump, 110);
    return () => {
      cancelAnimationFrame(raf);
      off();
      clearInterval(tick);
    };
  }, [director]);
  // A handle for automated tests and for poking at the flight from the console during development.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __flight?: unknown }).__flight = { director, stage };
  }, [director]);
  // In a team everyone watches the same launch, so the count starts by itself.
  useEffect(() => {
    if (!inTeam) return;
    const id = setTimeout(() => director.go(), 3500);
    return () => clearTimeout(id);
  }, [director, inTeam]);

  const phase = director.phase;
  const shown = director.months;
  const done = phase === 'done';
  const inSpace = phase === 'deploy' || phase === 'cruise' || phase === 'insertion' || phase === 'ops' || (done && !sim.launchFailed);
  const launching = phase === 'pad' || phase === 'countdown' || phase === 'ascent' || (done && sim.launchFailed);
  const rec = shown > 0 ? sim.months[shown - 1] : null;
  const now = rec?.t ?? 0;
  const opsMonth = rec?.phase === 'ops' ? now - transitTotal : 0;
  const lostNow = !!sim.lost && done && !sim.launchFailed;
  const science = rec?.science ?? 0;
  const events = sim.events.filter((e) => (e.month === 0 ? (sim.launchFailed ? done : inSpace) : e.month <= now && inSpace)).reverse();

  // Tell the scene what the numbers say: how busy the instruments are, and when something happens.
  const lastEvent = events[0];
  const eventKey = lastEvent ? `${lastEvent.month}:${events.length}` : '';
  useEffect(() => {
    if (lastEvent && lastEvent.month > 0) stage.current?.flash(lastEvent.kind);
  }, [eventKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!stage.current) return;
    stage.current.activity = rec?.phase === 'ops' ? rec.power * rec.data : 1;
    stage.current.lost = lostNow;
  });
  useEffect(() => {
    stage.current?.setMap(mapView);
  }, [mapView, has3d, phase]);

  const sample = sampleAt(plan.ascent, Math.max(0, director.met));
  const hud = stage.current?.hud;
  const alt = launching ? sample.alt / 1000 : hud?.alt;
  const speed = launching ? sample.speed : hud?.speed;

  const phaseLabel = sim.launchFailed && done
    ? t('Аппарат потерян при запуске', 'Spacecraft lost at launch')
    : lostNow
      ? t('Связь потеряна', 'Contact lost')
      : phase === 'pad'
        ? t('Ракета на стартовом столе', 'On the pad')
        : phase === 'countdown'
          ? t('Обратный отсчёт', 'Countdown')
          : phase === 'ascent'
            ? t('Выведение на орбиту', 'Climbing to orbit')
            : phase === 'deploy'
              ? t('Отделение и раскрытие панелей', 'Separation and deployment')
              : phase === 'cruise'
                ? t(`Перелёт, месяц ${Math.max(1, now)} из ${transitTotal}`, `Cruise, month ${Math.max(1, now)} of ${transitTotal}`)
                : phase === 'insertion'
                  ? t('Выход на рабочую орбиту', 'Orbit insertion burn')
                  : phase === 'ops'
                    ? t(`Работа на орбите, месяц ${Math.max(1, opsMonth)} из ${sim.plannedMonths}`, `In orbit, month ${Math.max(1, opsMonth)} of ${sim.plannedMonths}`)
                    : t('Миссия завершена', 'Mission complete');

  // What is happening right now, and why.
  const insertionKg = Math.round(ev.mass.propellant * (orbit.insertionDv / Math.max(1, ev.dv.total)));
  const caption: { title: string; note: string } | null =
    phase === 'pad'
      ? null
      : phase === 'countdown'
        ? {
            title: t('Обратный отсчёт', 'Countdown'),
            note: t(
              'Фермы обслуживания отходят, двигатели выходят на режим. Ракету держат замки, пока тяга не станет полной.',
              'The service arms swing away and the engines come up to power. Clamps hold the rocket until thrust is full.',
            ),
          }
        : launching && director.event?.id === 'fairing' && director.met > director.event.t + 30
          ? {
              title: t('Разгон до орбитальной скорости', 'Building up orbital speed'),
              note: t(
                `Сейчас ${t.n(sample.vh / 1000, 1)} км/с из 7,8. Высота почти не растёт: вся тяга уходит в скорость вдоль Земли.`,
                `Now at ${t.n(sample.vh / 1000, 1)} of 7.8 km/s. Altitude barely changes: all the thrust goes into speed along the ground.`,
              ),
            }
          : launching && director.event
            ? { title: t(ASCENT_NOTES[director.event.id].title), note: t(ASCENT_NOTES[director.event.id].note) }
          : phase === 'deploy'
            ? {
                title: t(ASCENT_NOTES.deploy.title),
                note:
                  orbit.capFactor < 1
                    ? t(
                        `Дальше аппарат уходит на орбиту «${orbit.name.ru}». Туда ракета довозит лишь ${Math.round(orbit.capFactor * 100)}% того, что поднимает на низкую орбиту: остальное — топливо на разгон.`,
                        `From here the spacecraft heads for ${orbit.name.en}. The rocket delivers only ${Math.round(orbit.capFactor * 100)}% of its low-orbit payload there: the rest is propellant for the push.`,
                      )
                    : t(ASCENT_NOTES.deploy.note),
              }
            : phase === 'cruise'
              ? {
                  title: t('Перелёт', 'Cruise'),
                  note: t(
                    `Двигатель молчит: аппарат летит по инерции ${transitTotal} мес. Науки пока нет, а команда управления и станции уже работают.`,
                    `The engine is silent: the spacecraft coasts for ${transitTotal} months. No science yet, but the operations team and the stations are already at work.`,
                  ),
                }
              : phase === 'insertion'
                ? {
                    title: t('Манёвр выхода на орбиту', 'Insertion burn'),
                    note: t(
                      `Двигатель меняет скорость на ${t.n(orbit.insertionDv)} м/с и сжигает около ${t.n(insertionKg)} кг топлива. Без этого манёвра аппарат пролетел бы мимо.`,
                      `The engine changes speed by ${t.n(orbit.insertionDv)} m/s, burning about ${t.n(insertionKg)} kg of propellant. Without this burn the spacecraft would fly straight past.`,
                    ),
                  }
                : null;

  const timeline = ([...ASCENT_ORDER, 'failure'] as AscentEventId[])
    .map((id) => plan.ascent.events.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => !!e);
  const fmtSpeed = (v: number) => (v >= 1000 ? `${t.n(v / 1000, 2)} ${t('км/с', 'km/s')}` : `${t.n(v)} ${t('м/с', 'm/s')}`);
  const fmtAlt = (km: number) =>
    km >= 100_000 ? `${t.n(km / 1e6, 2)} ${t('млн км', 'million km')}` : `${t.n(km, km < 10 ? 1 : 0)} ${t('км', 'km')}`;

  return (
    <div className="page flight">
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand">{t(sc.name)}</span>
          <span className="crumb" aria-live="polite">{phaseLabel}</span>
        </div>
        <div className="topbar-right">
          <LangToggle />
        </div>
      </header>

      <div className="flight-grid">
        <div className="scene">
          <FlightScene
            director={director}
            view={view}
            onStage={(s) => {
              stage.current = s;
              setHas3d(!!s);
            }}
            fallback={<OrbitView orbit={orbit.id} record={rec} transitTotal={transitTotal} lost={lostNow || sim.launchFailed} running={director.speed > 0 && !done} />}
          >
            <div className="hud-top">
              <span className="hud-clock">
                {phase === 'countdown' || phase === 'ascent' ? clock(director.met) : phase === 'pad' ? clock(-COUNTDOWN) : ''}
              </span>
              {phase === 'ascent' && director.warp > 1.5 && director.speed > 0 && (
                <span className="hud-tag">{t(`время ускорено ×${Math.round(director.warp * director.speed)}`, `time ×${Math.round(director.warp * director.speed)}`)}</span>
              )}
              {has3d && inSpace && phase !== 'deploy' && (
                <div className="segmented hud-cam" role="radiogroup" aria-label={t('Камера', 'Camera')}>
                  <button type="button" role="radio" aria-checked={!mapView} onClick={() => setMapView(false)}>
                    {t('Аппарат', 'Spacecraft')}
                  </button>
                  <button type="button" role="radio" aria-checked={mapView} onClick={() => setMapView(true)}>
                    {t('Орбита', 'Orbit')}
                  </button>
                </div>
              )}
            </div>
            {caption && (
              <div className="hud-caption" aria-live="polite">
                <b>{caption.title}</b>
                <span>{caption.note}</span>
              </div>
            )}
          </FlightScene>

          <dl className="readouts">
            <div>
              <dt>{phase === 'cruise' ? t('От Земли', 'From Earth') : orbit.id === 'l1' && !launching && phase !== 'deploy' ? t('От Земли', 'From Earth') : t('Высота', 'Altitude')}</dt>
              <dd>{alt === undefined ? '—' : fmtAlt(alt)}</dd>
            </div>
            <div>
              <dt>{t('Скорость', 'Speed')}</dt>
              <dd>{speed === undefined || phase === 'cruise' ? '—' : fmtSpeed(speed)}</dd>
            </div>
            {launching ? (
              <>
                <div>
                  <dt>{t('Перегрузка', 'Load')}</dt>
                  <dd>{t.n(director.met < 0 ? 1 : sample.g, 1)} g</dd>
                </div>
                <div className="readouts-fuel">
                  <dt>{t('Топливо ступеней', 'Stage propellant')}</dt>
                  <dd>
                    <Tank label="I" value={sample.fuel1} />
                    <Tank label="II" value={sample.fuel2} />
                  </dd>
                </div>
              </>
            ) : (
              <>
                <div data-state={hud?.asleep ? 'over' : hud?.eclipse ? 'tight' : 'ok'}>
                  <dt>{t('Батарея', 'Battery')}</dt>
                  <dd>
                    {hud && phase !== 'deploy' && phase !== 'cruise' ? (
                      <>
                        <Tank label="" value={hud.battery} />
                        <span className="readouts-note">
                          {hud.asleep ? t('разряжена — приборы спят', 'flat — instruments asleep') : hud.eclipse ? t(SHADOW[orbit.body]) : t('на свету, заряжается', 'in sunlight, charging')}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div data-state={hud?.overflow ? 'over' : 'ok'}>
                  <dt>{t('Память и связь', 'Storage and link')}</dt>
                  <dd>
                    {hud && view.hasData && phase !== 'deploy' && phase !== 'cruise' ? (
                      <>
                        <Tank label="" value={hud.buffer} />
                        <span className="readouts-note">
                          {hud.contact ? t('сеанс связи: данные уходят на Землю', 'in contact: data going down') : hud.overflow ? t('память полна — данные теряются', 'storage full — data is being lost') : t('копит данные до сеанса', 'storing data until the next pass')}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </>
            )}
          </dl>

          <div className="controls">
            {done ? (
              <button type="button" className="primary" onClick={() => goto('report')}>
                {t('Открыть разбор миссии', 'Open the mission debrief')}
              </button>
            ) : phase === 'pad' ? (
              <>
                <button type="button" className="primary" onClick={() => director.go()}>
                  {t('Начать обратный отсчёт', 'Start the countdown')}
                </button>
                <button type="button" className="secondary" onClick={() => director.skip()}>
                  {t('Сразу к итогам миссии', 'Straight to the outcome')}
                </button>
              </>
            ) : (
              <>
                <div className="segmented" role="radiogroup" aria-label={t('Скорость воспроизведения', 'Playback speed')}>
                  {([0, 1, 4] as Speed[]).map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={director.speed === s} onClick={() => director.setSpeed(s)}>
                      {s === 0 ? t('Пауза', 'Pause') : `×${s}`}
                    </button>
                  ))}
                </div>
                {launching && !sim.launchFailed && (
                  <button type="button" className="secondary" onClick={() => director.skipAscent()}>
                    {t('Пропустить выведение', 'Skip the climb')}
                  </button>
                )}
                <button type="button" className="secondary" onClick={() => director.skip()}>
                  {t('Перейти к концу миссии', 'Skip to the end')}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="telemetry">
          {phase === 'pad' && (
            <section>
              <h3>{t('Опрос готовности', 'Go/no-go poll')}</h3>
              <p className="muted">
                {t(
                  'Перед пуском руководитель опрашивает каждого. Замечания комиссии, с которыми вы решили лететь, никуда не делись — это принятые риски.',
                  'Before launch the director polls every desk. The findings you chose to fly with have not gone away — they are accepted risks.',
                )}
              </p>
              <ul className="poll">
                {ROLE_LIST.map((r) => {
                  const risks = ev.checks.filter((c) => c.role === r && c.level === 'warn');
                  return (
                    <li key={r} data-role={r} data-risk={risks.length > 0}>
                      <span className="poll-role">{t(ROLES[r].name)}</span>
                      <b>{risks.length ? t('Готов, с риском', 'Go, with a risk') : t('Готов', 'Go')}</b>
                      {risks.map((c) => (
                        <span key={c.id} className="poll-risk">
                          {t(c.title)}
                        </span>
                      ))}
                    </li>
                  );
                })}
              </ul>
              <dl className="facts">
                <div>
                  <dt>{t('Носитель', 'Launch vehicle')}</dt>
                  <dd>{t(vehicle.name)}</dd>
                </div>
                <div>
                  <dt>{t('Стартовая масса', 'Lift-off mass')}</dt>
                  <dd>{t.n(plan.ascent.liftoffKg / 1000)} {t('т', 't')}</dd>
                </div>
                <div>
                  <dt>{t('Тяга на старте', 'Lift-off thrust')}</dt>
                  <dd>{t.n(plan.ascent.thrustKn)} {t('кН', 'kN')}</dd>
                </div>
                <div>
                  <dt>{t('Аппарат с топливом', 'Fuelled spacecraft')}</dt>
                  <dd>{t.n(ev.mass.wet)} {t('кг', 'kg')}</dd>
                </div>
                <div>
                  <dt>{t('Надёжность носителя', 'Vehicle reliability')}</dt>
                  <dd>{t.pct(vehicle.reliability)}</dd>
                </div>
                <div>
                  <dt>{t('Расчётный остаток топлива', 'Predicted propellant left')}</dt>
                  <dd>{t.pct(plan.ascent.margin)}</dd>
                </div>
              </dl>
              <p className="muted">
                {t(
                  'Из всей стартовой массы на орбиту попадает несколько процентов: остальное — топливо и баки, которые нужны, чтобы разогнать эти проценты до 7,8 км/с.',
                  'Only a few percent of the lift-off mass reaches orbit: the rest is propellant and tanks, needed to bring those few percent up to 7.8 km/s.',
                )}
              </p>
            </section>
          )}

          {launching && phase !== 'pad' && (
            <section>
              <h3>{t('Циклограмма выведения', 'Launch timeline')}</h3>
              <ol className="timeline">
                {timeline.map((e) => {
                  const passed = director.met >= e.t && phase !== 'countdown';
                  const current = director.event?.id === e.id && passed;
                  return (
                    <li key={e.id} data-done={passed} data-kind={e.id === 'failure' ? 'bad' : undefined} aria-current={current ? 'step' : undefined}>
                      <span className="timeline-when">{clock(e.t)}</span>
                      <span>{t(ASCENT_NOTES[e.id].title)}</span>
                    </li>
                  );
                })}
              </ol>
              {caption && <p className="timeline-note">{caption.note}</p>}
            </section>
          )}

          {!launching && (
            <>
              <div className="readout">
                <span className="readout-label">{t('Наука, переданная на Землю', 'Science returned to Earth')}</span>
                <span className="readout-value">{t.pct(science)}</span>
                <span className="readout-note">{t('от цели заказчика', 'of the customer’s target')}</span>
              </div>
              <ScienceChart months={sim.months} upto={shown} />
              <div className="meters">
                <Meter label={t('Питание приборов', 'Instrument power')} value={rec?.phase === 'ops' ? rec.power : null} />
                <Meter label={t('Данные доходят до Земли', 'Data reaching Earth')} value={rec?.phase === 'ops' ? rec.data : null} />
              </div>
            </>
          )}

          {events.length > 0 && (
            <section>
              <h3>{t('Бортовой журнал', 'Mission log')}</h3>
              <ol className="log" aria-live="polite">
                {events.map((e, i) => (
                  <li key={`${e.month}-${events.length - i}`} data-kind={e.kind}>
                    <span className="log-when">{e.month === 0 ? t('Старт', 'Launch') : t(`Месяц ${e.month}`, `Month ${e.month}`)}</span>
                    <b>{t(e.title)}</b>
                    <span>{t(e.text)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Tank({ label, value }: { label: string; value: number }) {
  return (
    <span className="tank" role="img" aria-label={`${label} ${Math.round(value * 100)}%`}>
      {label && <span className="tank-label">{label}</span>}
      <span className="tank-track">
        <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      </span>
    </span>
  );
}

function Meter({ label, value }: { label: string; value: number | null }) {
  const t = useT();
  return (
    <div className="meter" data-state={value === null ? 'idle' : value >= 0.98 ? 'ok' : value >= 0.6 ? 'tight' : 'over'}>
      <div className="gauge-row">
        <span className="gauge-label">{label}</span>
        <span className="gauge-value">{value === null ? '—' : t.pct(value)}</span>
      </div>
      <div className="gauge-track">
        <div className="gauge-fill" style={{ width: `${(value ?? 0) * 100}%` }} />
      </div>
    </div>
  );
}
