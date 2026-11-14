import { useMemo, useState } from 'react';
import { DIFFICULTY } from '../engine/catalog';
import { evaluate } from '../engine/evaluate';
import { buildReport } from '../engine/report';
import { scenarioById } from '../engine/scenarios';
import { goalsFor, memberName, teamwork, ROLE_LIST } from '../engine/team';
import { useT } from '../i18n';
import { useDesign, useStore } from '../store';
import { ROLES, TopBar } from './common';
import { ScienceChart } from './ScienceChart';
import { Craft3D } from './Craft3D';
import { RealMissionCompare } from './RealMission';

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

  const headline = sim.launchFailed
    ? t('Аппарат потерян при запуске', 'The spacecraft was lost at launch')
    : sim.outcome === 'success'
      ? t('Миссия выполнена', 'Mission accomplished')
      : sim.outcome === 'partial'
        ? t('Миссия выполнена частично', 'Mission partly accomplished')
        : t('Цель миссии не достигнута', 'The mission fell short');

  return (
    <div className="page debrief">
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

      <section className="verdict" data-outcome={sim.outcome}>
        <div>
          <h1>{headline}</h1>
          <p className="lede">
            {sim.launchFailed
              ? t('До орбиты аппарат не добрался. Научных данных нет.', 'The spacecraft never reached orbit. No science was returned.')
              : t(
                  `Передано ${t.pct(sim.sciencePct)} запланированной науки за ${sim.monthsOperated} из ${sim.plannedMonths} месяцев работы. Миссия обошлась в ${t.money(ev.cost.total)}.`,
                  `${t.pct(sim.sciencePct)} of the planned science returned in ${sim.monthsOperated} of ${sim.plannedMonths} months of operations. The mission cost ${t.money(ev.cost.total)}.`,
                )}
          </p>
          <div className="actions">
            <button type="button" className="primary" onClick={redesign}>
              {t('Доработать проект', 'Improve the design')}
            </button>
            <button type="button" className="secondary" onClick={launch}>
              {t('Запустить этот проект ещё раз', 'Fly this design again')}
            </button>
          </div>
        </div>
        <div className="grade" data-grade={report.grade}>
          <span className="grade-letter">{report.grade}</span>
          <span className="grade-score">{t(`${report.total} очков`, `${report.total} points`)}</span>
        </div>
      </section>

      <div className="debrief-grid">
        <section className="block">
          <h2>{t('Почему так вышло', 'Why it went this way')}</h2>
          <ul className="insights">
            {report.insights.map((x, i) => (
              <li key={i} data-kind={x.kind}>
                <b>{t(x.title)}</b>
                <p>{t(x.text)}</p>
              </li>
            ))}
          </ul>
        </section>

        <div>
          <RealMissionCompare scenarioId={scenarioId} design={design} ev={ev} />

          <section className="block">
            <h2>{t('Из чего сложился счёт', 'How the score adds up')}</h2>
            <table className="scores">
              <tbody>
                {report.lines.map((l) => (
                  <tr key={l.id}>
                    <th scope="row">{t(l.label)}</th>
                    <td className="scores-bar">
                      <span>
                        <i style={{ width: `${(l.points / l.max) * 100}%` }} />
                      </span>
                    </td>
                    <td className="num">
                      {l.points} <span className="of">/ {l.max}</span>
                    </td>
                  </tr>
                ))}
                {factor !== 1 && (
                  <tr>
                    <th scope="row">{t('Множитель сложности', 'Difficulty multiplier')}</th>
                    <td />
                    <td className="num">×{t.n(factor, 2)}</td>
                  </tr>
                )}
                <tr className="scores-total">
                  <th scope="row">{t('Итого', 'Total')}</th>
                  <td />
                  <td className="num">{report.total}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {!sim.launchFailed && (
            <section className="block">
              <h2>{t('Наука по месяцам', 'Science month by month')}</h2>
              <ScienceChart months={sim.months} />
            </section>
          )}

          {team?.state && (
            <section className="block">
              <h2>{t('Цели ролей', 'Role goals')}</h2>
              <ul className="goals">
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
            </section>
          )}

          <section className="block">
            <h2>{t('Аппарат', 'The spacecraft')}</h2>
            <Craft3D design={design} ev={ev} />
          </section>

          <section className="block">
            <h2>{t('Сохранить результат', 'Save the result')}</h2>
            {saved ? (
              <p className="muted">
                {t('Сохранено. Результат и проект доступны на главной странице.', 'Saved. The result and the design are on the home page.')}
              </p>
            ) : (
              <form
                className="save"
                onSubmit={(e) => {
                  e.preventDefault();
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
                    {t('Сохранить результат', 'Save the result')}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
