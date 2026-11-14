import type { ReactNode } from 'react';
import {
  ADCS,
  ANTENNAS,
  BATTERIES,
  COMPUTERS,
  GROUNDS,
  INSTRUMENTS,
  MEASURES,
  ORBITS,
  POWER,
  PROPULSION,
  STRUCTURES,
  TESTING,
  VEHICLES,
  byId,
} from '../engine/catalog';
import { scenarioOrbits } from '../engine/scenarios';
import type { Design, Evaluation, L, Measure, Scenario } from '../engine/types';
import { useT } from '../i18n';
import { useStore } from '../store';

export type SectionId = 'brief' | 'orbit' | 'payload' | 'power' | 'platform' | 'comms' | 'plan';

interface SectionProps {
  design: Design;
  ev: Evaluation;
  sc: Scenario;
}

interface Col<T> {
  head: string;
  cell: (x: T) => ReactNode;
}

/** A parts-catalogue table: one row per option, with what it costs you in each resource. */
function Options<T extends { id: string; name: L; desc: L; advanced?: boolean }>({
  title,
  hint,
  items,
  selected,
  multi = false,
  onPick,
  cols,
  note,
}: {
  title: string;
  hint?: string;
  items: T[];
  selected: (string | null)[];
  multi?: boolean;
  onPick: (id: string) => void;
  cols: Col<T>[];
  note?: (x: T) => ReactNode;
}) {
  const t = useT();
  const advancedAllowed = useStore((s) => s.difficulty !== 'cadet');
  const visible = items.filter((x) => advancedAllowed || !x.advanced);
  const grid = { gridTemplateColumns: `1.4rem minmax(0, 1fr) repeat(${cols.length}, minmax(4.2rem, max-content))` };
  return (
    <section className="group">
      <h3>{title}</h3>
      {hint && <p className="hint">{hint}</p>}
      <div className="options" role={multi ? 'group' : 'radiogroup'} aria-label={title}>
        <div className="options-head" style={grid} aria-hidden="true">
          <span />
          <span />
          {cols.map((c) => (
            <span key={c.head}>{c.head}</span>
          ))}
        </div>
        {visible.map((x) => {
          const on = selected.includes(x.id);
          return (
            <button
              key={x.id}
              type="button"
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={on}
              className="option"
              style={grid}
              onClick={() => onPick(x.id)}
            >
              <span className={multi ? 'mark mark-box' : 'mark'} />
              <span className="option-name">{t(x.name)}</span>
              {cols.map((c) => (
                <span key={c.head} className="stat" data-label={c.head}>
                  {c.cell(x)}
                </span>
              ))}
              <span className="option-more">
                <span className="option-desc">{t(x.desc)}</span>
                {note?.(x)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Lesson({ children }: { children: ReactNode }) {
  return <p className="lesson">{children}</p>;
}

// ---------------------------------------------------------------------------

export function BriefSection({ ev, sc }: SectionProps) {
  const t = useT();
  const weights = (Object.entries(sc.weights) as [Measure, number][]).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <h2>{t(sc.name)}</h2>
      <p className="brief">{t(sc.brief)}</p>

      <section className="group">
        <h3>{t('Что нужно измерить', 'What has to be measured')}</h3>
        <p className="hint">
          {t(
            'Чем важнее измерение, тем больше науки оно приносит. Заполненная часть полосы — насколько хорошо его закрывают ваши приборы.',
            'The more a measurement matters, the more science it brings. The filled part of each bar shows how well your instruments cover it.',
          )}
        </p>
        <ul className="needs">
          {weights.slice(0, sc.sandbox ? 11 : 6).map(([m, w]) => {
            const q = ev.science.quality[m] ?? 0;
            return (
              <li key={m}>
                <span className="needs-name">{t(MEASURES[m])}</span>
                <span className="needs-weight">{t(`${Math.round(w * 100)}% задачи`, `${Math.round(w * 100)}% of the goal`)}</span>
                <span className="needs-bar" role="img" aria-label={t(`закрыто на ${Math.round(q * 100)}%`, `${Math.round(q * 100)}% covered`)}>
                  <i style={{ width: `${q * 100}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="group">
        <h3>{t('Условия заказчика', 'The customer’s terms')}</h3>
        <dl className="terms">
          <div>
            <dt>{t('Бюджет', 'Budget')}</dt>
            <dd>{t.money(ev.cost.budget)}</dd>
          </div>
          <div>
            <dt>{t('Срок до запуска', 'Time to launch')}</dt>
            <dd>{t(`${sc.deadlineMonths} мес.`, `${sc.deadlineMonths} months`)}</dd>
          </div>
          <div>
            <dt>{t('Работа на орбите', 'Time in orbit')}</dt>
            <dd>{t(`${sc.targetYears} г.`, `${sc.targetYears} years`)}</dd>
          </div>
        </dl>
        <Lesson>
          {t(
            'Цель считается достигнутой, когда аппарат передал на Землю столько науки, сколько хороший набор приборов собирает за заданный срок. Добраться до неё можно по-разному: взять больше приборов, выбрать орбиту получше или проработать дольше.',
            'The objective is met once the spacecraft has sent home as much science as a good payload gathers in the requested time. There are several ways to get there: more instruments, a better orbit, or a longer life.',
          )}
        </Lesson>
      </section>
    </>
  );
}

export function OrbitSection({ design, sc }: SectionProps) {
  const t = useT();
  const patch = useStore((s) => s.patch);
  const orbits = scenarioOrbits(sc).map((id) => byId(ORBITS, id)!);
  return (
    <>
      <h2>{t('Орбита', 'Orbit')}</h2>
      <Lesson>
        {t(
          'Орбита — первое и самое дорогое решение. Она определяет, что увидят приборы, сколько времени аппарат проводит в тени, как далеко лететь сигналу и какую часть груза ракета сможет туда довезти.',
          'The orbit is the first and most expensive decision. It sets what the instruments see, how long the spacecraft sits in shadow, how far the signal travels and how much of its payload a rocket can deliver.',
        )}
      </Lesson>
      <Options
        title={t('Куда летим', 'Where to fly')}
        items={orbits}
        selected={[design.orbit]}
        onPick={(id) => patch({ orbit: id as Design['orbit'] })}
        note={(o) => (
          <span className="option-note">
            {t(o.altitude)}. {t(sc.orbits[o.id]!.note)}
          </span>
        )}
        cols={[
          { head: t('Польза для задачи', 'Fit for the goal'), cell: (o) => t.pct(sc.orbits[o.id]!.fit) },
          { head: t('Груз ракеты', 'Rocket payload'), cell: (o) => t.pct(o.capFactor) },
          { head: t('Манёвр, м/с', 'Burn, m/s'), cell: (o) => t.n(o.insertionDv) },
          { head: t('На свету', 'In sunlight'), cell: (o) => t.pct(o.sunFraction) },
          { head: t('Перелёт', 'Cruise'), cell: (o) => (o.transitMonths ? t(`${o.transitMonths} мес.`, `${o.transitMonths} mo`) : '—') },
        ]}
      />
    </>
  );
}

export function PayloadSection({ design, sc }: SectionProps) {
  const t = useT();
  const toggle = useStore((s) => s.toggleInstrument);
  // Instruments useful for this objective come first.
  const useful = (i: (typeof INSTRUMENTS)[number]) =>
    (Object.keys(i.measures) as Measure[]).reduce((a, m) => a + (sc.weights[m] ?? 0) * i.measures[m]!, 0);
  const items = [...INSTRUMENTS].sort((a, b) => useful(b) - useful(a));
  return (
    <>
      <h2>{t('Научные приборы', 'Science instruments')}</h2>
      <Lesson>
        {t(
          'Ради приборов и строится весь аппарат. Но каждый из них тянет за собой цепочку: масса → топливо → ракета; мощность → панели → батарея; данные → антенна → станции. Берите то, что нужно задаче.',
          'The instruments are why the spacecraft exists. But each one pulls a chain behind it: mass → fuel → rocket; power → arrays → battery; data → antenna → stations. Take what the objective needs.',
        )}
      </Lesson>
      <Options
        title={t('Полезная нагрузка', 'Payload')}
        hint={t('Можно выбрать несколько.', 'Choose as many as you like.')}
        multi
        items={items}
        selected={design.instruments}
        onPick={toggle}
        note={(i) => (
          <span className="chips">
            {(Object.keys(i.measures) as Measure[]).map((m) => (
              <span key={m} className="chip" data-needed={(sc.weights[m] ?? 0) > 0 && !sc.sandbox}>
                {t(MEASURES[m])}
              </span>
            ))}
            {i.pointing === 3 && <span className="chip chip-plain">{t('нужно точное наведение', 'needs fine pointing')}</span>}
          </span>
        )}
        cols={[
          { head: t('Масса, кг', 'Mass, kg'), cell: (i) => t.n(i.mass) },
          { head: t('Мощность, Вт', 'Power, W'), cell: (i) => t.n(i.power) },
          { head: t('Данные, ГБ/сут', 'Data, GB/day'), cell: (i) => t.n(i.data, 2) },
          { head: t('Цена', 'Cost'), cell: (i) => t.money(i.cost) },
        ]}
      />
    </>
  );
}

export function PowerSection({ design, ev }: SectionProps) {
  const t = useT();
  const patch = useStore((s) => s.patch);
  const orbit = byId(ORBITS, design.orbit);
  const here = (watts: number, solar: boolean) => (solar && orbit ? watts * orbit.solarFactor * orbit.sunFraction : watts);
  return (
    <>
      <h2>{t('Энергия', 'Power')}</h2>
      <Lesson>
        {t(
          `Сейчас аппарат потребляет ${t.n(ev.power.load)} Вт. Солнечные панели работают только на свету, поэтому важна средняя выработка за виток. В тени аппарат живёт на батарее — её должно хватить с запасом.`,
          `The spacecraft currently draws ${t.n(ev.power.load)} W. Solar arrays only work in sunlight, so what matters is the average over an orbit. In shadow the spacecraft lives off its battery, which must cover it with room to spare.`,
        )}
      </Lesson>
      <Options
        title={t('Источник энергии', 'Power source')}
        items={POWER}
        selected={[design.power]}
        onPick={(id) => patch({ power: id })}
        cols={[
          { head: t('На свету, Вт', 'In sunlight, W'), cell: (p) => t.n(p.watts) },
          { head: orbit ? t('В среднем здесь, Вт', 'Average here, W') : t('В среднем, Вт', 'Average, W'), cell: (p) => t.n(here(p.watts, p.solar)) },
          { head: t('Масса, кг', 'Mass, kg'), cell: (p) => t.n(p.mass) },
          { head: t('Цена', 'Cost'), cell: (p) => t.money(p.cost) },
        ]}
      />
      <Options
        title={t('Батарея', 'Battery')}
        hint={
          ev.power.eclipseNeedWh > 0
            ? t(
                `На самую длинную тень нужно ${t.n(ev.power.eclipseNeedWh)} Вт·ч. Безопасно использовать можно 70% ёмкости.`,
                `The longest eclipse needs ${t.n(ev.power.eclipseNeedWh)} Wh. Only 70% of the capacity is safe to use.`,
              )
            : t('На этой орбите тени нет или источник не зависит от Солнца.', 'This orbit has no eclipse, or the source does not depend on the Sun.')
        }
        items={BATTERIES}
        selected={[design.battery]}
        onPick={(id) => patch({ battery: id })}
        cols={[
          { head: t('Доступно, Вт·ч', 'Usable, Wh'), cell: (b) => t.n(b.wh * 0.7) },
          { head: t('Масса, кг', 'Mass, kg'), cell: (b) => t.n(b.mass, 1) },
          { head: t('Цена', 'Cost'), cell: (b) => t.money(b.cost) },
        ]}
      />
    </>
  );
}

const POINTING: L[] = [
  { ru: '', en: '' },
  { ru: 'грубое', en: 'coarse' },
  { ru: 'среднее', en: 'medium' },
  { ru: 'точное', en: 'fine' },
];

export function PlatformSection({ design, ev }: SectionProps) {
  const t = useT();
  const patch = useStore((s) => s.patch);
  return (
    <>
      <h2>{t('Платформа', 'Platform')}</h2>
      <Lesson>
        {t(
          'Платформа держит приборы, наводит их на цель и двигает аппарат. Запас скорости, который нужен для манёвров, определяет массу топлива по формуле Циолковского: зависимость экспоненциальная, поэтому каждый лишний метр в секунду обходится всё дороже.',
          'The platform carries the instruments, points them and moves the spacecraft. The speed change needed for manoeuvres sets the propellant mass through the rocket equation: the relationship is exponential, so each extra metre per second costs more than the last.',
        )}
      </Lesson>
      <Options
        title={t('Ориентация', 'Attitude control')}
        items={ADCS}
        selected={[design.adcs]}
        onPick={(id) => patch({ adcs: id })}
        cols={[
          { head: t('Наведение', 'Pointing'), cell: (a) => t(POINTING[a.pointing]) },
          { head: t('Масса, кг', 'Mass, kg'), cell: (a) => t.n(a.mass, 1) },
          { head: t('Мощность, Вт', 'Power, W'), cell: (a) => t.n(a.power) },
          { head: t('Цена', 'Cost'), cell: (a) => t.money(a.cost) },
        ]}
      />
      <Options
        title={t('Двигатель', 'Propulsion')}
        hint={
          ev.dv.total > 0
            ? t(
                `Манёвры этой миссии: ${t.n(ev.dv.total)} м/с (выход на орбиту ${t.n(ev.dv.insertion)}, удержание ${t.n(ev.dv.station)}, увод ${t.n(ev.dv.disposal)}). Топлива потребуется ${t.n(ev.mass.propellant)} кг.`,
                `This mission’s manoeuvres: ${t.n(ev.dv.total)} m/s (insertion ${t.n(ev.dv.insertion)}, station-keeping ${t.n(ev.dv.station)}, disposal ${t.n(ev.dv.disposal)}). That takes ${t.n(ev.mass.propellant)} kg of propellant.`,
              )
            : t(
                'Удельный импульс показывает, насколько экономно двигатель расходует топливо: чем он выше, тем меньше топлива нужно на тот же манёвр.',
                'Specific impulse shows how frugally an engine uses propellant: the higher it is, the less propellant the same manoeuvre takes.',
              )
        }
        items={PROPULSION}
        selected={[design.propulsion]}
        onPick={(id) => patch({ propulsion: id })}
        cols={[
          { head: t('Удельный импульс, с', 'Specific impulse, s'), cell: (p) => (p.isp ? t.n(p.isp) : '—') },
          { head: t('Масса, кг', 'Mass, kg'), cell: (p) => t.n(p.mass) },
          { head: t('Цена', 'Cost'), cell: (p) => t.money(p.cost) },
        ]}
      />
      <Options
        title={t('Корпус', 'Structure')}
        items={STRUCTURES}
        selected={[design.structure]}
        onPick={(id) => patch({ structure: id })}
        cols={[
          { head: t('Доля массы', 'Mass share'), cell: (s) => t.pct(s.fraction) },
          { head: t('Цена', 'Cost'), cell: (s) => t.money(s.baseCost + s.costPerKg * ev.mass.structure) },
        ]}
      />
    </>
  );
}

export function CommsSection({ design, ev }: SectionProps) {
  const t = useT();
  const patch = useStore((s) => s.patch);
  const orbit = byId(ORBITS, design.orbit);
  const ground = byId(GROUNDS, design.ground)!;
  return (
    <>
      <h2>{t('Связь и данные', 'Comms and data')}</h2>
      <Lesson>
        {t(
          `Приборы создают ${t.n(ev.data.generated, 1)} ГБ в сутки. Сколько из этого дойдёт до Земли, решает произведение: скорость антенны × время связи со станциями. Чем дальше аппарат, тем слабее сигнал и ниже скорость.`,
          `The instruments produce ${t.n(ev.data.generated, 1)} GB a day. How much reaches Earth is a product: antenna rate × contact time with stations. The farther the spacecraft, the fainter the signal and the lower the rate.`,
        )}
      </Lesson>
      <Options
        title={t('Антенна', 'Antenna')}
        items={ANTENNAS}
        selected={[design.comms]}
        onPick={(id) => patch({ comms: id })}
        cols={[
          {
            head: orbit ? t('Скорость здесь, Мбит/с', 'Rate here, Mbit/s') : t('Скорость, Мбит/с', 'Rate, Mbit/s'),
            cell: (a) => t.n(a.mbps * (orbit?.commsFactor ?? 1) * ground.gain, 2),
          },
          { head: t('Наведение', 'Pointing'), cell: (a) => t(POINTING[a.pointing]) },
          { head: t('Масса, кг', 'Mass, kg'), cell: (a) => t.n(a.mass) },
          { head: t('Мощность, Вт', 'Power, W'), cell: (a) => t.n(a.power) },
          { head: t('Цена', 'Cost'), cell: (a) => t.money(a.cost) },
        ]}
      />
      <Options
        title={t('Наземные станции', 'Ground stations')}
        items={GROUNDS}
        selected={[design.ground]}
        onPick={(id) => patch({ ground: id as Design['ground'] })}
        cols={[
          { head: t('Связь, ч/сут', 'Contact, h/day'), cell: (g) => (orbit ? t.n(orbit.contact[g.id], 1) : '—') },
          { head: t('Усиление', 'Gain'), cell: (g) => `×${t.n(g.gain, 1)}` },
          { head: t('Цена в год', 'Cost per year'), cell: (g) => t.money(g.yearlyCost) },
        ]}
      />
      <Options
        title={t('Бортовой компьютер', 'Onboard computer')}
        hint={t(
          'Компьютер хранит данные между сеансами связи и может сжимать их. За пределами низких орбит ему нужна защита от радиации.',
          'The computer stores data between contacts and can compress it. Beyond low orbits it needs protection from radiation.',
        )}
        items={COMPUTERS}
        selected={[design.computer]}
        onPick={(id) => patch({ computer: id })}
        cols={[
          { head: t('Память, ГБ', 'Storage, GB'), cell: (c) => t.n(c.storage) },
          { head: t('Сжатие', 'Compression'), cell: (c) => (c.compression < 1 ? `−${t.n((1 - c.compression) * 100)}%` : '—') },
          { head: t('Масса, кг', 'Mass, kg'), cell: (c) => t.n(c.mass) },
          { head: t('Мощность, Вт', 'Power, W'), cell: (c) => t.n(c.power) },
          { head: t('Цена', 'Cost'), cell: (c) => t.money(c.cost) },
        ]}
      />
    </>
  );
}

const REDUNDANCY = [
  {
    id: 'single',
    name: { ru: 'Без резерва', en: 'Single string' },
    desc: { ru: 'Каждой системы по одной. Легче и дешевле, но любой серьёзный отказ — конец миссии.', en: 'One of everything. Lighter and cheaper, but any serious failure ends the mission.' },
  },
  {
    id: 'redundant',
    name: { ru: 'Резервирование', en: 'Redundant systems' },
    desc: { ru: 'Запасные комплекты ключевых систем: втрое меньше отказов, но +15% массы платформы и +25% её цены.', en: 'Spare sets of key systems: a third of the failures, for +15% platform mass and +25% platform cost.' },
    advanced: true,
  },
];

export function PlanSection({ design, ev, sc }: SectionProps) {
  const t = useT();
  const patch = useStore((s) => s.patch);
  const orbit = byId(ORBITS, design.orbit);
  const advancedAllowed = useStore((s) => s.difficulty !== 'cadet');
  return (
    <>
      <h2>{t('Запуск и план работ', 'Launch and plan')}</h2>
      <Lesson>
        {t(
          'Здесь сходятся риск, деньги и время. Надёжная ракета и долгие испытания стоят дорого, но аппарат в космосе не починить. Длинная миссия приносит больше науки — и больше счетов за работу команды и станций.',
          'This is where risk, money and time meet. A reliable rocket and long test campaigns are costly, but nothing can be repaired in space. A longer mission returns more science — and more bills for the team and the stations.',
        )}
      </Lesson>
      <Options
        title={t('Ракета-носитель', 'Launch vehicle')}
        hint={t(
          `Аппарат с топливом весит ${t.n(ev.mass.wet)} кг.`,
          `The fuelled spacecraft weighs ${t.n(ev.mass.wet)} kg.`,
        )}
        items={VEHICLES}
        selected={[design.vehicle]}
        onPick={(id) => patch({ vehicle: id })}
        cols={[
          {
            head: orbit ? t('Груз сюда, кг', 'Payload here, kg') : t('Груз на низкую орбиту, кг', 'Payload to low orbit, kg'),
            cell: (v) => (orbit ? (v.reach.includes(orbit.id) ? t.n(v.leoKg * orbit.capFactor) : t('не долетит', 'out of reach')) : t.n(v.leoKg)),
          },
          { head: t('Надёжность', 'Reliability'), cell: (v) => t.pct(v.reliability) },
          { head: t('Цена', 'Cost'), cell: (v) => t.money(v.cost) },
        ]}
      />

      <section className="group">
        <h3>{t('Срок работы на орбите', 'Time in orbit')}</h3>
        <p className="hint">
          {t(
            `Заказчик просит ${sc.targetYears} г. Каждый год — это работа команды, аренда станций, топливо на удержание орбиты и износ аппарата.`,
            `The customer asks for ${sc.targetYears} years. Each year means team salaries, station fees, station-keeping fuel and wear on the spacecraft.`,
          )}
        </p>
        <label className="slider">
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={design.lifeYears}
            onChange={(e) => patch({ lifeYears: Number(e.target.value) })}
            aria-label={t('Срок работы на орбите, лет', 'Time in orbit, years')}
          />
          <output>{t(`${design.lifeYears} г.`, `${design.lifeYears} yr`)}</output>
        </label>
      </section>

      <Options
        title={t('Испытания на Земле', 'Ground testing')}
        items={TESTING}
        selected={[design.testing]}
        onPick={(id) => patch({ testing: id as Design['testing'] })}
        cols={[
          { head: t('Отказы в полёте', 'Failures in flight'), cell: (x) => `×${t.n(x.failFactor, 1)}` },
          { head: t('Срок', 'Time'), cell: (x) => t(`+${x.months} мес.`, `+${x.months} mo`) },
          { head: t('Цена', 'Cost'), cell: (x) => t.money(x.cost) },
        ]}
      />
      {advancedAllowed && (
        <Options
          title={t('Резервирование', 'Redundancy')}
          items={REDUNDANCY}
          selected={[design.redundancy]}
          onPick={(id) => patch({ redundancy: id as Design['redundancy'] })}
          cols={[]}
        />
      )}
    </>
  );
}
