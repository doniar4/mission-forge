import { INSTRUMENTS, ORBITS, byId } from '../engine/catalog';
import { realMissionFor, type RealMission } from '../engine/realMissions';
import type { Design, Evaluation } from '../engine/types';
import { useT, type Translator } from '../i18n';

/** Russian "раз" or "раза" after a count: в 2,5 раза, в 3 раза, в 12 раз, в 50 раз. */
function razWord(x: number, digits: number): string {
  const r = Number(x.toFixed(digits));
  if (!Number.isInteger(r)) return 'раза';
  const last = r % 10;
  const tens = r % 100;
  return last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? 'раза' : 'раз';
}

/** "50× lighter", "about the same" — how the player's number sits against the real one. */
function ratio(t: Translator, mine: number, real: number, less: [string, string], more: [string, string]): string | null {
  if (!(mine > 0) || !(real > 0)) return null;
  const k = real / mine;
  if (k > 0.8 && k < 1.25) return t('примерно такой же', 'about the same');
  const times = k >= 1 ? k : 1 / k;
  const digits = times < 10 ? 1 : 0;
  const n = t.n(times, digits);
  const [ru, en] = k >= 1 ? less : more;
  return t(`${ru} в ${n} ${razWord(times, digits)}`, `${n}× ${en}`);
}

/**
 * The player's spacecraft beside a real NASA mission that did the same job: mass, power,
 * life, cost, orbit and payload, the lesson to draw, and the sources of every number.
 */
export function RealMissionCompare({ scenarioId, design, ev }: { scenarioId: string; design: Design; ev: Evaluation }) {
  const t = useT();
  const real = realMissionFor(scenarioId);
  if (!real) return null;
  const orbit = byId(ORBITS, design.orbit);
  const insts = design.instruments.map((id) => byId(INSTRUMENTS, id)).filter((x) => !!x);
  const mass = ratio(t, ev.mass.wet, real.massKg, ['легче', 'lighter'], ['тяжелее', 'heavier']);
  const cost = real.costM ? ratio(t, ev.cost.total, real.costM, ['дешевле', 'cheaper'], ['дороже', 'more expensive']) : null;

  const rows: { label: string; mine: string; theirs: string; note?: string }[] = [
    { label: t('Масса при запуске', 'Launch mass'), mine: `${t.n(ev.mass.wet)} ${t('кг', 'kg')}`, theirs: `${t.n(real.massKg)} ${t('кг', 'kg')}` },
    {
      label: t('Энергия', 'Power'),
      mine: `${t.n(ev.power.average)} ${t('Вт', 'W')}`,
      theirs: `${t.n(real.powerW)} ${t('Вт', 'W')}`,
      note: t(`у вас — средняя выработка за виток; у ${real.name} — ${real.powerNote.ru}`, `yours: orbit-average supply; ${real.name}: ${real.powerNote.en}`),
    },
    {
      label: t('Срок работы', 'Design life'),
      mine: t(`${t.n(design.lifeYears)} г.`, `${t.n(design.lifeYears)} yr`),
      theirs: t(`${t.n(real.lifeYears, 1)} г.`, `${t.n(real.lifeYears, 1)} yr`),
    },
    {
      label: t('Стоимость', 'Cost'),
      mine: t.money(ev.cost.total),
      theirs: real.costM ? t.money(real.costM) : '—',
      note: t(real.costNote),
    },
    { label: t('Орбита', 'Orbit'), mine: orbit ? t(orbit.name) : '—', theirs: t(real.orbit) },
    { label: t('Приборы', 'Payload'), mine: insts.length ? insts.map((i) => t(i!.name)).join(', ') : '—', theirs: t(real.payload) },
  ];

  return (
    <section className="block real-mission" aria-labelledby="real-mission-title">
      <h2 id="real-mission-title">{t('Ваш аппарат и настоящая миссия', 'Your spacecraft vs a real mission')}</h2>
      <p className="real-intro">
        {t(
          `Ту же задачу решала миссия ${real.name} (${real.agency.ru}, запуск в ${real.launched} г.).`,
          `The same job was done by ${real.name} (${real.agency.en}, launched ${real.launched}).`,
        )}{' '}
        {mass && cost
          ? t(`Ваш аппарат ${mass}, а по стоимости — ${cost}.`, `Yours is ${mass} and ${cost}.`)
          : mass
            ? t(`Ваш аппарат ${mass}.`, `Yours is ${mass}.`)
            : null}
      </p>
      <div className="real-table-wrap">
        <table className="real-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">{t('Параметр', 'Parameter')}</span>
              </th>
              <th scope="col">{t('Ваш аппарат', 'Your spacecraft')}</th>
              <th scope="col">{real.name}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{r.mine}</td>
                <td>
                  {r.theirs}
                  {r.note && <span className="real-note">{r.note}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="real-lesson">{t(real.lesson)}</p>
      <p className="real-sources">
        {t('Источники: ', 'Sources: ')}
        {real.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && ' · '}
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.label}
            </a>
          </span>
        ))}
      </p>
    </section>
  );
}

/** One line for the mission brief: which real spacecraft did this job. */
export function RealMissionHint({ scenarioId }: { scenarioId: string }) {
  const t = useT();
  const real: RealMission | null = realMissionFor(scenarioId);
  if (!real) return null;
  const cost = real.costM ? t.money(real.costM) : t('цена не опубликована', 'cost not published');
  return (
    <p className="real-hint">
      {t('Реальный аналог: ', 'Real-world counterpart: ')}
      <b>{real.name}</b>
      {t(
        ` (${real.agency.ru}, ${real.launched}) — ${t.n(real.massKg)} кг, ${cost}. После полёта сравним с ним ваш аппарат.`,
        ` (${real.agency.en}, ${real.launched}) — ${t.n(real.massKg)} kg, ${cost}. After the flight you will compare your spacecraft with it.`,
      )}
    </p>
  );
}
