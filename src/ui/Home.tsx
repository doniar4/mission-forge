import { DIFFICULTY } from '../engine/catalog';
import { SCENARIOS, scenarioById } from '../engine/scenarios';
import type { Difficulty, Role } from '../engine/types';
import { useT } from '../i18n';
import { useStore } from '../store';
import { BodyGlyph, ROLES, Stars, TopBar } from './common';
import { TeamEntry } from './Team';

const DESTINATION = {
  earth: { ru: 'Орбита Земли', en: 'Earth orbit' },
  moon: { ru: 'Луна', en: 'The Moon' },
  mars: { ru: 'Марс', en: 'Mars' },
  sun: { ru: 'Точка L1', en: 'L1 point' },
};

export function Home() {
  const t = useT();
  const difficulty = useStore((s) => s.difficulty);
  const setDifficulty = useStore((s) => s.setDifficulty);
  const open = useStore((s) => s.open);
  const designs = useStore((s) => s.designs);
  const records = useStore((s) => s.records);
  const loadShared = useStore((s) => s.loadShared);
  const D = DIFFICULTY[difficulty];

  return (
    <div className="page home">
      <TopBar left={<span className="brand">Mission Forge</span>} />

      <section className="hero">
        <h1>
          {t('Спроектируйте космическую миссию.', 'Design a space mission.')}
          <br />
          {t('Запустите её. Узнайте, почему она удалась — или нет.', 'Fly it. Find out why it worked — or did not.')}
        </h1>
        <p className="lede">
          {t(
            'Вы выбираете орбиту, приборы, источник энергии, связь и ракету. Каждый килограмм, ватт и доллар на счету: улучшая одно, вы платите другим. После полёта игра объяснит, какие решения сработали.',
            'You choose the orbit, instruments, power source, radio link and rocket. Every kilogram, watt and dollar counts: improve one thing and you pay with another. After the flight, the game explains which decisions worked.',
          )}
        </p>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>{t('Уровень сложности', 'Difficulty')}</h2>
          <div className="segmented" role="radiogroup" aria-label={t('Уровень сложности', 'Difficulty')}>
            {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={difficulty === d} onClick={() => setDifficulty(d)}>
                {t(DIFFICULTY[d].name)}
              </button>
            ))}
          </div>
        </div>
        <p className="muted">{t(D.desc)}</p>
      </section>

      <section className="block">
        <h2>{t('Заявки на миссии', 'Mission requests')}</h2>
        <ul className="docket">
          {SCENARIOS.map((sc) => {
            const best = records.filter((r) => r.scenarioId === sc.id)[0];
            const started = !!designs[sc.id]?.orbit || (designs[sc.id]?.instruments.length ?? 0) > 0;
            return (
              <li key={sc.id}>
                <button type="button" className="docket-row" onClick={() => open(sc.id)}>
                  <BodyGlyph body={sc.body} />
                  <span className="docket-main">
                    <span className="docket-name">{t(sc.name)}</span>
                    <span className="docket-tag">{t(sc.tagline)}</span>
                  </span>
                  <span className="docket-facts">
                    <span>{t(DESTINATION[sc.body])}</span>
                    <span>{sc.sandbox ? t('без лимита', 'no limit') : t.money(Math.round(sc.budget * D.budget))}</span>
                    <span>{sc.sandbox ? '' : t(`${sc.targetYears} г. работы`, `${sc.targetYears} yr of operations`)}</span>
                  </span>
                  <span className="docket-side">
                    <Stars n={sc.stars} />
                    <span className="docket-status">
                      {best ? t(`лучший счёт ${best.score}`, `best score ${best.score}`) : started ? t('есть черновик', 'draft saved') : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <TeamEntry />

      <div className="two-col">
        <section className="block">
          <h2>{t('Лучшие миссии', 'Best missions')}</h2>
          {records.length === 0 ? (
            <p className="muted">
              {t(
                'Пока пусто. Завершите миссию и сохраните результат — он появится здесь.',
                'Nothing here yet. Finish a mission and save the result to see it here.',
              )}
            </p>
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
            {t(
              'В командной игре роли делят между собой до трёх человек, и у каждой роли свои разделы и цели. В одиночной игре все четыре роли ведёте вы.',
              'In team play up to three people share the roles, and each role has its own sections and goals. Playing alone, you hold all four.',
            )}
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
          'Числа в игре упрощены, но сохраняют реальные пропорции. Формула Циолковского, энергобаланс и бюджет канала связи считаются по-настоящему.',
          'The numbers are simplified but keep real proportions. The rocket equation, the power budget and the link budget are computed for real.',
        )}
      </footer>
    </div>
  );
}
