import {
  ADCS,
  ANTENNAS,
  BATTERIES,
  COMPUTERS,
  DIFFICULTY,
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
  pick,
} from './catalog';
import type {
  Check,
  Design,
  Difficulty,
  Evaluation,
  Instrument,
  L,
  Measure,
  Orbit,
  Role,
  Scenario,
} from './types';

export const G0 = 9.80665;
/** Harness, thermal blankets, mechanisms: mass and power every spacecraft carries. */
const BUS_BASE_KG = 15;
const BUS_BASE_W = 20;
/** Tank mass as a share of the propellant inside it. */
const TANK = 0.1;
/** Usable share of battery capacity (deep discharge kills cells). */
const DOD = 0.7;
/** Science quality a "good" mission is expected to hold for the target years. */
const TARGET_QUALITY = 0.65;
/**
 * Worth of a year flown after the customer's target years. The first years answer the question
 * the mission was paid for; an extended mission mostly repeats them, so flying longer cannot
 * replace better instruments.
 */
export const EXTENDED_VALUE = 0.5;
/** An extended mission earns science for at most half the target years again. */
export const EXTENDED_LIMIT = 0.5;

/** Science-weighted years: full value up to the target, half value for a limited extension. */
export function scienceYears(years: number, targetYears: number): number {
  return Math.min(years, targetYears) + EXTENDED_VALUE * clamp(years - targetYears, 0, EXTENDED_LIMIT * targetYears);
}
const REDUNDANT_MASS = 1.15;
const REDUNDANT_COST = 1.25;

export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function resolve(d: Design) {
  return {
    orbit: byId(ORBITS, d.orbit) ?? null,
    insts: d.instruments.map((id) => byId(INSTRUMENTS, id)).filter((x): x is Instrument => !!x),
    pw: pick(POWER, d.power),
    bat: pick(BATTERIES, d.battery),
    ant: pick(ANTENNAS, d.comms),
    gr: pick(GROUNDS, d.ground),
    cpu: pick(COMPUTERS, d.computer),
    adcs: pick(ADCS, d.adcs),
    prop: pick(PROPULSION, d.propulsion),
    st: pick(STRUCTURES, d.structure),
    veh: byId(VEHICLES, d.vehicle) ?? null,
    test: byId(TESTING, d.testing) ?? TESTING[1],
  };
}
export type Resolved = ReturnType<typeof resolve>;
export type Flying = Resolved & { orbit: Orbit };

/**
 * Share of its own quality that a second instrument adds to a measurement already covered: it
 * mostly sees what the first one sees, so a cheap duplicate cannot replace a better instrument.
 */
export const OVERLAP = 0.3;

/** Science quality per measurement: the best instrument counts in full, the others only partly. */
export function scienceQuality(insts: Instrument[], pointing: number, sc: Scenario) {
  const quality: Partial<Record<Measure, number>> = {};
  let total = 0;
  for (const [m, w] of Object.entries(sc.weights) as [Measure, number][]) {
    let miss = 1;
    let best = 0;
    for (const i of insts) {
      const q = i.measures[m];
      if (!q) continue;
      // An instrument that cannot be held steady still works, just blurrier.
      const steadiness = pointing >= i.pointing ? 1 : Math.pow(0.45, i.pointing - pointing);
      miss *= 1 - q * steadiness;
      best = Math.max(best, q * steadiness);
    }
    const q = best + OVERLAP * (1 - miss - best);
    quality[m] = q;
    total += w * q;
  }
  return { quality, total };
}

/** Things that change during flight. Evaluation uses a pristine state; the simulation mutates it. */
export interface FlightState {
  years: number;
  arrayFactor: number;
  rateFactor: number;
  pointingLoss: number;
  active: Instrument[];
  /** Share of ground contacts that happen this month. */
  contactFactor: number;
}

/** One snapshot of how the spacecraft performs: power, data and science rate. */
export function performance(r: Flying, sc: Scenario, s: FlightState) {
  const { orbit, pw } = r;
  const busLoad = BUS_BASE_W + r.cpu.power + r.ant.power + r.adcs.power + orbit.heaterW;
  const instLoad = sum(s.active.map((i) => i.power));

  // Solar cells lose a few percent a year to radiation; an RTG fades as its fuel decays.
  const yearlyLoss = pw.solar ? 0.02 + 0.01 * (orbit.radiation - 1) : 0.015;
  const aging = Math.pow(1 - yearlyLoss, s.years);
  const average = pw.solar
    ? pw.watts * orbit.solarFactor * orbit.sunFraction * s.arrayFactor * aging
    : pw.watts * aging;

  // The bus is fed first; instruments get what is left.
  const instFrac = instLoad > 0 ? clamp((average - busLoad) / instLoad) : 0;
  const eclipseNeedWh = pw.solar ? (busLoad + instLoad * instFrac) * orbit.eclipseHours : 0;
  const batteryWh = r.bat.wh * DOD * Math.pow(0.96, s.years);
  const batFrac = eclipseNeedWh > 0 ? clamp(batteryWh / eclipseNeedWh) : 1;
  // With a weak battery the instruments sleep through part of every eclipse.
  const eclipseFactor = pw.solar ? orbit.sunFraction + (1 - orbit.sunFraction) * batFrac : 1;
  const duty = instFrac * eclipseFactor;

  const pointing = Math.max(1, r.adcs.pointing - s.pointingLoss);
  const { quality, total } = scienceQuality(s.active, pointing, sc);
  const orbitFit = sc.orbits[orbit.id]?.fit ?? 0;

  const generated = sum(s.active.map((i) => i.data)) * r.cpu.compression * duty;
  const aim = pointing >= r.ant.pointing ? 1 : Math.pow(0.25, r.ant.pointing - pointing);
  const rateMbps = r.ant.mbps * orbit.commsFactor * r.gr.gain * aim * s.rateFactor;
  const contactHours = orbit.contact[r.gr.id];
  // Mbit/s × hours → GB: ×3600 s ÷ 8 bits ÷ 1000.
  const downlink = rateMbps * contactHours * 0.45 * r.ant.availability * s.contactFactor;
  const storageNeed = generated * (1 - contactHours / 24) * 1.5;
  const storageFrac = storageNeed > 0 ? clamp(r.cpu.storage / storageNeed) : 1;
  const returnFraction = generated > 0 ? Math.min(1, downlink / generated) * storageFrac : 1;

  return {
    busLoad,
    instLoad,
    average,
    instFrac,
    eclipseNeedWh,
    batteryWh,
    batFrac,
    duty,
    quality,
    orbitFit,
    ratePerYear: 100 * total * orbitFit,
    generated,
    rateMbps,
    contactHours,
    downlink,
    storageNeed,
    returnFraction,
  };
}

/** Tsiolkovsky's rocket equation, including the tanks that hold the propellant. */
export function propellantFor(dryKg: number, dv: number, isp: number): number {
  if (dv <= 0 || isp <= 0) return 0;
  const k = Math.exp(dv / (isp * G0)) - 1;
  const denom = 1 - TANK * k;
  return denom > 0.02 ? (dryKg * k) / denom : Infinity;
}

export function evaluate(d: Design, sc: Scenario, diff: Difficulty): Evaluation {
  const r = resolve(d);
  const { orbit, insts, pw, bat, ant, gr, cpu, adcs, prop, st, veh, test } = r;
  const redundant = d.redundancy === 'redundant';
  const checks: Check[] = [];
  const add = (level: Check['level'], role: Role, id: string, title: L, why: L) =>
    checks.push({ id, level, role, title, why });

  // Without an orbit most numbers are meaningless, so use benign stand-in physics for the dashboard.
  const o: Orbit = orbit ?? { ...ORBITS[0], stationDv: 0, decayYears: null };
  const hasEngine = prop.isp > 0;

  // ---- Mass -------------------------------------------------------------
  const payload = sum(insts.map((i) => i.mass));
  const bus =
    (BUS_BASE_KG + pw.mass + bat.mass + ant.mass + cpu.mass + adcs.mass + prop.mass) * (redundant ? REDUNDANT_MASS : 1);
  const structure = st.fraction * (payload + bus);
  const dry0 = payload + bus + structure;

  const dvInsertion = o.insertionDv;
  const dvStation = hasEngine ? o.stationDv * d.lifeYears : 0;
  const dvDisposal = hasEngine ? o.disposalDv : 0;
  const dvTotal = dvInsertion + dvStation + dvDisposal;
  const rawProp = hasEngine ? propellantFor(dry0, dvTotal, prop.isp) : 0;
  const feasible = Number.isFinite(rawProp);
  const propellant = feasible ? rawProp : dry0 * 20;
  const dry = dry0 + propellant * TANK;
  const wet = dry + propellant;
  const reachable = !!veh && !!orbit && veh.reach.includes(orbit.id);
  const capacity = veh ? veh.leoKg * o.capFactor : 0;
  const massMargin = capacity > 0 ? (capacity - wet) / capacity : -1;

  // ---- Power, data, science --------------------------------------------
  const fresh = { years: 0, arrayFactor: 1, rateFactor: 1, pointingLoss: 0, active: insts, contactFactor: 1 };
  const flying: Flying = { ...r, orbit: o };
  const p0 = performance(flying, sc, fresh);
  const pEnd = performance(flying, sc, { ...fresh, years: d.lifeYears });
  const load = p0.busLoad + p0.instLoad;
  const eclipseNeedFull = pw.solar ? load * o.eclipseHours : 0;

  // ---- Time -------------------------------------------------------------
  const devMonths = Math.round(
    14 +
      0.7 * Math.max(0, ...insts.map((i) => i.devMonths)) +
      1.5 * insts.length +
      test.months +
      (pw.devMonths ?? 0) +
      (ant.devMonths ?? 0) +
      (prop.devMonths ?? 0) +
      (veh?.leadMonths ?? 0) +
      (redundant ? 3 : 0),
  );
  const transitMonths = o.transitMonths + (prop.lowThrust ? o.lowThrustMonths : 0);
  const decays = o.decayYears !== null && (!hasEngine || o.stationDv === 0);
  const effectiveYears = decays ? Math.min(d.lifeYears, o.decayYears!) : d.lifeYears;
  const disposalOk = o.disposalDv === 0 || hasEngine;

  // ---- Cost -------------------------------------------------------------
  const payloadCost = sum(insts.map((i) => i.cost));
  const busCost =
    (pw.cost + bat.cost + ant.cost + cpu.cost + adcs.cost + prop.cost) * (redundant ? REDUNDANT_COST : 1) +
    st.baseCost +
    st.costPerKg * structure;
  const flightYears = d.lifeYears + transitMonths / 12;
  const groundCost = gr.setupCost + gr.yearlyCost * flightYears;
  const opsCost = o.opsPerYear * (d.lifeYears + transitMonths / 24);
  // A bigger spacecraft needs a bigger team, and every month of development is a month of salaries.
  const devCost = devMonths * (0.3 + dry / 400);
  const launchCost = veh?.cost ?? 0;
  const total = payloadCost + busCost + launchCost + groundCost + opsCost + devCost + test.cost;
  const budget = Math.round(sc.budget * DIFFICULTY[diff].budget);

  // ---- Science ----------------------------------------------------------
  const target = sc.targetYears * 100 * TARGET_QUALITY;
  const projected = (p0.ratePerYear * p0.duty * p0.returnFraction * scienceYears(effectiveYears, sc.targetYears)) / target;

  // ---- Review board -----------------------------------------------------
  if (!orbit)
    add('blocker', 'science', 'no_orbit', { ru: 'Орбита не выбрана', en: 'No orbit chosen' }, {
      ru: 'От орбиты зависит всё остальное: сколько света, как далеко до Земли, какая нужна ракета.',
      en: 'Everything else depends on the orbit: how much sunlight, how far from Earth, which rocket you need.',
    });
  if (insts.length === 0)
    add('blocker', 'science', 'no_instruments', { ru: 'Нет научных приборов', en: 'No science instruments' }, {
      ru: 'Аппарат без приборов ничего не измеряет — миссия не имеет смысла.',
      en: 'A spacecraft without instruments measures nothing — the mission has no purpose.',
    });
  if (!veh)
    add('blocker', 'manager', 'no_vehicle', { ru: 'Ракета не выбрана', en: 'No launch vehicle chosen' }, {
      ru: 'Без ракеты аппарат останется в цеху.',
      en: 'Without a rocket the spacecraft never leaves the factory.',
    });
  if (veh && orbit && !reachable)
    add('blocker', 'manager', 'vehicle_reach', { ru: 'Ракета не долетит до этой орбиты', en: 'This rocket cannot reach the orbit' }, {
      ru: `Этот носитель (${veh.name.ru}) не может разогнать груз до орбиты «${orbit.name.ru}». Нужна ракета мощнее.`,
      en: `${veh.name.en} cannot accelerate a payload to ${orbit.name.en}. You need a more capable rocket.`,
    });
  if (veh && orbit && reachable && wet > capacity)
    add('blocker', 'engineer', 'overweight', { ru: 'Аппарат слишком тяжёл для ракеты', en: 'Too heavy for the rocket' }, {
      ru: `Масса с топливом ${Math.round(wet)} кг, а ракета доставит на эту орбиту только ${Math.round(capacity)} кг. Облегчите аппарат или возьмите ракету мощнее.`,
      en: `Fuelled mass is ${Math.round(wet)} kg, but the rocket delivers only ${Math.round(capacity)} kg to this orbit. Lighten the spacecraft or pick a bigger rocket.`,
    });
  if (orbit && orbit.insertionDv > 0 && !hasEngine)
    add('blocker', 'engineer', 'no_engine', { ru: 'Нечем выйти на орбиту', en: 'No way to enter the orbit' }, {
      ru: `Ракета только отправляет аппарат в путь. Чтобы затормозить и остаться на орбите, нужно изменить скорость на ${orbit.insertionDv} м/с — без двигателя аппарат пролетит мимо.`,
      en: `The rocket only sends the spacecraft on its way. Staying in this orbit takes a ${orbit.insertionDv} m/s change in speed — without an engine the spacecraft flies right past.`,
    });
  if (hasEngine && (!feasible || (prop.maxProp !== null && propellant > prop.maxProp)))
    add('blocker', 'engineer', 'tank_limit', { ru: 'Двигатель не справится с манёврами', en: 'The engine cannot do these manoeuvres' }, {
      ru: `Нужно изменить скорость на ${Math.round(dvTotal)} м/с. Этому двигателю для этого требуется ${feasible ? Math.round(propellant) + ' кг топлива' : 'больше топлива, чем весит сам аппарат вместе с баками'} — выберите двигатель экономичнее.`,
      en: `You need ${Math.round(dvTotal)} m/s of speed change. This engine would need ${feasible ? Math.round(propellant) + ' kg of propellant' : 'more propellant than tanks can ever carry'} — choose a more efficient engine.`,
    });
  if (orbit && adcs.magneticOnly && !orbit.magnetic)
    add('blocker', 'engineer', 'magnetic', { ru: 'Магнитным катушкам не от чего оттолкнуться', en: 'Magnetorquers have nothing to push against' }, {
      ru: 'Катушки поворачивают аппарат, взаимодействуя с магнитным полем Земли. На этой орбите поле слишком слабое — нужны маховики.',
      en: 'Magnetorquers turn the spacecraft by pushing against Earth’s magnetic field. In this orbit the field is too weak — you need reaction wheels.',
    });
  if (prop.needsWatts > 0 && (pw.solar ? pw.watts * o.solarFactor : pw.watts) < prop.needsWatts)
    add('blocker', 'engineer', 'ion_power', { ru: 'Ионному двигателю не хватает мощности', en: 'Not enough power for the ion engine' }, {
      ru: `Двигателю нужно ${prop.needsWatts} Вт, а источник питания даёт на этой орбите меньше.`,
      en: `The engine needs ${prop.needsWatts} W and your power source gives less than that here.`,
    });
  if (p0.average < p0.busLoad)
    add('blocker', 'engineer', 'bus_power', { ru: 'Энергии не хватает даже на служебные системы', en: 'Not enough power even to stay alive' }, {
      ru: `Компьютер, связь и ориентация потребляют ${Math.round(p0.busLoad)} Вт, а в среднем за виток вырабатывается ${Math.round(p0.average)} Вт. Аппарат отключится в первый же день.`,
      en: `Computer, radio and attitude control draw ${Math.round(p0.busLoad)} W, but the orbit-average supply is ${Math.round(p0.average)} W. The spacecraft would die on day one.`,
    });
  else if (insts.length > 0 && p0.average < load)
    add('warn', 'engineer', 'power_deficit', { ru: 'Приборам не хватает энергии', en: 'Instruments are short of power' }, {
      ru: `Нужно ${Math.round(load)} Вт, в среднем есть ${Math.round(p0.average)} Вт. Приборы будут работать лишь ${Math.round(p0.instFrac * 100)}% времени — и столько же науки вы получите.`,
      en: `You need ${Math.round(load)} W and have ${Math.round(p0.average)} W on average. Instruments will run only ${Math.round(p0.instFrac * 100)}% of the time — and return that share of the science.`,
    });
  else if (insts.length > 0 && pEnd.average < load)
    add('warn', 'engineer', 'power_eol', { ru: 'К концу миссии энергии станет мало', en: 'Power runs short late in the mission' }, {
      ru: `Радиация постепенно портит солнечные элементы: через ${d.lifeYears} лет останется ${Math.round(pEnd.average)} Вт из нужных ${Math.round(load)}. Оставьте запас.`,
      en: `Radiation slowly degrades solar cells: after ${d.lifeYears} years you will have ${Math.round(pEnd.average)} W of the ${Math.round(load)} W needed. Leave some margin.`,
    });
  if (eclipseNeedFull > bat.wh * DOD)
    add('warn', 'engineer', 'battery', { ru: 'Батареи не хватит на время тени', en: 'Battery too small for eclipse' }, {
      ru: `В тени аппарат живёт на батарее до ${o.eclipseHours} ч и тратит ${Math.round(eclipseNeedFull)} Вт·ч, а безопасно доступно ${Math.round(bat.wh * DOD)} Вт·ч. Приборы придётся выключать, а глубокий разряд может убить батарею.`,
      en: `In shadow the spacecraft runs on battery for up to ${o.eclipseHours} h and uses ${Math.round(eclipseNeedFull)} Wh, but only ${Math.round(bat.wh * DOD)} Wh is safely available. Instruments must switch off, and deep discharge can kill the battery.`,
    });
  const blurry = insts.filter((i) => i.pointing > adcs.pointing);
  if (blurry.length)
    add('warn', 'engineer', 'pointing_inst', { ru: 'Наведение слишком грубое для приборов', en: 'Pointing is too coarse for the instruments' }, {
      ru: `${blurry.map((i) => i.name.ru).join(', ')}: аппарат дрожит сильнее, чем допускает прибор, и данные выйдут смазанными. Нужна система ориентации точнее.`,
      en: `${blurry.map((i) => i.name.en).join(', ')}: the spacecraft wobbles more than the instrument tolerates, so the data will be blurred. Use a finer attitude system.`,
    });
  if (ant.pointing > adcs.pointing)
    add('warn', 'comms', 'pointing_ant', { ru: 'Антенну не удержать на Земле', en: 'The antenna cannot stay on target' }, {
      ru: 'У этой антенны узкий луч. При грубой ориентации он постоянно соскальзывает со станции, и скорость падает в разы.',
      en: 'This antenna has a narrow beam. With coarse pointing it keeps sliding off the station and the data rate collapses.',
    });
  if (insts.length > 0 && p0.generated > 0 && p0.downlink < p0.generated * 0.97)
    add('warn', 'comms', 'data_bottleneck', { ru: 'Данные не успевают уходить на Землю', en: 'Data cannot get down fast enough' }, {
      ru: `Приборы создают ${fmt(p0.generated)} ГБ в сутки, а канал пропускает ${fmt(p0.downlink)} ГБ. Остальное будет потеряно. Помогут антенна быстрее, больше станций или сжатие на борту.`,
      en: `Instruments produce ${fmt(p0.generated)} GB a day and the link carries ${fmt(p0.downlink)} GB. The rest is lost. A faster antenna, more stations or onboard compression would help.`,
    });
  if (p0.storageNeed > cpu.storage)
    add('warn', 'comms', 'storage', { ru: 'Память переполняется между сеансами связи', en: 'Storage overflows between contacts' }, {
      ru: `Между сеансами нужно хранить около ${fmt(p0.storageNeed)} ГБ, а памяти ${cpu.storage} ГБ. Новые данные будут затирать старые.`,
      en: `About ${fmt(p0.storageNeed)} GB must be held between contacts, but there is only ${cpu.storage} GB. New data will overwrite old.`,
    });
  if (orbit && cpu.radTol < orbit.radiation)
    add('warn', 'comms', 'radiation', { ru: 'Электроника не рассчитана на эту радиацию', en: 'Electronics are not built for this radiation' }, {
      ru: 'За пределами защиты атмосферы и магнитного поля заряженные частицы сбивают память и могут сжечь микросхемы. Ждите сбоев и потерянных месяцев.',
      en: 'Beyond the shelter of the atmosphere and magnetic field, charged particles flip memory bits and can burn out chips. Expect glitches and lost months.',
    });
  if (orbit && decays && effectiveYears < d.lifeYears)
    add('warn', 'engineer', 'decay', { ru: 'Орбита не продержится весь срок', en: 'The orbit will not last the mission' }, {
      ru: `Без двигателя орбита разрушится примерно через ${o.decayYears} г., а миссия рассчитана на ${d.lifeYears}. Нужен двигатель для поддержания высоты.`,
      en: `Without an engine the orbit decays in about ${o.decayYears} years, yet the mission is planned for ${d.lifeYears}. You need an engine to hold altitude.`,
    });
  if (orbit && !disposalOk)
    add('warn', 'manager', 'disposal', { ru: 'Аппарат останется космическим мусором', en: 'The spacecraft will become space debris' }, {
      ru: 'На этой орбите мёртвый спутник будет десятилетиями угрожать другим. По международным правилам его нужно увести — для этого нужен двигатель.',
      en: 'In this orbit a dead satellite threatens others for decades. International guidelines require removing it — which takes an engine.',
    });
  if (devMonths > sc.deadlineMonths)
    add('warn', 'manager', 'late', { ru: 'Разработка не укладывается в срок', en: 'Development overruns the deadline' }, {
      ru: `Нужно ${devMonths} мес., есть ${sc.deadlineMonths}. Сложные приборы и долгие испытания растягивают график, а каждый месяц — это зарплаты команды.`,
      en: `You need ${devMonths} months and have ${sc.deadlineMonths}. Complex instruments and long test campaigns stretch the schedule, and every month costs salaries.`,
    });
  const uncovered = (Object.entries(sc.weights) as [Measure, number][])
    .filter(([m, w]) => !sc.sandbox && w >= 0.2 && !(p0.quality[m]! > 0))
    .map(([m]) => m);
  if (insts.length > 0 && uncovered.length)
    add('warn', 'science', 'uncovered', { ru: 'Часть задач миссии никто не измеряет', en: 'Some mission goals are not measured' }, {
      ru: `Нет прибора для: ${uncovered.map((m) => MEASURES[m].ru.toLowerCase()).join(', ')}.`,
      en: `No instrument for: ${uncovered.map((m) => MEASURES[m].en.toLowerCase()).join(', ')}.`,
    });
  if (reachable && massMargin >= 0 && massMargin < 0.1)
    add('warn', 'engineer', 'mass_margin', { ru: 'Почти нет запаса по массе', en: 'Almost no mass margin' }, {
      ru: 'Аппараты всегда тяжелеют во время разработки. Инженеры оставляют не меньше 10% запаса.',
      en: 'Spacecraft always gain weight during development. Engineers keep at least a 10% margin.',
    });
  if (total > budget)
    add('blocker', 'manager', 'over_budget', { ru: 'Бюджет превышен', en: 'Over budget' }, {
      ru: `Миссия стоит $${Math.round(total)} млн при бюджете $${budget} млн. Такой проект не утвердят: ищите, от чего отказаться.`,
      en: `The mission costs $${Math.round(total)}M against a $${budget}M budget. It will not be approved: find something to give up.`,
    });

  return {
    mass: { payload, bus, structure, dry, propellant, wet, capacity, margin: massMargin },
    power: {
      busLoad: p0.busLoad,
      instLoad: p0.instLoad,
      load,
      average: p0.average,
      averageEol: pEnd.average,
      margin: load > 0 ? p0.average / load - 1 : 0,
      eclipseNeedWh: eclipseNeedFull,
      batteryWh: bat.wh * DOD,
    },
    data: {
      // What the instruments produce when fully powered: a power shortage is reported on its own gauge.
      generated: sum(insts.map((i) => i.data)) * cpu.compression,
      downlink: p0.downlink,
      rateMbps: p0.rateMbps,
      contactHours: p0.contactHours,
      storage: cpu.storage,
      storageNeed: p0.storageNeed,
      returnFraction: p0.returnFraction,
    },
    cost: {
      payload: payloadCost,
      bus: busCost,
      launch: launchCost,
      ground: groundCost,
      ops: opsCost,
      dev: devCost,
      testing: test.cost,
      total,
      budget,
      margin: (budget - total) / budget,
    },
    time: { devMonths, deadline: sc.deadlineMonths, transitMonths, lifeYears: d.lifeYears, effectiveYears },
    dv: { insertion: dvInsertion, station: dvStation, disposal: dvDisposal, total: dvTotal, disposalOk },
    science: { quality: p0.quality, orbitFit: orbit ? p0.orbitFit : 0, ratePerYear: orbit ? p0.ratePerYear : 0, target, projected: orbit ? projected : 0 },
    launchReliability: veh?.reliability ?? 0,
    checks,
    blockers: checks.filter((c) => c.level === 'blocker').length,
  };
}

/** Compact number: 0.05, 3.4, 120. */
export function fmt(x: number): string {
  if (!Number.isFinite(x)) return '∞';
  const a = Math.abs(x);
  if (a >= 100) return String(Math.round(x));
  if (a >= 10) return String(Math.round(x * 10) / 10);
  return String(Math.round(x * 100) / 100);
}
