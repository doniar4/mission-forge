import { useEffect, useRef, useState } from 'react';
import { DIFFICULTY, MEASURES } from '../engine/catalog';
import { SCENARIOS, scenarioById } from '../engine/scenarios';
import type { Difficulty, Measure, Role, Scenario } from '../engine/types';
import { useT } from '../i18n';
import { useStore } from '../store';
import { LangToggle, ROLES, Stars } from './common';
import { HeroScene } from './HeroScene';
import { TeamEntry } from './Team';

const DESTINATION = {
  earth: { ru: 'Орбита Земли', en: 'Earth orbit' },
  moon: { ru: 'Луна', en: 'The Moon' },
  mars: { ru: 'Марс', en: 'Mars' },
  sun: { ru: 'Точка L1', en: 'L1 point' },
};
const PLANET = { earth: 'planet_earth', moon: 'planet_moon', mars: 'planet_mars', sun: 'planet_sun' } as const;
const art = (sc: Scenario) => `${import.meta.env.BASE_URL}thumbs/${sc.sandbox ? 'orbit_geo' : PLANET[sc.body]}.webp`;
const smooth = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

export function Home() {
  const t = useT();
  const difficulty = useStore((s) => s.difficulty);
  const setDifficulty = useStore((s) => s.setDifficulty);
  const open = useStore((s) => s.open);
  const designs = useStore((s) => s.designs);
  const records = useStore((s) => s.records);
  const loadShared = useStore((s) => s.loadShared);
  const lastId = useStore((s) => s.scenarioId);
  const [chosen, setChosen] = useState(lastId);
  const sc = scenarioById(chosen);
  const draft = designs[lastId];
  const resume = !!draft && (!!draft.orbit || draft.instruments.length > 0);
  const track = useRef<HTMLDivElement>(null);
  const to = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: smooth(), block: 'start' });

  // Keep the chosen mission in view inside its carousel.
  useEffect(() => {
    const i = SCENARIOS.findIndex((s) => s.id === chosen);
    const el = track.current?.children[i] as HTMLElement | undefined;
    if (el && track.current) track.current.scrollTo({ left: el.offsetLeft - (track.current.clientWidth - el.clientWidth) / 2, behavior: smooth() });
  }, [chosen]);

  const weights = (Object.entries(sc.weights) as [Measure, number][]).sort((a, b) => b[1] - a[1]).slice(0, sc.sandbox ? 0 : 4);

  return (
    <div className="home">
      <section className="hero">
        <HeroScene />
        <div className="hero-shade" aria-hidden="true" />
        <header className="home-nav">
          <span className="brand">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <circle cx="16" cy="17" r="6" />
              <ellipse cx="16" cy="17" rx="12" ry="4.2" transform="rotate(-28 16 17)" />
            </svg>
            Mission Forge
          </span>
          <nav aria-label={t('Разделы', 'Sections')}>
            <button type="button" className="ghost" onClick={() => to('missions')}>
              {t('Миссии', 'Missions')}
            </button>
            <button type="button" className="ghost" onClick={() => to('team')}>
              {t('Команда', 'Team')}
            </button>
            <button type="button" className="ghost" onClick={() => to('records')}>
              {t('Рекорды', 'Records')}
            </button>
          </nav>
          <LangToggle />
        </header>

        <div className="hero-copy">
          <span className="eyebrow">{t('Симулятор космической миссии', 'Space mission simulator')}</span>
          <h1>
            {t('Соберите аппарат.', 'Build the spacecraft.')}
            <br />
            {t('Запустите его.', 'Launch it.')}
            <br />
            <em>{t('Узнайте, почему он долетел.', 'Find out why it made it.')}</em>
          </h1>
          <p className="lede">
            {t(
              'Орбита, приборы, энергия, связь, ракета — каждый килограмм, ватт и доллар на счету. Потом отсчёт, старт по настоящей физике и годы работы на орбите.',
              'Orbit, instruments, power, radio, rocket — every kilogram, watt and dollar counts. Then a countdown, a launch flown with real physics and years of work in orbit.',
            )}
          </p>
          <div className="actions">
            <button type="button" className="primary big" onClick={() => (resume ? open(lastId) : to('missions'))}>
              {resume ? t(`Продолжить «${scenarioById(lastId).name.ru}»`, `Continue ${scenarioById(lastId).name.en}`) : t('Выбрать миссию', 'Choose a mission')}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
            {resume && (
              <button type="button" className="secondary big" onClick={() => to('missions')}>
                {t('Все миссии', 'All missions')}
              </button>
            )}
          </div>
        </div>
        <button type="button" className="scroll-cue" onClick={() => to('missions')} aria-label={t('К миссиям', 'To the missions')}>
          <span />
        </button>
      </section>

      <section className="missions" id="missions" aria-labelledby="missions-title">
        <div className="section-head">
          <span className="eyebrow">{t('01 — Заявки', '01 — Requests')}</span>
          <h2 id="missions-title">{t('Выберите миссию', 'Choose a mission')}</h2>
          <p className="muted">{t('Пять заказчиков ждут аппарат. Каждая задача решается несколькими путями — и ни одним бесплатно.', 'Five customers are waiting for a spacecraft. Each task can be solved several ways — none of them free.')}</p>
        </div>

        <div className="mission-track" ref={track} role="radiogroup" aria-label={t('Миссии', 'Missions')}>
          {SCENARIOS.map((s, i) => {
            const best = records.filter((r) => r.scenarioId === s.id)[0];
            const started = !!designs[s.id]?.orbit || (designs[s.id]?.instruments.length ?? 0) > 0;
            return (
              <button
                key={s.id}
                type="button"
                className="mission"
                role="radio"
                aria-checked={chosen === s.id}
                data-body={s.sandbox ? 'sandbox' : s.body}
                onClick={() => setChosen(s.id)}
              >
                <span className="mission-no">{String(i + 1).padStart(2, '0')}</span>
                <img src={art(s)} alt="" loading="lazy" decoding="async" />
                <span className="mission-body">
                  <span className="eyebrow">{s.sandbox ? t('Свободный режим', 'Free play') : t(DESTINATION[s.body])}</span>
                  <span className="mission-name">{t(s.name)}</span>
                  <span className="mission-tag">{t(s.tagline)}</span>
                  <span className="mission-facts">
                    <Stars n={s.stars} />
                    {best ? <span className="gold">{t(`рекорд ${best.score}`, `best ${best.score}`)}</span> : started ? <span className="gold">{t('черновик', 'draft')}</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mission-detail glass" aria-live="polite">
          <div className="mission-brief">
            <span className="eyebrow">{t('Задание заказчика', 'The customer’s brief')}</span>
            <h3>{t(sc.name)}</h3>
            <p>{t(sc.brief)}</p>
            <dl className="terms">
              <div>
                <dt>{t('Бюджет', 'Budget')}</dt>
                <dd>{sc.sandbox ? '∞' : t.money(Math.round(sc.budget * DIFFICULTY[difficulty].budget))}</dd>
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
              <ul className="measure-chips" aria-label={t('Что измерить', 'What to measure')}>
                {weights.map(([m, w]) => (
                  <li key={m}>
                    {t(MEASURES[m])} <b>{Math.round(w * 100)}%</b>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mission-setup">
            <span className="eyebrow">{t('02 — Сложность', '02 — Difficulty')}</span>
            <div className="ranks" role="radiogroup" aria-label={t('Уровень сложности', 'Difficulty')}>
              {(Object.keys(DIFFICULTY) as Difficulty[]).map((d, i) => {
                const D = DIFFICULTY[d];
                return (
                  <button key={d} type="button" className="rank" role="radio" aria-checked={difficulty === d} onClick={() => setDifficulty(d)}>
                    <Insignia n={i + 1} />
                    <span className="rank-name">{t(D.name)}</span>
                    <span className="rank-desc">{t(D.desc)}</span>
                    <span className="rank-facts">
                      <span>
                        {t('бюджет', 'budget')} <b>×{t.n(D.budget, 2)}</b>
                      </span>
                      <span>
                        {t('очки', 'score')} <b>×{t.n(D.scoreFactor, 2)}</b>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="primary big launch-cta" onClick={() => open(sc.id)}>
              {t(`В ангар: «${sc.name.ru}»`, `To the hangar: ${sc.name.en}`)}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <section className="how" aria-labelledby="how-title">
        <div className="section-head">
          <span className="eyebrow">{t('Как идёт игра', 'How a game goes')}</span>
          <h2 id="how-title">{t('Три комнаты одной миссии', 'Three rooms of one mission')}</h2>
        </div>
        <ol className="steps">
          {[
            [
              t('Ангар', 'Hangar'),
              t('Аппарат висит над планетой назначения. Листайте детали — каждая сразу встаёт на место и показывает, чем вы за неё платите.', 'The spacecraft hangs above its destination. Slide through the parts — each one snaps into place and shows what it costs you.'),
              'power_medium',
            ],
            [
              t('Старт', 'Launch'),
              t('Отсчёт, отрыв, разделение ступеней, сброс обтекателя. Выведение считается по секундам: тяга, гравитация, воздух.', 'Countdown, lift-off, staging, fairing jettison. The climb is computed second by second: thrust, gravity, air.'),
              'atlant',
            ],
            [
              t('Орбита', 'Orbit'),
              t('Тень и батарея, сеансы связи, отказы и бури. В конце — разбор: почему вышло именно так, с вашими числами.', 'Eclipses and batteries, ground passes, failures and storms. Then the debrief: why it went this way, in your own numbers.'),
              'orbit_sso',
            ],
          ].map(([title, text, img], i) => (
            <li key={img}>
              <img src={`${import.meta.env.BASE_URL}thumbs/${img}.webp`} alt="" loading="lazy" />
              <span className="step-index">{String(i + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <TeamEntry />

      <div className="home-grid" id="records">
        <section className="block">
          <h2>{t('Лучшие миссии', 'Best missions')}</h2>
          {records.length === 0 ? (
            <p className="muted">{t('Пока пусто. Завершите миссию и сохраните результат — он появится здесь.', 'Nothing here yet. Finish a mission and save the result to see it here.')}</p>
          ) : (
            <table className="board">
              <thead>
                <tr>
                  <th>{t('Команда', 'Team')}</th>
                  <th>{t('Миссия', 'Mission')}</th>
                  <th>{t('Сложность', 'Difficulty')}</th>
                  <th className="num">{t('Счёт', 'Score')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 8).map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{t(scenarioById(r.scenarioId).name)}</td>
                    <td>{t(DIFFICULTY[r.difficulty].name)}</td>
                    <td className="num">
                      <b>{r.score}</b> <span className={`grade grade-${r.grade}`}>{r.grade}</span>
                    </td>
                    <td className="num">
                      <button type="button" className="link" onClick={() => loadShared(r.scenarioId, r.difficulty, r.design)}>
                        {t('Открыть проект', 'Open design')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="block">
          <h2>{t('Четыре роли одной команды', 'Four roles, one team')}</h2>
          <p className="muted">
            {t('В командной игре роли делят до трёх человек. В одиночной все четыре ведёте вы.', 'In team play up to three people share the roles. Playing alone, you hold all four.')}
          </p>
          <ul className="roles">
            {(Object.keys(ROLES) as Role[]).map((r) => (
              <li key={r} data-role={r}>
                <b>{t(ROLES[r].name)}</b>
                <span>{t(ROLES[r].duty)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="foot">
        {t(
          'Числа в игре упрощены, но сохраняют реальные пропорции. Формула Циолковского, энергобаланс, бюджет канала связи и выведение на орбиту считаются по-настоящему. Все модели сделаны в Blender для этой игры; ракеты вымышлены.',
          'The numbers are simplified but keep real proportions. The rocket equation, the power budget, the link budget and the climb to orbit are computed for real. Every model was made in Blender for this game; the rockets are fictional.',
        )}
      </footer>
    </div>
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
