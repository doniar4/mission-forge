import { DIFFICULTY, MEASURES } from './catalog';
import { clamp, fmt } from './evaluate';
import type { Design, Difficulty, Evaluation, Insight, L, Measure, Report, Scenario, ScoreLine, SimResult } from './types';

/** Turns a flown mission into a score and a plain-language explanation of why it went the way it did. */
export function buildReport(d: Design, sc: Scenario, diff: Difficulty, ev: Evaluation, sim: SimResult): Report {
  const lines: ScoreLine[] = [];
  const line = (id: string, label: L, share: number, max: number) =>
    lines.push({ id, label, points: Math.round(clamp(share) * max), max });

  const flew = !sim.launchFailed;
  // Meeting the target earns 80% of the science score; the rest rewards going beyond it (up to 140%).
  const scienceShare = sim.sciencePct <= 1 ? 0.8 * sim.sciencePct : 0.8 + 0.2 * clamp((sim.sciencePct - 1) / 0.4);
  line('science', { ru: 'Научный результат', en: 'Science return' }, scienceShare, 500);
  // Saving up to 30% of the budget earns the full efficiency score.
  line('budget', { ru: 'Экономия бюджета', en: 'Budget efficiency' }, flew ? ev.cost.margin / 0.3 : 0, 175);
  line('data', { ru: 'Доставка данных', en: 'Data delivered' }, sim.dataGenerated > 0 ? sim.dataReturned / sim.dataGenerated : 0, 75);
  line('survival', { ru: 'Живучесть аппарата', en: 'Spacecraft survival' }, sim.monthsOperated / sim.plannedMonths, 75);
  line('margins', { ru: 'Инженерные запасы', en: 'Engineering margins' }, (clamp(ev.mass.margin / 0.1) + clamp(ev.power.margin / 0.15)) / 2, 75);
  line('schedule', { ru: 'Соблюдение сроков', en: 'On schedule' }, 1 - (ev.time.devMonths - ev.time.deadline) / 12, 50);
  line('disposal', { ru: 'Чистота космоса', en: 'Clean space' }, ev.dv.disposalOk ? 1 : 0, 50);

  const raw = lines.reduce((a, l) => a + l.points, 0);
  const total = Math.round(raw * DIFFICULTY[diff].scoreFactor);
  const grade = total >= 920 ? 'S' : total >= 820 ? 'A' : total >= 700 ? 'B' : total >= 550 ? 'C' : total >= 400 ? 'D' : 'F';

  const insights: Insight[] = [];
  const tell = (kind: Insight['kind'], title: L, text: L) => insights.push({ kind, title, text });
  const pct = (x: number) => Math.round(x * 100);

  if (sim.launchFailed) {
    tell('bad', { ru: 'Ракета подвела — так бывает', en: 'The rocket let you down — it happens' }, {
      ru: `Надёжность выбранной ракеты ${pct(ev.launchReliability)}%. Это не ошибка проекта, а риск, который вы приняли. Более надёжная ракета стоит дороже — это и есть цена спокойствия. Попробуйте запустить ещё раз.`,
      en: `Your rocket is ${pct(ev.launchReliability)}% reliable. This was not a design mistake but a risk you accepted. A more reliable rocket costs more — that is the price of peace of mind. Try launching again.`,
    });
    return { lines, total, grade, insights };
  }

  if (sim.lost)
    tell('bad', { ru: `Миссия оборвалась на ${sim.lost.month}-м месяце`, en: `The mission ended in month ${sim.lost.month}` }, {
      ru: `${sim.lost.cause.ru}. Отработано ${sim.monthsOperated} из ${sim.plannedMonths} месяцев. Испытания и резервирование снижают вероятность таких потерь, но стоят денег, массы и времени.`,
      en: `${sim.lost.cause.en}. ${sim.monthsOperated} of ${sim.plannedMonths} months were flown. Testing and redundancy make such losses less likely, at a price in money, mass and time.`,
    });

  // Science: was the payload right for the objective?
  const weak = (Object.entries(sc.weights) as [Measure, number][])
    .filter(([m, w]) => w >= 0.15 && (ev.science.quality[m] ?? 0) < 0.5)
    .map(([m]) => m);
  if (!sc.sandbox && weak.length)
    tell('warn', { ru: 'Приборы закрывают не все задачи', en: 'The payload misses part of the objective' }, {
      ru: `Слабо или совсем не измеряется: ${weak.map((m) => MEASURES[m].ru.toLowerCase()).join(', ')}. Учёные получили только ${fmt(ev.science.ratePerYear)} из 100 возможных единиц науки в год.`,
      en: `Weakly or not measured: ${weak.map((m) => MEASURES[m].en.toLowerCase()).join(', ')}. Scientists got only ${fmt(ev.science.ratePerYear)} of a possible 100 science units a year.`,
    });
  if (ev.science.orbitFit < 0.8 && d.orbit) {
    const note = sc.orbits[d.orbit]?.note;
    if (note)
      tell('warn', { ru: 'Орбита ограничила науку', en: 'The orbit held the science back' }, {
        ru: `Эта орбита подходит задаче на ${pct(ev.science.orbitFit)}%. ${note.ru}`,
        en: `This orbit fits the objective ${pct(ev.science.orbitFit)}%. ${note.en}`,
      });
  }

  // Power.
  if (ev.power.margin < 0)
    tell('bad', { ru: 'Аппарату не хватало энергии', en: 'The spacecraft was starved of power' }, {
      ru: `Системы потребляют ${Math.round(ev.power.load)} Вт, а в среднем за виток вырабатывалось ${Math.round(ev.power.average)} Вт. Приборы простаивали. Солнечные батареи дают полную мощность только на свету — в расчёт нужно брать среднюю выработку с учётом тени.`,
      en: `Systems draw ${Math.round(ev.power.load)} W while the orbit-average supply was ${Math.round(ev.power.average)} W. Instruments sat idle. Solar arrays give full power only in sunlight — size them on the average, shadow included.`,
    });
  else if (ev.power.averageEol < ev.power.load)
    tell('warn', { ru: 'Запас по энергии растаял к концу миссии', en: 'Power margin melted away over time' }, {
      ru: `В начале хватало с запасом ${pct(ev.power.margin)}%, но солнечные элементы стареют под радиацией. К концу срока осталось ${Math.round(ev.power.averageEol)} Вт из нужных ${Math.round(ev.power.load)}.`,
      en: `You started with ${pct(ev.power.margin)}% margin, but solar cells age under radiation. By the end only ${Math.round(ev.power.averageEol)} W of the needed ${Math.round(ev.power.load)} W was left.`,
    });
  else if (ev.power.margin > 1.5)
    tell('warn', { ru: 'Солнечные батареи с большим избытком', en: 'Far more solar array than needed' }, {
      ru: `Вырабатывается в ${fmt(ev.power.margin + 1)} раза больше, чем нужно. Лишние панели — это лишние килограммы и деньги.`,
      en: `You generate ${fmt(ev.power.margin + 1)}× what you use. Spare arrays are spare kilograms and dollars.`,
    });
  else tell('good', { ru: 'Энергобаланс сошёлся', en: 'The power budget balanced' }, {
      ru: `Запас ${pct(ev.power.margin)}% в начале миссии — приборы работали без ограничений.`,
      en: `A ${pct(ev.power.margin)}% margin at the start let the instruments run without limits.`,
    });
  if (ev.power.eclipseNeedWh > ev.power.batteryWh)
    tell('warn', { ru: 'Батарея мала для тени', en: 'The battery was too small for eclipse' }, {
      ru: `На тень нужно ${Math.round(ev.power.eclipseNeedWh)} Вт·ч, доступно ${Math.round(ev.power.batteryWh)}. Каждый виток приборы выключались, а батарея изнашивалась от глубоких разрядов.`,
      en: `Eclipse needs ${Math.round(ev.power.eclipseNeedWh)} Wh and ${Math.round(ev.power.batteryWh)} Wh was available. Instruments switched off every orbit and deep discharges wore the battery out.`,
    });

  // Data.
  const returned = sim.dataGenerated > 0 ? sim.dataReturned / sim.dataGenerated : 1;
  if (returned < 0.9)
    tell('bad', { ru: `До Земли дошло только ${pct(returned)}% данных`, en: `Only ${pct(returned)}% of the data reached Earth` }, {
      ru: `Приборы создавали ${fmt(ev.data.generated)} ГБ в сутки, а канал связи пропускал ${fmt(ev.data.downlink)} ГБ (${fmt(ev.data.rateMbps)} Мбит/с × ${fmt(ev.data.contactHours)} ч связи в сутки). Измерение, которое не передано, — это измерение, которого не было.`,
      en: `Instruments produced ${fmt(ev.data.generated)} GB a day while the link carried ${fmt(ev.data.downlink)} GB (${fmt(ev.data.rateMbps)} Mbit/s × ${fmt(ev.data.contactHours)} h of contact a day). A measurement that is never sent home is a measurement never made.`,
    });
  else if (ev.data.generated > 0 && ev.data.downlink > ev.data.generated * 20)
    tell('warn', { ru: 'Канал связи избыточен', en: 'The link is oversized' }, {
      ru: `Канал может передать в ${Math.round(ev.data.downlink / ev.data.generated)} раз больше, чем создают приборы. Антенна или сеть попроще сэкономили бы бюджет.`,
      en: `The link could carry ${Math.round(ev.data.downlink / ev.data.generated)}× what the instruments produce. A simpler antenna or network would have saved money.`,
    });
  else tell('good', { ru: 'Данные дошли до учёных', en: 'The data made it home' }, {
      ru: `Канал связи справился с потоком в ${fmt(ev.data.generated)} ГБ в сутки.`,
      en: `The link kept up with ${fmt(ev.data.generated)} GB a day.`,
    });

  // Mass and budget.
  if (ev.mass.propellant > ev.mass.dry * 0.5)
    tell('warn', { ru: 'Половина массы — топливо', en: 'Half the mass is propellant' }, {
      ru: `На ${Math.round(ev.dv.total)} м/с манёвров ушло ${Math.round(ev.mass.propellant)} кг топлива при сухой массе ${Math.round(ev.mass.dry)} кг. Это «тирания формулы Циолковского»: каждый лишний килограмм приборов тянет за собой топливо, а топливо — баки. Двигатель с более высоким удельным импульсом или более «дешёвая» орбита меняют картину.`,
      en: `${Math.round(ev.dv.total)} m/s of manoeuvres took ${Math.round(ev.mass.propellant)} kg of propellant for a ${Math.round(ev.mass.dry)} kg dry spacecraft. This is the tyranny of the rocket equation: each extra kilogram of payload drags along fuel, and the fuel drags along tanks. A more efficient engine or a cheaper orbit changes the picture.`,
    });
  if (ev.mass.margin > 0.6)
    tell('warn', { ru: 'Ракета летела полупустой', en: 'The rocket flew mostly empty' }, {
      ru: `Использовано только ${pct(1 - ev.mass.margin)}% грузоподъёмности. Ракета меньше стоила бы дешевле.`,
      en: `Only ${pct(1 - ev.mass.margin)}% of the lift capacity was used. A smaller rocket would have cost less.`,
    });
  if (ev.cost.margin >= 0.1)
    tell('good', { ru: `Сэкономлено ${pct(ev.cost.margin)}% бюджета`, en: `${pct(ev.cost.margin)}% of the budget saved` }, {
      ru: `Миссия обошлась в $${Math.round(ev.cost.total)} млн из $${ev.cost.budget} млн.`,
      en: `The mission cost $${Math.round(ev.cost.total)}M of $${ev.cost.budget}M.`,
    });
  if (ev.time.devMonths > ev.time.deadline)
    tell('warn', { ru: 'Запуск состоялся с опозданием', en: 'The launch was late' }, {
      ru: `Разработка заняла ${ev.time.devMonths} мес. при сроке ${ev.time.deadline}. Больше всего график растягивают сложные приборы и длинные испытания.`,
      en: `Development took ${ev.time.devMonths} months against a ${ev.time.deadline}-month deadline. Complex instruments and long test campaigns stretch a schedule the most.`,
    });
  if (!ev.dv.disposalOk)
    tell('bad', { ru: 'На орбите остался мусор', en: 'Debris left in orbit' }, {
      ru: 'Аппарат без двигателя нельзя увести с орбиты после завершения работы. Он будет угрожать другим спутникам десятки лет.',
      en: 'A spacecraft with no engine cannot be removed once its work is done. It will endanger other satellites for decades.',
    });

  if (sim.outcome === 'success' && !sim.lost)
    tell('good', { ru: 'Цель миссии достигнута', en: 'Mission objective achieved' }, {
      ru: `Получено ${pct(sim.sciencePct)}% запланированной науки. Теперь попробуйте добиться того же дешевле — или другим путём: другой орбитой, другим набором приборов.`,
      en: `You returned ${pct(sim.sciencePct)}% of the planned science. Now try to do it for less — or differently: another orbit, another set of instruments.`,
    });

  return { lines, total, grade, insights };
}
