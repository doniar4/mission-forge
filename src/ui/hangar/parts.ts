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
} from '../../engine/catalog';
import { scenarioOrbits } from '../../engine/scenarios';
import type { Design, Evaluation, L, Measure, Role, Scenario } from '../../engine/types';
import type { Translator } from '../../i18n';

/*
 * What the hangar's part slider shows, section by section. Each group is one decision:
 * a row of cards, each card one catalogue item with a Blender render (public/thumbs) and
 * the numbers that matter for that decision.
 */

export type SectionId = 'brief' | 'orbit' | 'payload' | 'power' | 'platform' | 'comms' | 'plan';

export const SECTIONS: { id: SectionId; role: Role; name: L; focus: string[] }[] = [
  { id: 'brief', role: 'manager', name: { ru: 'Задача', en: 'Objective' }, focus: [] },
  { id: 'orbit', role: 'science', name: { ru: 'Орбита', en: 'Orbit' }, focus: [] },
  { id: 'payload', role: 'science', name: { ru: 'Приборы', en: 'Instruments' }, focus: ['inst:'] },
  { id: 'power', role: 'engineer', name: { ru: 'Энергия', en: 'Power' }, focus: ['power:'] },
  { id: 'platform', role: 'engineer', name: { ru: 'Платформа', en: 'Platform' }, focus: ['adcs:', 'propulsion:'] },
  { id: 'comms', role: 'comms', name: { ru: 'Связь', en: 'Comms' }, focus: ['comms:'] },
  { id: 'plan', role: 'manager', name: { ru: 'Запуск', en: 'Launch' }, focus: [] },
];

/** Which section fixes which review finding. */
export const WHERE: Record<string, SectionId> = {
  no_orbit: 'orbit',
  no_instruments: 'payload',
  uncovered: 'payload',
  no_vehicle: 'plan',
  vehicle_reach: 'plan',
  overweight: 'plan',
  mass_margin: 'plan',
  over_budget: 'plan',
  late: 'plan',
  disposal: 'platform',
  no_engine: 'platform',
  tank_limit: 'platform',
  magnetic: 'platform',
  decay: 'platform',
  pointing_inst: 'platform',
  ion_power: 'power',
  bus_power: 'power',
  power_deficit: 'power',
  power_eol: 'power',
  battery: 'power',
  pointing_ant: 'comms',
  data_bottleneck: 'comms',
  storage: 'comms',
  radiation: 'comms',
};

/** The short lesson behind each section: why this decision matters. */
export const LESSONS: Record<SectionId, L> = {
  brief: {
    ru: 'Цель достигнута, когда аппарат передал на Землю столько науки, сколько хороший набор приборов собирает за заданный срок. Дойти до неё можно разными путями.',
    en: 'The objective is met once the spacecraft has sent home as much science as a good payload gathers in the requested time. There is more than one way to get there.',
  },
  orbit: {
    ru: 'Орбита — первое и самое дорогое решение: она определяет, что увидят приборы, сколько аппарат проводит в тени, как далеко лететь сигналу и какую часть груза ракета туда довезёт.',
    en: 'The orbit is the first and most expensive decision: it sets what the instruments see, how long the spacecraft sits in shadow, how far the signal travels and how much payload a rocket can deliver.',
  },
  payload: {
    ru: 'Ради приборов строится весь аппарат. Но каждый тянет за собой цепочку: масса → топливо → ракета; мощность → панели → батарея; данные → антенна → станции.',
    en: 'The instruments are why the spacecraft exists. But each one pulls a chain behind it: mass → fuel → rocket; power → arrays → battery; data → antenna → stations.',
  },
  power: {
    ru: 'Солнечные панели работают только на свету, поэтому важна средняя выработка за виток. В тени аппарат живёт на батарее — её должно хватить с запасом.',
    en: 'Solar arrays only work in sunlight, so what matters is the average over an orbit. In shadow the spacecraft lives off its battery, which must cover it with room to spare.',
  },
  platform: {
    ru: 'Платформа наводит приборы и двигает аппарат. Масса топлива растёт по формуле Циолковского экспоненциально: каждый лишний метр в секунду обходится всё дороже.',
    en: 'The platform points the instruments and moves the spacecraft. Propellant grows exponentially with the rocket equation: each extra metre per second costs more than the last.',
  },
  comms: {
    ru: 'До Земли доходит скорость антенны × время связи со станциями. Чем дальше аппарат, тем слабее сигнал. Компьютер хранит данные между сеансами и может их сжимать.',
    en: 'What reaches Earth is antenna rate × contact time. The farther the spacecraft, the fainter the signal. The computer stores data between contacts and can compress it.',
  },
  plan: {
    ru: 'Здесь сходятся риск, деньги и время. Надёжная ракета и долгие испытания стоят дорого, но аппарат в космосе не починить.',
    en: 'This is where risk, money and time meet. A reliable rocket and long test campaigns are costly, but nothing can be repaired in space.',
  },
};

export interface Card {
  id: string;
  name: string;
  desc: string;
  thumb: string;
  /** Portrait art (rockets). */
  tall?: boolean;
  stats: { label: string; value: string }[];
  /** Tags such as measurements; `good` marks what the mission needs. */
  tags?: { text: string; good?: boolean }[];
  /** A short line from the mission's point of view (orbit fit). */
  note?: string;
  /** Present but not allowed (e.g. a rocket that cannot reach the orbit). */
  warning?: string;
}

export interface RailGroup {
  kind: 'rail';
  id: string;
  title: string;
  hint?: string;
  multi?: boolean;
  cards: Card[];
  selected: string[];
  /** The design change that choosing a card makes (for a multi group: the toggled list). */
  pick: (id: string) => Partial<Design>;
}

export interface YearsGroup {
  kind: 'years';
  id: 'years';
  title: string;
  hint: string;
}

export type Group = RailGroup | YearsGroup;

const thumb = (name: string) => `${import.meta.env.BASE_URL}thumbs/${name}.webp`;

const POINTING: L[] = [
  { ru: '', en: '' },
  { ru: 'грубое', en: 'coarse' },
  { ru: 'среднее', en: 'medium' },
  { ru: 'точное', en: 'fine' },
];

export const REDUNDANCY = [
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

export interface Ctx {
  t: Translator;
  design: Design;
  ev: Evaluation;
  sc: Scenario;
  advanced: boolean;
}

export function groupsFor(section: SectionId, { t, design, ev, sc, advanced }: Ctx): Group[] {
  const allowed = <T extends { advanced?: boolean }>(list: T[]) => list.filter((x) => advanced || !x.advanced);
  const orbit = byId(ORBITS, design.orbit);
  const ground = byId(GROUNDS, design.ground)!;
  const kg = (x: number, d = 0) => `${t.n(x, d)} ${t('кг', 'kg')}`;
  const w = (x: number) => `${t.n(x)} ${t('Вт', 'W')}`;
  const base = (id: string, name: L, desc: L, img: string) => ({ id, name: t(name), desc: t(desc), thumb: thumb(img) });

  switch (section) {
    case 'brief':
      return [];
    case 'orbit':
      return [
        {
          kind: 'rail',
          id: 'orbit',
          title: t('Куда летим', 'Where to fly'),
          cards: scenarioOrbits(sc).map((id) => {
            const o = byId(ORBITS, id)!;
            const fit = sc.orbits[id]!;
            return {
              ...base(o.id, o.name, o.desc, `orbit_${o.id}`),
              note: `${t(o.altitude)}. ${t(fit.note)}`,
              stats: [
                { label: t('Польза для задачи', 'Fit for the goal'), value: t.pct(fit.fit) },
                { label: t('Груз ракеты', 'Rocket payload'), value: t.pct(o.capFactor) },
                { label: t('Манёвр', 'Burn'), value: o.insertionDv ? `${t.n(o.insertionDv)} ${t('м/с', 'm/s')}` : '—' },
                { label: t('На свету', 'In sunlight'), value: t.pct(o.sunFraction) },
              ],
            };
          }),
          selected: [design.orbit ?? ''],
          pick: (id) => ({ orbit: id as Design['orbit'] }),
        },
      ];
    case 'payload': {
      const useful = (i: (typeof INSTRUMENTS)[number]) => (Object.keys(i.measures) as Measure[]).reduce((a, m) => a + (sc.weights[m] ?? 0) * i.measures[m]!, 0);
      return [
        {
          kind: 'rail',
          id: 'payload',
          multi: true,
          title: t('Научные приборы', 'Science instruments'),
          hint: t('Можно взять несколько. Первыми идут те, что нужны задаче.', 'Take as many as you like. The ones this objective needs come first.'),
          cards: allowed([...INSTRUMENTS].sort((a, b) => useful(b) - useful(a))).map((i) => ({
            ...base(i.id, i.name, i.desc, `inst_${i.id}`),
            stats: [
              { label: t('Масса', 'Mass'), value: kg(i.mass) },
              { label: t('Мощность', 'Power'), value: w(i.power) },
              { label: t('Данные', 'Data'), value: `${t.n(i.data, 2)} ${t('ГБ/сут', 'GB/day')}` },
              { label: t('Цена', 'Cost'), value: t.money(i.cost) },
            ],
            tags: [
              ...(Object.keys(i.measures) as Measure[]).map((m) => ({ text: t(MEASURES[m]), good: !sc.sandbox && (sc.weights[m] ?? 0) > 0 })),
              ...(i.pointing === 3 ? [{ text: t('нужно точное наведение', 'needs fine pointing') }] : []),
            ],
          })),
          selected: design.instruments,
          pick: (id) => ({ instruments: design.instruments.includes(id) ? design.instruments.filter((x) => x !== id) : [...design.instruments, id] }),
        },
      ];
    }
    case 'power': {
      const here = (watts: number, solar: boolean) => (solar && orbit ? watts * orbit.solarFactor * orbit.sunFraction : watts);
      return [
        {
          kind: 'rail',
          id: 'power',
          title: t('Источник энергии', 'Power source'),
          hint: t(`Аппарат потребляет ${t.n(ev.power.load)} Вт.`, `The spacecraft draws ${t.n(ev.power.load)} W.`),
          cards: allowed(POWER).map((p) => ({
            ...base(p.id, p.name, p.desc, `power_${p.id}`),
            stats: [
              { label: orbit ? t('В среднем здесь', 'Average here') : t('В среднем', 'Average'), value: w(here(p.watts, p.solar)) },
              { label: t('На свету', 'In sunlight'), value: w(p.watts) },
              { label: t('Масса', 'Mass'), value: kg(p.mass) },
              { label: t('Цена', 'Cost'), value: t.money(p.cost) },
            ],
          })),
          selected: [design.power],
          pick: (id) => ({ power: id }),
        },
        {
          kind: 'rail',
          id: 'battery',
          title: t('Батарея', 'Battery'),
          hint:
            ev.power.eclipseNeedWh > 0
              ? t(`На самую длинную тень нужно ${t.n(ev.power.eclipseNeedWh)} Вт·ч; безопасно расходуется 70% ёмкости.`, `The longest eclipse needs ${t.n(ev.power.eclipseNeedWh)} Wh; only 70% of capacity is safe to use.`)
              : t('Тени нет, или источник не зависит от Солнца.', 'No eclipse here, or the source does not depend on the Sun.'),
          cards: allowed(BATTERIES).map((b) => ({
            ...base(b.id, b.name, b.desc, `battery_${b.id}`),
            stats: [
              { label: t('Доступно', 'Usable'), value: `${t.n(b.wh * 0.7)} ${t('Вт·ч', 'Wh')}` },
              { label: t('Масса', 'Mass'), value: kg(b.mass, 1) },
              { label: t('Цена', 'Cost'), value: t.money(b.cost) },
            ],
          })),
          selected: [design.battery],
          pick: (id) => ({ battery: id }),
        },
      ];
    }
    case 'platform':
      return [
        {
          kind: 'rail',
          id: 'adcs',
          title: t('Ориентация', 'Attitude control'),
          cards: allowed(ADCS).map((a) => ({
            ...base(a.id, a.name, a.desc, a.id === 'magnetic' ? 'adcs_torquer' : a.id === 'wheels' ? 'adcs_wheels' : 'adcs_precise'),
            stats: [
              { label: t('Наведение', 'Pointing'), value: t(POINTING[a.pointing]) },
              { label: t('Масса', 'Mass'), value: kg(a.mass, 1) },
              { label: t('Мощность', 'Power'), value: w(a.power) },
              { label: t('Цена', 'Cost'), value: t.money(a.cost) },
            ],
            warning: a.magneticOnly && orbit && !orbit.magnetic ? t('Здесь нет магнитного поля Земли', 'No Earth magnetic field here') : undefined,
          })),
          selected: [design.adcs],
          pick: (id) => ({ adcs: id }),
        },
        {
          kind: 'rail',
          id: 'propulsion',
          title: t('Двигатель', 'Propulsion'),
          hint:
            ev.dv.total > 0
              ? t(`Манёвры: ${t.n(ev.dv.total)} м/с. Топлива нужно ${t.n(ev.mass.propellant)} кг.`, `Manoeuvres: ${t.n(ev.dv.total)} m/s, needing ${t.n(ev.mass.propellant)} kg of propellant.`)
              : t('Чем выше удельный импульс, тем меньше топлива на тот же манёвр.', 'The higher the specific impulse, the less propellant the same manoeuvre takes.'),
          cards: allowed(PROPULSION).map((p) => ({
            ...base(p.id, p.name, p.desc, `eng_${p.id}`),
            stats: [
              { label: t('Удельный импульс', 'Specific impulse'), value: p.isp ? `${t.n(p.isp)} ${t('с', 's')}` : '—' },
              { label: t('Масса', 'Mass'), value: kg(p.mass) },
              { label: t('Цена', 'Cost'), value: t.money(p.cost) },
            ],
          })),
          selected: [design.propulsion],
          pick: (id) => ({ propulsion: id }),
        },
        {
          kind: 'rail',
          id: 'structure',
          title: t('Корпус', 'Structure'),
          cards: allowed(STRUCTURES).map((s) => ({
            ...base(s.id, s.name, s.desc, `structure_${s.id}`),
            stats: [
              { label: t('Доля массы', 'Mass share'), value: t.pct(s.fraction) },
              { label: t('Цена', 'Cost'), value: t.money(s.baseCost + s.costPerKg * ev.mass.structure) },
            ],
          })),
          selected: [design.structure],
          pick: (id) => ({ structure: id }),
        },
      ];
    case 'comms':
      return [
        {
          kind: 'rail',
          id: 'antenna',
          title: t('Антенна', 'Antenna'),
          hint: t(`Приборы создают ${t.n(ev.data.generated, 1)} ГБ в сутки.`, `The instruments produce ${t.n(ev.data.generated, 1)} GB a day.`),
          cards: allowed(ANTENNAS).map((a) => ({
            ...base(a.id, a.name, a.desc, `ant_${a.id}`),
            stats: [
              { label: orbit ? t('Скорость здесь', 'Rate here') : t('Скорость', 'Rate'), value: `${t.n(a.mbps * (orbit?.commsFactor ?? 1) * ground.gain, 2)} ${t('Мбит/с', 'Mbit/s')}` },
              { label: t('Наведение', 'Pointing'), value: t(POINTING[a.pointing]) },
              { label: t('Мощность', 'Power'), value: w(a.power) },
              { label: t('Цена', 'Cost'), value: t.money(a.cost) },
            ],
          })),
          selected: [design.comms],
          pick: (id) => ({ comms: id }),
        },
        {
          kind: 'rail',
          id: 'ground',
          title: t('Наземные станции', 'Ground stations'),
          cards: GROUNDS.map((g) => ({
            ...base(g.id, g.name, g.desc, `ground_${g.id}`),
            stats: [
              { label: t('Связь в сутки', 'Contact per day'), value: orbit ? `${t.n(orbit.contact[g.id], 1)} ${t('ч', 'h')}` : '—' },
              { label: t('Усиление', 'Gain'), value: `×${t.n(g.gain, 1)}` },
              { label: t('Цена в год', 'Cost per year'), value: t.money(g.yearlyCost) },
            ],
          })),
          selected: [design.ground],
          pick: (id) => ({ ground: id as Design['ground'] }),
        },
        {
          kind: 'rail',
          id: 'computer',
          title: t('Бортовой компьютер', 'Onboard computer'),
          hint: t('За пределами низких орбит электронике нужна защита от радиации.', 'Beyond low orbits the electronics need radiation protection.'),
          cards: allowed(COMPUTERS).map((c) => ({
            ...base(c.id, c.name, c.desc, `computer_${c.id}`),
            stats: [
              { label: t('Память', 'Storage'), value: `${t.n(c.storage)} ${t('ГБ', 'GB')}` },
              { label: t('Сжатие', 'Compression'), value: c.compression < 1 ? `−${t.n((1 - c.compression) * 100)}%` : '—' },
              { label: t('Мощность', 'Power'), value: w(c.power) },
              { label: t('Цена', 'Cost'), value: t.money(c.cost) },
            ],
          })),
          selected: [design.computer],
          pick: (id) => ({ computer: id }),
        },
      ];
    case 'plan':
      return [
        {
          kind: 'rail',
          id: 'vehicle',
          title: t('Ракета-носитель', 'Launch vehicle'),
          hint: t(`Аппарат с топливом весит ${t.n(ev.mass.wet)} кг.`, `The fuelled spacecraft weighs ${t.n(ev.mass.wet)} kg.`),
          cards: allowed(VEHICLES).map((v) => {
            const reach = !orbit || v.reach.includes(orbit.id);
            return {
              ...base(v.id, v.name, v.desc, v.id),
              tall: true,
              stats: [
                {
                  label: orbit ? t('Груз сюда', 'Payload here') : t('На низкую орбиту', 'To low orbit'),
                  value: reach ? kg(v.leoKg * (orbit?.capFactor ?? 1)) : '—',
                },
                { label: t('Надёжность', 'Reliability'), value: t.pct(v.reliability) },
                { label: t('Цена', 'Cost'), value: t.money(v.cost) },
              ],
              warning: reach ? undefined : t('Не долетит до этой орбиты', 'Cannot reach this orbit'),
            };
          }),
          selected: [design.vehicle ?? ''],
          pick: (id) => ({ vehicle: id }),
        },
        {
          kind: 'years',
          id: 'years',
          title: t('Срок работы на орбите', 'Time in orbit'),
          hint: t(
            `Заказчик просит ${sc.targetYears} г. Каждый год — зарплаты команды, аренда станций, топливо на удержание орбиты и износ.`,
            `The customer asks for ${sc.targetYears} years. Each year means salaries, station fees, station-keeping fuel and wear.`,
          ),
        },
        {
          kind: 'rail',
          id: 'testing',
          title: t('Испытания на Земле', 'Ground testing'),
          cards: TESTING.map((x) => ({
            ...base(x.id, x.name, x.desc, `testing_${x.id}`),
            stats: [
              { label: t('Отказы в полёте', 'Failures in flight'), value: `×${t.n(x.failFactor, 1)}` },
              { label: t('Срок', 'Time'), value: t(`+${x.months} мес.`, `+${x.months} mo`) },
              { label: t('Цена', 'Cost'), value: t.money(x.cost) },
            ],
          })),
          selected: [design.testing],
          pick: (id) => ({ testing: id as Design['testing'] }),
        },
        ...(advanced
          ? [
              {
                kind: 'rail' as const,
                id: 'redundancy',
                title: t('Резервирование', 'Redundancy'),
                cards: REDUNDANCY.map((r) => ({ ...base(r.id, r.name, r.desc, `redundancy_${r.id}`), stats: [] })),
                selected: [design.redundancy],
                pick: (id: string) => ({ redundancy: id as Design['redundancy'] }),
              },
            ]
          : []),
      ];
  }
}

/** The four numbers a card's delta chips compare: what choosing it does to the mission. */
export function deltas(now: Evaluation, next: Evaluation) {
  return {
    mass: next.mass.wet - now.mass.wet,
    power: next.power.load - now.power.load,
    cost: next.cost.total - now.cost.total,
    science: next.science.projected - now.science.projected,
    blockers: next.blockers - now.blockers,
  };
}
