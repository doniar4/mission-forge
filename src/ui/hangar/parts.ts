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
  TIERS,
  VEHICLES,
  byId,
} from '../../engine/catalog';
import { launchPrice } from '../../engine/evaluate';
import { scenarioOrbits } from '../../engine/scenarios';
import type { Design, Evaluation, L, Measure, Role, Scenario } from '../../engine/types';
import type { Translator } from '../../i18n';

/*
 * What the hangar's part slider shows, section by section. Each group is one decision:
 * a row of cards, each card one catalogue item with a Blender render (public/thumbs) and
 * the numbers that matter for that decision.
 */

export type SectionId = 'brief' | 'orbit' | 'rocket' | 'payload' | 'power' | 'platform' | 'comms' | 'plan';

/** The four segments of a space mission, as mission architecture names them. */
export const SEGMENTS: Record<'user' | 'space' | 'launch' | 'ground', L> = {
  user: { ru: 'Пользователь', en: 'User' },
  space: { ru: 'Космос', en: 'Space' },
  launch: { ru: 'Запуск', en: 'Launch' },
  ground: { ru: 'Земля', en: 'Ground' },
};

export const SECTIONS: { id: SectionId; role: Role; name: L; focus: string[]; segment: keyof typeof SEGMENTS }[] = [
  // The customer and what they need: the user segment.
  { id: 'brief', role: 'manager', name: { ru: 'Задача', en: 'Objective' }, focus: [], segment: 'user' },
  { id: 'orbit', role: 'science', name: { ru: 'Орбита', en: 'Orbit' }, focus: [], segment: 'space' },
  // The rocket comes before the spacecraft: it sets the mass limit everything else has to fit.
  { id: 'rocket', role: 'manager', name: { ru: 'Ракета', en: 'Rocket' }, focus: [], segment: 'launch' },
  { id: 'payload', role: 'science', name: { ru: 'Приборы', en: 'Instruments' }, focus: ['inst:'], segment: 'space' },
  { id: 'power', role: 'engineer', name: { ru: 'Энергия', en: 'Power' }, focus: ['power:'], segment: 'space' },
  { id: 'platform', role: 'engineer', name: { ru: 'Платформа', en: 'Platform' }, focus: ['adcs:', 'propulsion:'], segment: 'space' },
  { id: 'comms', role: 'comms', name: { ru: 'Связь', en: 'Comms' }, focus: ['comms:'], segment: 'ground' },
  { id: 'plan', role: 'manager', name: { ru: 'План', en: 'Plan' }, focus: [], segment: 'space' },
];

/** Which section fixes which review finding. */
export const WHERE: Record<string, SectionId> = {
  no_orbit: 'orbit',
  no_instruments: 'payload',
  uncovered: 'payload',
  no_vehicle: 'rocket',
  vehicle_reach: 'rocket',
  overweight: 'rocket',
  mass_margin: 'rocket',
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

/** The short lesson behind each section: why this decision matters, in one sentence. */
export const LESSONS: Record<SectionId, L> = {
  brief: {
    ru: 'Цель — передать на Землю нужный объём науки за срок заказчика. Путей к ней несколько.',
    en: 'The goal is to send home enough science within the customer’s time. There is more than one way.',
  },
  orbit: {
    ru: 'Орбита решает, что увидят приборы, сколько света получат панели и сколько груза довезёт ракета.',
    en: 'The orbit decides what the instruments see, how much light the arrays get and how much a rocket can carry.',
  },
  rocket: {
    ru: 'Ракета задаёт предел массы: всё, что вы поставите на аппарат, должно в неё поместиться.',
    en: 'The rocket sets the mass limit: everything you put on the spacecraft has to fit.',
  },
  payload: {
    ru: 'Каждый прибор добавляет массу, энергию, данные и цену. Берите то, что нужно задаче.',
    en: 'Every instrument adds mass, power, data and cost. Take what the objective needs.',
  },
  power: {
    ru: 'Панели работают только на свету, в тени аппарат живёт на батарее.',
    en: 'Arrays work only in sunlight; in shadow the spacecraft lives on its battery.',
  },
  platform: {
    ru: 'Ориентация наводит приборы, двигатель держит орбиту. Топливо растёт быстрее, чем манёвр.',
    en: 'Attitude control points the instruments, the engine holds the orbit. Fuel grows faster than the burn.',
  },
  comms: {
    ru: 'До Земли доходит скорость антенны × время связи. Чем дальше аппарат, тем слабее сигнал.',
    en: 'What reaches Earth is antenna rate × contact time. The farther away, the fainter the signal.',
  },
  plan: {
    ru: 'Испытания и резерв стоят денег, но в космосе ничего не починить.',
    en: 'Testing and backups cost money, but nothing can be repaired in space.',
  },
};

/** Card descriptions start with the class ("Entry class. …"); the badge already says it. */
const withoutClass = (s: string) => s.replace(/^(Базовый|Стандартный|Профессиональный) класс\.\s*|^(Entry|Standard|Professional) class\.\s*/, '');

export interface Card {
  id: string;
  name: string;
  desc: string;
  thumb: string;
  /** Portrait art (rockets). */
  tall?: boolean;
  /** Instrument class, 1 entry to 3 professional. */
  tier?: { level: 1 | 2 | 3; name: string };
  stats: { label: string; value: string }[];
  /** Tags such as measurements; `good` marks what the mission needs. */
  tags?: { text: string; good?: boolean; key?: boolean }[];
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
      // One tab per class: cheap and light, the working standard, the best money can buy.
      const useful = (i: (typeof INSTRUMENTS)[number]) => (Object.keys(i.measures) as Measure[]).reduce((a, m) => a + (sc.weights[m] ?? 0) * i.measures[m]!, 0);
      // A beginner's signpost: instruments that do a main job of this mission well, and ones it does not need at all.
      const key = (i: (typeof INSTRUMENTS)[number]) => !sc.sandbox && (Object.keys(i.measures) as Measure[]).some((m) => (sc.weights[m] ?? 0) >= 0.2 && i.measures[m]! >= 0.4);
      const HINT: Record<1 | 2 | 3, L> = {
        1: { ru: 'Дёшево и легко: хватит примерно на половину цели.', en: 'Cheap and light: good for about half the goal.' },
        2: { ru: 'Рабочий стандарт: набор таких приборов выполняет цель.', en: 'The working standard: a set of these meets the goal.' },
        3: { ru: 'Лучшее качество за большую массу, энергию и цену.', en: 'The best quality, for more mass, power and money.' },
      };
      return ([1, 2, 3] as const).map((tier) => {
        const list = allowed(INSTRUMENTS.filter((i) => i.tier === tier)).sort((a, b) => useful(b) - useful(a));
        const on = design.instruments.filter((id) => list.some((i) => i.id === id)).length;
        return {
          kind: 'rail' as const,
          id: `payload-${tier}`,
          multi: true,
          title: `${t(TIERS[tier]).replace(/ класс$| class$/, '')}${on ? ` · ${on}` : ''}`,
          hint: t(HINT[tier]),
          cards: list.map((i) => ({
            ...base(i.id, i.name, { ru: withoutClass(i.desc.ru), en: withoutClass(i.desc.en) }, `inst_${i.id}`),
            tier: { level: i.tier, name: t(TIERS[i.tier]) },
            note: !sc.sandbox && useful(i) === 0 ? t('Этой миссии он не нужен.', 'This mission does not need it.') : undefined,
            stats: [
              { label: t('Масса', 'Mass'), value: kg(i.mass, i.mass < 1 ? 1 : 0) },
              { label: t('Мощность', 'Power'), value: w(i.power) },
              { label: t('Данные', 'Data'), value: `${t.n(i.data, i.data < 1 ? 2 : 0)} ${t('ГБ/сут', 'GB/day')}` },
              { label: t('Цена', 'Cost'), value: t.money(i.cost) },
            ],
            // Only what this mission measures, and the one demand that changes the platform.
            tags: [
              ...(key(i) ? [{ text: t('Ключевой для задачи', 'Key for this mission'), key: true }] : []),
              ...(Object.keys(i.measures) as Measure[])
                .filter((m) => sc.sandbox || (sc.weights[m] ?? 0) > 0)
                .map((m) => ({ text: t(MEASURES[m]), good: !sc.sandbox })),
              ...(i.pointing === 3 ? [{ text: t('точное наведение', 'fine pointing') }] : []),
            ],
          })),
          selected: design.instruments,
          pick: (id: string) => ({ instruments: design.instruments.includes(id) ? design.instruments.filter((x) => x !== id) : [...design.instruments, id] }),
        };
      });
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
    case 'rocket':
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
                // A rideshare is priced by the kilogram: show what this spacecraft would pay.
                { label: v.costPerKg ? t('Цена за ваш аппарат', 'Price for yours') : t('Цена', 'Cost'), value: t.money(launchPrice(v, ev.mass.wet)) },
              ],
              warning: reach ? undefined : t('Не долетит до этой орбиты', 'Cannot reach this orbit'),
            };
          }),
          selected: [design.vehicle ?? ''],
          pick: (id) => ({ vehicle: id }),
        },
      ];
    case 'plan':
      return [
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
    blockers: next.blockers - now.blockers,
  };
}
