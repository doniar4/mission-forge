import { ADCS, ANTENNAS, INSTRUMENTS, POWER, TESTING, byId, pick } from './catalog';
import type { DevEvent, DevKind, DevRecord, Design, Difficulty, L, Role, Scenario } from './types';

export type { DevEvent, DevKind, DevRecord };

/*
 * Development: the months between the finished design and the launch pad, played as a few
 * events. Real projects rarely end up as drawn: instruments grow heavier, the customer trims the
 * budget, a supplier is late, a test breaks something. Each event offers two or three ways out,
 * each with its own price in mass, money, months, science or risk.
 *
 * The events are drawn once, from a seed, when development starts, and stored in the design
 * (`Design.dev`), so a team, a saved game and a shared link all see the same ones. What they do
 * is recomputed from the design every time (`devMods`): an instrument that grew heavier and was
 * later taken off weighs nothing.
 *
 * Pure and deterministic, like the rest of the engine.
 */

/** What development has done to the design, on top of the catalogue numbers. */
export interface DevMods {
  /** Mass growth of individual instruments (share). */
  instMass: Record<string, number>;
  cost: number;
  months: number;
  /** Multiplier on the customer's budget. */
  budget: number;
  /** Multiplier on the power the arrays deliver. */
  power: number;
  /** Multiplier on random failures in flight. */
  risk: number;
}

export const NO_MODS: DevMods = { instMass: {}, cost: 0, months: 0, budget: 1, power: 1, risk: 1 };

export interface DevOption {
  id: string;
  label: L;
  /** What it costs, in words and numbers. */
  note: L;
}

/** Small deterministic generator, separate from the flight's so drawing events never shifts a flight. */
function rng(seed: number) {
  let a = (seed ^ 0x5bd1e995) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many events each difficulty brings, and how hard they hit. */
const PRESSURE: Record<Difficulty, { count: number; scale: number }> = {
  cadet: { count: 2, scale: 0.7 },
  engineer: { count: 3, scale: 1 },
  director: { count: 4, scale: 1.25 },
};

const round = (x: number, step: number) => Math.round(x / step) * step;

/** Instruments the mission measures with and the design does not carry: candidates for a gift. */
function giftFor(d: Design, sc: Scenario): string | undefined {
  return INSTRUMENTS.filter(
    (i) => i.tier === 1 && !d.instruments.includes(i.id) && Object.keys(i.measures).some((m) => (sc.weights as Record<string, number>)[m] > 0),
  ).map((i) => i.id)[0];
}

/** Draws the development events for a design. Call once, when development starts. */
export function makeDev(d: Design, sc: Scenario, diff: Difficulty, seed: number): DevRecord {
  const r = rng(seed);
  const { count, scale } = PRESSURE[diff];
  const pool: { kind: DevKind; weight: number }[] = [
    { kind: 'mass', weight: d.instruments.length ? 1.4 : 0 },
    { kind: 'budget', weight: 1 },
    { kind: 'delay', weight: 1 },
    { kind: 'power', weight: pick(POWER, d.power).solar ? 1 : 0 },
    { kind: 'test', weight: diff === 'cadet' ? 0 : 1 },
    { kind: 'gift', weight: giftFor(d, sc) ? 0.6 : 0 },
  ];
  const events: DevEvent[] = [];
  while (events.length < count) {
    const open = pool.filter((p) => p.weight > 0 && !events.some((e) => e.kind === p.kind));
    if (open.length === 0) break;
    const total = open.reduce((a, p) => a + p.weight, 0);
    let x = r() * total;
    const kind = (open.find((p) => (x -= p.weight) < 0) ?? open[open.length - 1]).kind;
    switch (kind) {
      case 'mass': {
        // Heavier, newer instruments are the ones that grow.
        const list = d.instruments.map((id) => byId(INSTRUMENTS, id)!).filter(Boolean);
        const sum = list.reduce((a, i) => a + i.mass * i.tier, 0);
        let y = r() * sum;
        const inst = list.find((i) => (y -= i.mass * i.tier) < 0) ?? list[0];
        events.push({ kind, target: inst.id, size: round((0.1 + r() * 0.15) * scale, 0.05), role: 'science' });
        break;
      }
      case 'budget':
        events.push({ kind, size: round((0.04 + r() * 0.05) * scale, 0.01), role: 'manager' });
        break;
      case 'delay': {
        const target = (['comms', 'power', 'adcs'] as const)[Math.floor(r() * 3)];
        events.push({ kind, target, size: Math.max(2, Math.round((3 + r() * 3) * scale)), role: target === 'comms' ? 'comms' : 'engineer' });
        break;
      }
      case 'power':
        events.push({ kind, size: round((0.06 + r() * 0.06) * scale, 0.01), role: 'engineer' });
        break;
      case 'test':
        events.push({ kind, size: round(1.5 + r() * 0.4 * scale, 0.1), role: 'manager' });
        break;
      case 'gift':
        events.push({ kind, target: giftFor(d, sc)!, size: 0, role: 'science' });
        break;
    }
  }
  return { seed, events, choices: events.map(() => null) };
}

export const devStarted = (d: Design) => !!d.dev && d.dev.events.length > 0;
export const devDone = (d: Design) => !!d.dev && d.dev.choices.every((c) => c !== null);

/** The part one step simpler than the current one, for a supplier delay ("take what is on the shelf"). */
function simpler(d: Design, target: string): Partial<Design> | null {
  const list = target === 'comms' ? ANTENNAS : target === 'power' ? POWER.filter((p) => p.solar) : ADCS;
  const key = target === 'comms' ? 'comms' : target === 'power' ? 'power' : 'adcs';
  const i = list.findIndex((x) => x.id === d[key]);
  return i > 0 ? { [key]: list[i - 1].id } : null;
}

/** One step less testing, if there is one. */
function lighterTests(d: Design): Partial<Design> | null {
  const i = TESTING.findIndex((x) => x.id === d.testing);
  return i > 0 ? { testing: TESTING[i - 1].id } : null;
}

/** The next larger solar array, if there is one. */
function biggerArrays(d: Design): Partial<Design> | null {
  const list = POWER.filter((p) => p.solar);
  const i = list.findIndex((x) => x.id === d.power);
  return i >= 0 && i < list.length - 1 ? { power: list[i + 1].id } : null;
}

const PART: Record<string, L> = {
  comms: { ru: 'антенны', en: 'the antenna' },
  power: { ru: 'солнечных панелей', en: 'the solar arrays' },
  adcs: { ru: 'системы ориентации', en: 'the attitude control system' },
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const money = (x: number): L =>
  x < 0.995 ? { ru: `$${Math.round(x * 1000)} тыс.`, en: `$${Math.round(x * 1000)}k` } : { ru: `$${(Math.round(x * 10) / 10).toString().replace('.', ',')} млн`, en: `$${Math.round(x * 10) / 10}M` };

/** What an event says and which ways out it offers, for this design. */
export function describe(e: DevEvent, d: Design): { title: L; text: L; options: DevOption[] } {
  switch (e.kind) {
    case 'mass': {
      const inst = byId(INSTRUMENTS, e.target ?? null);
      const name = inst?.name ?? { ru: 'прибор', en: 'an instrument' };
      const kg = inst ? Math.round(inst.mass * e.size * 10) / 10 : 0;
      const slim = inst ? slimCost(inst.cost) : 0;
      return {
        title: { ru: `Прибор потяжелел: ${name.ru}`, en: `An instrument grew heavier: ${name.en}` },
        text: {
          ru: `Готовый образец весит на ${pct(e.size)} больше чертежа (+${kg} кг). Так бывает почти всегда: поэтому инженеры и держат запас массы.`,
          en: `The finished unit weighs ${pct(e.size)} more than drawn (+${kg} kg). It nearly always happens, which is why engineers keep a mass margin.`,
        },
        options: [
          { id: 'accept', label: { ru: 'Принять лишнюю массу', en: 'Accept the extra mass' }, note: { ru: `+${kg} кг`, en: `+${kg} kg` } },
          {
            id: 'slim',
            label: { ru: 'Облегчить конструкцию', en: 'Lighten the design' },
            note: { ru: `${money(slim).ru} и +2 мес.`, en: `${money(slim).en} and +2 months` },
          },
          { id: 'drop', label: { ru: 'Снять прибор', en: 'Take it off' }, note: { ru: 'меньше науки', en: 'less science' } },
        ],
      };
    }
    case 'budget':
      return {
        title: { ru: 'Заказчик урезал бюджет', en: 'The customer cut the budget' },
        text: {
          ru: `Бюджет сокращают на ${pct(e.size)}. Можно согласиться или отстоять часть денег, но переговоры и пересмотр проекта займут время.`,
          en: `The budget is cut by ${pct(e.size)}. You can accept it, or fight for part of the money, but the talks and the design review take time.`,
        },
        options: [
          { id: 'accept', label: { ru: 'Согласиться', en: 'Accept' }, note: { ru: `бюджет −${pct(e.size)}`, en: `budget −${pct(e.size)}` } },
          {
            id: 'argue',
            label: { ru: 'Отстоять половину', en: 'Win back half' },
            note: { ru: `бюджет −${pct(e.size / 2)} и +3 мес.`, en: `budget −${pct(e.size / 2)} and +3 months` },
          },
          ...(lighterTests(d)
            ? [
                {
                  id: 'cut',
                  label: { ru: 'Согласиться и сократить испытания', en: 'Accept and cut the tests' },
                  note: { ru: `бюджет −${pct(e.size)}, испытания дешевле, отказов больше`, en: `budget −${pct(e.size)}, cheaper tests, more failures` },
                },
              ]
            : []),
        ],
      };
    case 'delay': {
      const part = PART[e.target ?? 'comms'];
      const swap = simpler(d, e.target ?? 'comms');
      const rush = rushCost(e.size);
      return {
        title: { ru: `Поставщик ${part.ru} опаздывает`, en: `The supplier of ${part.en} is late` },
        text: {
          ru: `Деталь будет готова на ${e.size} мес. позже. Ждать, платить за срочность или ставить то, что есть на складе?`,
          en: `The part will be ${e.size} months late. Wait, pay to rush it, or fit what is on the shelf?`,
        },
        options: [
          { id: 'wait', label: { ru: 'Ждать', en: 'Wait' }, note: { ru: `+${e.size} мес.`, en: `+${e.size} months` } },
          { id: 'rush', label: { ru: 'Заплатить за срочность', en: 'Pay to rush it' }, note: { ru: `${money(rush).ru} и +1 мес.`, en: `${money(rush).en} and +1 month` } },
          ...(swap
            ? [{ id: 'swap', label: { ru: 'Взять попроще со склада', en: 'Fit a simpler one in stock' }, note: { ru: 'без задержки, но слабее', en: 'no delay, but weaker' } }]
            : []),
        ],
      };
    }
    case 'power': {
      const bigger = biggerArrays(d);
      return {
        title: { ru: 'Панели дают меньше обещанного', en: 'The arrays deliver less than promised' },
        text: {
          ru: `Испытания показали: солнечные элементы вырабатывают на ${pct(e.size)} меньше паспорта. Энергии на борту станет меньше на весь полёт.`,
          en: `Tests show the solar cells produce ${pct(e.size)} less than their datasheet. There will be less power on board for the whole flight.`,
        },
        options: [
          { id: 'accept', label: { ru: 'Лететь с тем, что есть', en: 'Fly with what we have' }, note: { ru: `энергия −${pct(e.size)}`, en: `power −${pct(e.size)}` } },
          ...(bigger
            ? [{ id: 'bigger', label: { ru: 'Поставить панели больше', en: 'Fit bigger arrays' }, note: { ru: 'масса и цена больших панелей', en: 'the mass and price of bigger arrays' } }]
            : []),
          { id: 'requal', label: { ru: 'Заменить партию элементов', en: 'Replace the batch of cells' }, note: { ru: `${money(0.4).ru} и +1 мес.`, en: `${money(0.4).en} and +1 month` } },
        ],
      };
    }
    case 'test': {
      const retest = retestCost(d);
      return {
        title: { ru: 'Вибростенд: треснул кронштейн', en: 'Shake test: a bracket cracked' },
        text: {
          ru: 'Аппарат не пережил имитацию старта целиком. Кронштейн заменили, но что ещё ослабло, покажут только повторные испытания.',
          en: 'The spacecraft did not survive the simulated launch intact. The bracket was replaced, but only a repeat test will show what else was weakened.',
        },
        options: [
          { id: 'retest', label: { ru: 'Повторить испытания', en: 'Repeat the tests' }, note: { ru: `${money(retest).ru} и +2 мес.`, en: `${money(retest).en} and +2 months` } },
          { id: 'fly', label: { ru: 'Лететь как есть', en: 'Fly as it is' }, note: { ru: `отказы в полёте ×${String(e.size).replace('.', ',')}`, en: `failures in flight ×${e.size}` } },
        ],
      };
    }
    case 'gift': {
      const inst = byId(INSTRUMENTS, e.target ?? null);
      const name = inst?.name ?? { ru: 'прибор', en: 'an instrument' };
      return {
        title: { ru: `Партнёр предлагает прибор: ${name.ru}`, en: `A partner offers an instrument: ${name.en}` },
        text: {
          ru: 'Университет-партнёр отдаёт готовый прибор бесплатно. Деньги не нужны, но масса, энергия и данные — ваши.',
          en: 'A partner university gives you a finished instrument for free. No money, but its mass, power and data are yours to carry.',
        },
        options: [
          {
            id: 'take',
            label: { ru: 'Взять на борт', en: 'Take it on board' },
            note: inst ? { ru: `+${inst.mass} кг, +${inst.power} Вт`, en: `+${inst.mass} kg, +${inst.power} W` } : { ru: '', en: '' },
          },
          { id: 'decline', label: { ru: 'Отказаться', en: 'Decline' }, note: { ru: 'ничего не меняется', en: 'nothing changes' } },
        ],
      };
    }
  }
}

const slimCost = (instCost: number) => Math.round((0.3 + 0.4 * instCost) * 100) / 100;
const rushCost = (months: number) => Math.round((0.2 + 0.15 * months) * 100) / 100;
const retestCost = (d: Design) => Math.round((0.3 + 0.5 * (byId(TESTING, d.testing) ?? TESTING[1]).cost) * 100) / 100;

/** The design change an option makes the moment it is chosen (taking a part off, fitting another). */
function patchFor(e: DevEvent, choice: string, d: Design): Partial<Design> {
  if (e.kind === 'mass' && choice === 'drop') return { instruments: d.instruments.filter((x) => x !== e.target) };
  if (e.kind === 'delay' && choice === 'swap') return simpler(d, e.target ?? 'comms') ?? {};
  if (e.kind === 'power' && choice === 'bigger') return biggerArrays(d) ?? {};
  if (e.kind === 'budget' && choice === 'cut') return lighterTests(d) ?? {};
  if (e.kind === 'gift' && choice === 'take' && e.target && !d.instruments.includes(e.target)) return { instruments: [...d.instruments, e.target] };
  return {};
}

/** Records a choice and makes the design change it implies. Unknown or repeated choices change nothing. */
export function chooseDev(d: Design, index: number, choice: string): Design {
  const dev = d.dev;
  if (!dev || index < 0 || index >= dev.events.length || dev.choices[index] !== null) return d;
  const e = dev.events[index];
  if (!describe(e, d).options.some((o) => o.id === choice)) return d;
  const choices = dev.choices.map((c, i) => (i === index ? choice : c));
  return { ...d, ...patchFor(e, choice, d), dev: { ...dev, choices } };
}

/** What the decided events do to the design now. */
export function devMods(d: Design): DevMods {
  const dev = d.dev;
  if (!dev) return NO_MODS;
  const m: DevMods = { instMass: {}, cost: 0, months: 0, budget: 1, power: 1, risk: 1 };
  dev.events.forEach((e, i) => {
    const c = dev.choices[i];
    if (!c) return;
    switch (e.kind) {
      case 'mass': {
        const inst = byId(INSTRUMENTS, e.target ?? null);
        if (!inst || !d.instruments.includes(inst.id)) return;
        if (c === 'accept') m.instMass[inst.id] = (m.instMass[inst.id] ?? 0) + e.size;
        if (c === 'slim') {
          m.cost += slimCost(inst.cost);
          m.months += 2;
        }
        return;
      }
      case 'budget':
        // 'cut' takes the whole cut; its saving is the cheaper testing it switched to.
        m.budget *= 1 - (c === 'argue' ? e.size / 2 : e.size);
        if (c === 'argue') m.months += 3;
        return;
      case 'delay':
        if (c === 'wait') m.months += e.size;
        if (c === 'rush') {
          m.cost += rushCost(e.size);
          m.months += 1;
        }
        return;
      case 'power':
        if (c === 'accept') m.power *= 1 - e.size;
        if (c === 'requal') {
          m.cost += 0.4;
          m.months += 1;
        }
        return;
      case 'test':
        if (c === 'retest') {
          m.cost += retestCost(d);
          m.months += 2;
        }
        if (c === 'fly') m.risk *= e.size;
        return;
      case 'gift': {
        const inst = byId(INSTRUMENTS, e.target ?? null);
        // The partner's gift costs nothing: take its price back off the bill.
        if (c === 'take' && inst && d.instruments.includes(inst.id)) m.cost -= inst.cost;
        return;
      }
    }
  });
  return m;
}

/** Keeps a development record from outside (storage, a link, the network) well-formed. */
export function cleanDev(raw: unknown): DevRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<DevRecord>;
  if (!Array.isArray(r.events) || !Array.isArray(r.choices) || r.events.length !== r.choices.length || r.events.length > 6) return undefined;
  const kinds: DevKind[] = ['mass', 'budget', 'delay', 'power', 'test', 'gift'];
  const roles: Role[] = ['manager', 'science', 'engineer', 'comms'];
  const events: DevEvent[] = [];
  for (const e of r.events as Partial<DevEvent>[]) {
    if (!e || !kinds.includes(e.kind as DevKind) || typeof e.size !== 'number' || !Number.isFinite(e.size) || !roles.includes(e.role as Role)) return undefined;
    // Sizes stay in a sane band whatever a hand-edited link says.
    const size = e.kind === 'delay' ? Math.min(12, Math.max(0, Math.round(e.size))) : e.kind === 'test' ? Math.min(3, Math.max(1, e.size)) : Math.min(0.6, Math.max(0, e.size));
    events.push({ kind: e.kind as DevKind, size, role: e.role as Role, ...(typeof e.target === 'string' ? { target: e.target.slice(0, 32) } : {}) });
  }
  const choices = (r.choices as unknown[]).map((c) => (typeof c === 'string' ? c.slice(0, 16) : null));
  return { seed: Number(r.seed) >>> 0, events, choices };
}

/** How many events a difficulty brings (for texts). */
export const devEventCount = (diff: Difficulty) => PRESSURE[diff].count;
