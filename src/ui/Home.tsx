import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { DIFFICULTY, MEASURES } from '../engine/catalog';
import { SCENARIOS, scenarioById } from '../engine/scenarios';
import type { Difficulty, Measure, Role, Scenario } from '../engine/types';
import { useT } from '../i18n';
import { useStore } from '../store';
import { LangToggle, ROLES, Stars } from './common';
import { AccountButton } from './Account';
import { HeroScene } from './HeroScene';
import { RealMissionHint } from './RealMission';
import { TeamEntry } from './Team';

const DESTINATION = {
  earth: { ru: 'Орбита Земли', en: 'Earth orbit' },
  moon: { ru: 'Луна', en: 'The Moon' },
  mars: { ru: 'Марс', en: 'Mars' },
  sun: { ru: 'Точка L1', en: 'L1 point' },
};
const PLANET = { earth: 'planet_earth', moon: 'planet_moon', mars: 'planet_mars', sun: 'planet_sun' } as const;
const art = (sc: Scenario) => `${import.meta.env.BASE_URL}thumbs/${sc.sandbox ? 'orbit_geo' : PLANET[sc.body]}.webp`;

type Sheet = 'how' | 'team' | 'records';
const TABS: { id: Sheet; name: { ru: string; en: string }; lede: { ru: string; en: string } }[] = [
  {
    id: 'how',
    name: { ru: 'Как играть', en: 'How to play' },
    lede: { ru: 'Три комнаты одной миссии и четыре роли, которые за неё отвечают.', en: 'Three rooms of one mission, and the four roles that answer for it.' },
  },
  {
    id: 'team',
    name: { ru: 'Командная игра', en: 'Team play' },
    lede: { ru: 'До трёх человек, каждый на своём устройстве, проектируют одну миссию.', en: 'Up to three people, each on their own device, design one mission.' },
  },
  {
    id: 'records',
    name: { ru: 'Рекорды', en: 'Records' },
    lede: { ru: 'Лучшие миссии на этом устройстве. Любую можно открыть и доработать.', en: 'The best missions on this device. Open any of them and improve it.' },
  },
];

function MenuIcon({ id }: { id: Sheet }) {
  return (
    <svg className="mc-icon" viewBox="0 0 24 24" aria-hidden="true">
      {id === 'how' && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4M12 16.6v.2" />
        </>
      )}
      {id === 'team' && (
        <>
          <circle cx="9" cy="9" r="3" />
          <circle cx="17" cy="10" r="2.4" />
          <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M14.6 15c2.6-.4 4.9.9 5.6 3.8" />
        </>
      )}
      {id === 'records' && (
        <>
          <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
          <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7" />
        </>
      )}
    </svg>
  );
}

/**
 * Mission control on one screen: the headline and the missions on the left, the chosen
 * mission's brief, difficulty and the way into the hangar on the right, the rocket between.
 * Everything else (how a game goes, team play, records) opens in a side sheet from the menu.
 */
export function Home() {
  const t = useT();
  const difficulty = useStore((s) => s.difficulty);
  const setDifficulty = useStore((s) => s.setDifficulty);
  const open = useStore((s) => s.open);
  const designs = useStore((s) => s.designs);
  const records = useStore((s) => s.records);
  const lastId = useStore((s) => s.scenarioId);
  const [chosen, setChosen] = useState(lastId);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const sc = scenarioById(chosen);
  const D = DIFFICULTY[difficulty];
  const draft = designs[sc.id];
  const started = !!draft && (!!draft.orbit || draft.instruments.length > 0);
  const weights = (Object.entries(sc.weights) as [Measure, number][]).sort((a, b) => b[1] - a[1]).slice(0, sc.sandbox ? 0 : 4);

  // ↑/↓ walk the mission list like a radio group.
  const onListKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = SCENARIOS.findIndex((s) => s.id === chosen);
    const next = SCENARIOS[(i + (e.key === 'ArrowDown' ? 1 : SCENARIOS.length - 1)) % SCENARIOS.length];
    setChosen(next.id);
    (document.querySelector(`[data-mission="${next.id}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div className="home mc">
      <HeroScene />
      <div className="mc-shade" aria-hidden="true" />

      <header className="home-nav mc-nav">
        <span className="brand">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="17" r="6" />
            <ellipse cx="16" cy="17" rx="12" ry="4.2" transform="rotate(-28 16 17)" />
          </svg>
          Mission Forge
        </span>
        <nav className="mc-menu" aria-label={t('Меню', 'Menu')}>
          {TABS.map((tab) => (
            <button key={tab.id} type="button" aria-expanded={sheet === tab.id} onClick={() => setSheet(tab.id)}>
              <MenuIcon id={tab.id} />
              {t(tab.name)}
              {tab.id === 'records' && records.length > 0 && <span className="mc-count">{records.length}</span>}
            </button>
          ))}
        </nav>
        <div className="mc-tools">
          <AccountButton />
          <LangToggle />
        </div>
      </header>

      <main className="mc-grid">
        <section className="mc-intro" aria-labelledby="mc-title">
          <span className="eyebrow mc-step" style={{ ['--i' as string]: 0 }}>
            {t('Симулятор космической миссии', 'Space mission simulator')}
          </span>
          <h1 id="mc-title" className="mc-step" style={{ ['--i' as string]: 1 }}>
            {t('Соберите аппарат.', 'Build the spacecraft.')}
            <br />
            {t('Запустите его.', 'Launch it.')}
            <br />
            <em>{t('Узнайте, почему он долетел.', 'Find out why it made it.')}</em>
          </h1>
          <p className="lede mc-step" style={{ ['--i' as string]: 2 }}>
            {t('Каждый килограмм, ватт и доллар на счету — а потом настоящая физика решает, долетит ли он.', 'Every kilogram, watt and dollar counts — then real physics decides whether it gets there.')}
          </p>

          <div className="mc-list-head mc-step" style={{ ['--i' as string]: 3 }}>
            <span className="eyebrow">{t('Выберите миссию', 'Choose a mission')}</span>
            <span className="mc-hint">{t('↑ ↓ — переключить', '↑ ↓ to switch')}</span>
          </div>
          <div className="mc-missions mc-step" style={{ ['--i' as string]: 4 }} role="radiogroup" aria-label={t('Миссии', 'Missions')} onKeyDown={onListKey}>
            {SCENARIOS.map((s, i) => {
              const best = records.filter((r) => r.scenarioId === s.id)[0];
              const begun = !!designs[s.id]?.orbit || (designs[s.id]?.instruments.length ?? 0) > 0;
              const on = chosen === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  className="mc-mission"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  data-mission={s.id}
                  onClick={() => setChosen(s.id)}
                  onDoubleClick={() => open(s.id)}
                >
                  <span className="mc-no">{String(i + 1).padStart(2, '0')}</span>
                  <img src={art(s)} alt="" decoding="async" />
                  <span className="mc-mission-text">
                    <span className="mc-mission-name">{t(s.name)}</span>
                    <span className="mc-mission-where">{s.sandbox ? t('Свободный режим', 'Free play') : t(DESTINATION[s.body])}</span>
                  </span>
                  <span className="mc-mission-meta">
                    {best ? <span className="gold">{best.score}</span> : begun ? <span className="mc-draft">{t('черновик', 'draft')}</span> : null}
                    <Stars n={s.stars} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="mc-panel" aria-live="polite" aria-label={t('Выбранная миссия', 'Chosen mission')}>
          <div className="mc-panel-body" key={sc.id}>
            <span className="eyebrow">{sc.sandbox ? t('Свободный режим', 'Free play') : t(DESTINATION[sc.body])}</span>
            <h2>{t(sc.name)}</h2>
            <p className="mc-brief">{t(sc.brief)}</p>
            <dl className="mc-terms">
              <div>
                <dt>{t('Бюджет', 'Budget')}</dt>
                <dd>{sc.sandbox ? '∞' : t.money(Math.round(sc.budget * D.budget))}</dd>
              </div>
              <div>
                <dt>{t('До запуска', 'To launch')}</dt>
                <dd>{sc.sandbox ? '—' : t(`${sc.deadlineMonths} мес.`, `${sc.deadlineMonths} mo`)}</dd>
              </div>
              <div>
                <dt>{t('На орбите', 'In orbit')}</dt>
                <dd>{t(`${sc.targetYears} г.`, `${sc.targetYears} yr`)}</dd>
              </div>
            </dl>
            {weights.length > 0 && (
              <ul className="mc-measures" aria-label={t('Что измерить', 'What to measure')}>
                {weights.map(([m, w]) => (
                  <li key={m}>
                    <span>{t(MEASURES[m])}</span>
                    <b>{Math.round(w * 100)}%</b>
                  </li>
                ))}
              </ul>
            )}
            <RealMissionHint scenarioId={sc.id} />
          </div>

          <div className="mc-difficulty">
            <span className="eyebrow">{t('Сложность', 'Difficulty')}</span>
            <div className="mc-ranks" role="radiogroup" aria-label={t('Уровень сложности', 'Difficulty')}>
              {(Object.keys(DIFFICULTY) as Difficulty[]).map((d, i) => (
                <button key={d} type="button" role="radio" aria-checked={difficulty === d} onClick={() => setDifficulty(d)}>
                  <Insignia n={i + 1} />
                  {t(DIFFICULTY[d].name)}
                </button>
              ))}
            </div>
            <p className="mc-rank-desc">
              {t(D.desc)}{' '}
              <span>
                {t('Бюджет', 'Budget')} ×{t.n(D.budget, 2)} · {t('очки', 'score')} ×{t.n(D.scoreFactor, 2)}
              </span>
            </p>
          </div>

          <button type="button" className="primary big mc-cta" onClick={() => open(sc.id)}>
            <span>{started ? t('Продолжить в ангаре', 'Continue in the hangar') : t('В ангар', 'To the hangar')}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </aside>
      </main>

      <p className="mc-foot">
        {t(
          'Числа упрощены, но пропорции настоящие: формула Циолковского, энергобаланс, канал связи и выведение считаются по-честному.',
          'Numbers are simplified, proportions are real: the rocket equation, power, the radio link and the climb to orbit are computed honestly.',
        )}
      </p>

      {sheet && (
        <MenuPanel tab={sheet} onTab={setSheet} onClose={() => setSheet(null)}>
          {sheet === 'how' && <HowToPlay />}
          {sheet === 'team' && <TeamEntry />}
          {sheet === 'records' && <Records onOpen={() => setSheet(null)} />}
        </MenuPanel>
      )}
    </div>
  );
}

/**
 * The menu: one floating panel over the scene with its sections as tabs, so moving between
 * them never closes it. Esc or a click on the dimmed scene closes it; ←/→ switch tabs.
 */
function MenuPanel({ tab, onTab, onClose, children }: { tab: Sheet; onTab: (t: Sheet) => void; onClose: () => void; children: ReactNode }) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      before?.focus();
    };
  }, [onClose]);
  const current = TABS.find((x) => x.id === tab)!;
  const onTabKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = TABS.findIndex((x) => x.id === tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    onTab(next.id);
    (document.getElementById(`mc-tab-${next.id}`) as HTMLElement | null)?.focus();
  };
  return (
    <div className="mc-sheet-wrap">
      <button type="button" className="mc-backdrop" aria-label={t('Закрыть меню', 'Close the menu')} onClick={onClose} />
      <div className="mc-sheet" role="dialog" aria-modal="true" aria-labelledby={`mc-tab-${tab}`} tabIndex={-1} ref={panel}>
        <div className="mc-sheet-head">
          <div className="mc-tabs" role="tablist" aria-label={t('Разделы', 'Sections')} onKeyDown={onTabKey}>
            {TABS.map((x) => (
              <button
                key={x.id}
                id={`mc-tab-${x.id}`}
                type="button"
                role="tab"
                aria-selected={x.id === tab}
                aria-controls="mc-tab-panel"
                tabIndex={x.id === tab ? 0 : -1}
                onClick={() => onTab(x.id)}
              >
                <MenuIcon id={x.id} />
                {t(x.name)}
              </button>
            ))}
          </div>
          <button type="button" className="mc-close" aria-label={t('Закрыть', 'Close')} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="mc-sheet-body" id="mc-tab-panel" role="tabpanel" aria-labelledby={`mc-tab-${tab}`} key={tab}>
          <h2 className="mc-sheet-title">{t(current.name)}</h2>
          <p className="mc-sheet-lede">{t(current.lede)}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function HowToPlay() {
  const t = useT();
  const steps: [string, string, string][] = [
    [
      t('Ангар', 'Hangar'),
      t('Выберите орбиту, ракету, приборы, энергию и связь. Каждая деталь сразу встаёт на аппарат и показывает, чем вы за неё платите: массой, ваттами, деньгами и временем.', 'Pick the orbit, rocket, instruments, power and radio. Every part snaps onto the spacecraft and shows what it costs you: mass, watts, money and time.'),
      'power_medium',
    ],
    [
      t('Старт', 'Launch'),
      t('Комиссия даёт допуск, команда — «готов». Отсчёт, отрыв, разделение ступеней: выведение считается по секундам — тяга, гравитация, воздух.', 'The review board clears you, the team calls go. Countdown, lift-off, staging: the climb is computed second by second — thrust, gravity, air.'),
      'atlant',
    ],
    [
      t('Орбита и разбор', 'Orbit and debrief'),
      t('Тень и батарея, сеансы связи, бури и отказы. В конце — почему вышло именно так, на ваших числах, и сравнение с настоящей миссией NASA.', 'Eclipses and batteries, ground passes, storms and failures. Then why it went this way, in your own numbers, beside a real NASA mission.'),
      'orbit_sso',
    ],
  ];
  return (
    <>
      <ol className="mc-how">
        {steps.map(([title, text, img], i) => (
          <li key={img}>
            <img src={`${import.meta.env.BASE_URL}thumbs/${img}.webp`} alt="" loading="lazy" />
            <div>
              <span className="mc-no">{String(i + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <h3 className="mc-sub">{t('Четыре роли', 'Four roles')}</h3>
      <ul className="mc-roles">
        {(Object.keys(ROLES) as Role[]).map((r) => (
          <li key={r} data-role={r}>
            <b>{t(ROLES[r].name)}</b>
            <span>{t(ROLES[r].duty)}</span>
          </li>
        ))}
      </ul>
      <h3 className="mc-sub">{t('Управление', 'Controls')}</h3>
      <dl className="mc-keys">
        <div>
          <dt>
            <kbd>↑</kbd> <kbd>↓</kbd>
          </dt>
          <dd>{t('выбрать миссию на главной', 'pick a mission on the home screen')}</dd>
        </div>
        <div>
          <dt>
            <kbd>←</kbd> <kbd>→</kbd>
          </dt>
          <dd>{t('листать детали в ангаре', 'browse parts in the hangar')}</dd>
        </div>
        <div>
          <dt>
            <kbd>Esc</kbd>
          </dt>
          <dd>{t('закрыть меню и окна', 'close the menu and panels')}</dd>
        </div>
        <div>
          <dt>{t('Мышь', 'Mouse')}</dt>
          <dd>{t('тянуть — повернуть аппарат, колесо — приблизить', 'drag to turn the spacecraft, scroll to zoom')}</dd>
        </div>
      </dl>
    </>
  );
}

function Records({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  const records = useStore((s) => s.records);
  const loadShared = useStore((s) => s.loadShared);
  if (records.length === 0)
    return (
      <div className="mc-empty">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="26" r="9" />
          <ellipse cx="24" cy="26" rx="20" ry="7" transform="rotate(-24 24 26)" />
        </svg>
        <b>{t('Пока ни одного полёта', 'No flights yet')}</b>
        <p>{t('Завершите миссию и сохраните результат на экране разбора — он появится здесь.', 'Finish a mission and save the result on the debrief screen to see it here.')}</p>
        <button type="button" className="secondary" onClick={onOpen}>
          {t('Выбрать миссию', 'Choose a mission')}
        </button>
      </div>
    );
  return (
    <table className="board mc-board">
      <thead>
        <tr>
          <th className="num">#</th>
          <th>{t('Команда', 'Team')}</th>
          <th>{t('Миссия', 'Mission')}</th>
          <th className="num">{t('Счёт', 'Score')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {records.slice(0, 12).map((r, i) => (
          <tr key={r.id}>
            <td className="num mc-rank">{i + 1}</td>
            <td>{r.name}</td>
            <td>
              {t(scenarioById(r.scenarioId).name)}
              <span className="muted"> · {t(DIFFICULTY[r.difficulty].name)}</span>
            </td>
            <td className="num">
              <b>{r.score}</b> <span className={`grade grade-${r.grade}`}>{r.grade}</span>
            </td>
            <td className="num">
              <button
                type="button"
                className="link"
                onClick={() => {
                  onOpen();
                  loadShared(r.scenarioId, r.difficulty, r.design);
                }}
              >
                {t('Открыть', 'Open')}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Rank insignia: one, two or three chevrons. */
function Insignia({ n }: { n: number }) {
  return (
    <svg className="insignia" viewBox="0 0 40 40" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M8 ${12 + i * 8}l12 -7 12 7`} />
      ))}
    </svg>
  );
}
