import { DIFFICULTY } from './catalog';
import { scienceYears, evaluate, performance, resolve, type FlightState, type Flying } from './evaluate';
import type { Choices, Crisis, CrisisKind, Design, Difficulty, L, MonthRecord, Scenario, SimEvent, SimResult } from './types';

/** Small deterministic random generator: the same seed always replays the same mission. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What each crisis offers; the first option is the cautious one, taken if nobody decides. */
export const CRISIS_OPTIONS: Record<CrisisKind, string[]> = {
  storm: ['safe', 'observe'],
  drift: ['recalibrate', 'carry_on'],
  budget: ['fewer_passes', 'end_early'],
};
/**
 * What the decisions cost and pay. The cautious options are cheap on purpose: a well-built
 * design should survive them; the bold ones gamble for more.
 */
export const RECAL_MONTHS = 2;
/** Share of the month's science kept while one instrument is being recalibrated. */
export const RECAL_KEEP = 0.88;
export const DRIFT_QUALITY = 0.92;
/** Share of the month's science kept in storm safe mode (the storm passes in days). */
export const STORM_KEEP = 1;
export const STORM_BONUS = 2.2;
export const PASSES_KEPT = 0.96;
export const EARLY_END_KEEP = 0.7;

/**
 * When the mission team will face a decision, and which. Drawn from its own generator so the
 * rest of the flight is the same whatever is decided before that moment.
 */
function crisisPlan(seed: number, planned: number, diff: Difficulty): { kind: CrisisKind; m: number }[] {
  if (planned < 6) return [];
  const crng = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  const kinds: CrisisKind[] = ['storm', 'drift', 'budget'];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(crng() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const first = Math.max(2, Math.round(planned * (0.22 + 0.12 * crng())));
  const second = Math.round(planned * (0.58 + 0.14 * crng()));
  const out = [{ kind: kinds[0], m: first }];
  if (diff !== 'cadet' && planned >= 10 && second > first + 2) out.push({ kind: kinds[1], m: second });
  return out;
}

/**
 * Flies the mission month by month. Call only for designs without blockers.
 * Warnings are allowed to fly — their consequences play out here. `choices` holds the team's
 * decisions on the crises met in flight; without one, the cautious option is taken.
 */
export function simulate(d: Design, sc: Scenario, diff: Difficulty, seed: number, choices: Choices = {}): SimResult {
  const ev = evaluate(d, sc, diff);
  const r = resolve(d);
  if (!r.orbit || !r.veh) throw new Error('simulate() needs an orbit and a launch vehicle');
  const flying = r as Flying;
  const veh = r.veh;
  const { orbit, cpu, prop, test } = flying;
  const D = DIFFICULTY[diff];
  const rng = mulberry32(seed);
  const redundant = d.redundancy === 'redundant';
  const planned = Math.round(d.lifeYears * 12);
  const target = ev.science.target;

  const events: SimEvent[] = [];
  const months: MonthRecord[] = [];
  const crises: Crisis[] = [];
  const say = (month: number, kind: SimEvent['kind'], title: L, text: L) => events.push({ month, kind, title, text });
  let lost: SimResult['lost'] = null;
  let t = 0;
  let science = 0;
  let dataGenerated = 0;
  let dataReturned = 0;
  let monthsOperated = 0;

  const finish = (launchFailed = false): SimResult => {
    const sciencePct = science / target;
    return {
      seed,
      crises,
      months,
      events,
      lost,
      launchFailed,
      monthsOperated,
      plannedMonths: planned,
      dataGenerated,
      dataReturned,
      sciencePct,
      outcome: sciencePct >= 1 ? 'success' : sciencePct >= 0.5 ? 'partial' : 'failure',
    };
  };

  // ---- Launch -----------------------------------------------------------
  if (D.launchFailures && rng() > veh.reliability) {
    lost = { month: 0, cause: { ru: 'Авария ракеты-носителя', en: 'Launch vehicle failure' } };
    say(0, 'bad', { ru: 'Авария при запуске', en: 'Launch failure' }, {
      ru: `Носитель (${veh.name.ru}) не вывел аппарат на орбиту. Его надёжность — ${Math.round(veh.reliability * 100)}%: в среднем один запуск из ${Math.round(1 / (1 - veh.reliability))} заканчивается так.`,
      en: `${veh.name.en} did not reach orbit. Its reliability is ${Math.round(veh.reliability * 100)}%: about one launch in ${Math.round(1 / (1 - veh.reliability))} ends this way.`,
    });
    return finish(true);
  }
  say(0, 'good', { ru: 'Старт!', en: 'Lift-off!' }, {
    ru: `Аппарат массой ${Math.round(ev.mass.wet)} кг отделился от носителя (${veh.name.ru}) и вышел на связь.`,
    en: `The ${Math.round(ev.mass.wet)} kg spacecraft separated from its launcher (${veh.name.en}) and phoned home.`,
  });

  // ---- Cruise -----------------------------------------------------------
  for (let i = 0; i < ev.time.transitMonths; i++) {
    t++;
    months.push({ t, phase: 'transit', power: 1, data: 1, science: 0 });
  }
  if (orbit.insertionDv > 0)
    say(t, 'good', { ru: 'Выход на рабочую орбиту', en: 'Orbit insertion' }, {
      ru: `Двигатель изменил скорость на ${orbit.insertionDv} м/с. Сожжено топлива: ${Math.round(ev.mass.propellant * (orbit.insertionDv / Math.max(1, ev.dv.total)))} кг.`,
      en: `The engine changed speed by ${orbit.insertionDv} m/s, burning about ${Math.round(ev.mass.propellant * (orbit.insertionDv / Math.max(1, ev.dv.total)))} kg of propellant.`,
    });

  // ---- Operations -------------------------------------------------------
  const state: FlightState = { years: 0, arrayFactor: 1, rateFactor: 1, pointingLoss: 0, active: [...flying.insts], contactFactor: 1 };
  const failBase = 0.004 * test.failFactor * (redundant ? 0.35 : 1) * D.events;
  const radDeficit = Math.max(0, orbit.radiation - cpu.radTol);
  const decays = orbit.decayYears !== null && prop.isp === 0;
  let backupUsed = false;
  let warnedPower = false;
  let warnedData = false;
  // Decisions in flight: their schedule, their own dice, and what they leave behind.
  const plan = crisisPlan(seed, planned, diff);
  const crng = mulberry32((seed ^ 0x2545f491) >>> 0);
  let quality = 1;
  let contactCut = 1;
  let end = planned;
  let idle = 0;

  for (let m = 1; m <= end && !lost; m++) {
    t++;
    state.years = m / 12;
    state.contactFactor = contactCut;
    let safeMode = false;
    let boost = idle > 0 ? RECAL_KEEP : 1;
    if (idle > 0) idle--;

    const due = plan.find((c) => c.m === m);
    if (due && !(due.kind === 'drift' && state.active.length === 0)) {
      const id = `${due.kind}-${m}`;
      const options = CRISIS_OPTIONS[due.kind];
      const picked = choices[id] && options.includes(choices[id]) ? choices[id] : options[0];
      const subject = due.kind === 'drift' ? state.active[Math.floor(crng() * state.active.length)] : undefined;
      crises.push({ id, kind: due.kind, month: t, options, chosen: picked, defaulted: !choices[id], instrument: subject?.name });
      if (due.kind === 'storm') {
        if (picked === 'safe') {
          boost = STORM_KEEP;
          say(t, 'info', { ru: 'Решение: переждать бурю', en: 'Decision: sit out the storm' }, {
            ru: 'На несколько дней бури приборы выключены, аппарат в безопасном режиме. Электроника цела, но редкие данные о самой буре упущены.',
            en: 'For the few days of the storm the instruments were off and the spacecraft in safe mode. The electronics are unharmed, but the rare storm data was missed.',
          });
        } else {
          boost = STORM_BONUS;
          const risk = radDeficit > 0 ? 0.5 : 0.15;
          if (state.active.length > 0 && crng() < risk) {
            const gone = state.active.splice(Math.floor(crng() * state.active.length), 1)[0];
            say(t, 'bad', { ru: 'Решение: снимать бурю — прибор сгорел', en: 'Decision: observe the storm — an instrument burned out' }, {
              ru: `Данные о буре получены, но частицы сожгли прибор «${gone.name.ru}». ${radDeficit > 0 ? 'Электроника не была рассчитана на такую радиацию.' : 'Даже защищённая электроника иногда не выдерживает.'}`,
              en: `The storm data came down, but the particles burned out ${gone.name.en}. ${radDeficit > 0 ? 'The electronics were not built for this radiation.' : 'Even hardened electronics sometimes give in.'}`,
            });
          } else
            say(t, 'good', { ru: 'Решение: снимать бурю — редкие данные', en: 'Decision: observe the storm — rare data' }, {
              ru: 'Приборы пережили бурю, и месяц дал в разы больше науки, чем обычно.',
              en: 'The instruments rode out the storm, and the month returned several times the usual science.',
            });
        }
      } else if (due.kind === 'drift' && subject) {
        if (picked === 'recalibrate') {
          boost = RECAL_KEEP;
          idle = RECAL_MONTHS - 1;
          say(t, 'info', { ru: 'Решение: перекалибровать прибор', en: 'Decision: recalibrate the instrument' }, {
            ru: `«${subject.name.ru}» снят с работы на ${RECAL_MONTHS} мес., остальные приборы работают. Потом он снова измеряет точно.`,
            en: `${subject.name.en} is off for ${RECAL_MONTHS} months while the others keep working. Then it measures accurately again.`,
          });
        } else {
          quality *= DRIFT_QUALITY;
          say(t, 'warn', { ru: 'Решение: работать с ошибкой калибровки', en: 'Decision: carry on with the drift' }, {
            ru: `«${subject.name.ru}» продолжает съёмку, но данные до конца миссии на ${Math.round((1 - DRIFT_QUALITY) * 100)}% менее точны.`,
            en: `${subject.name.en} keeps observing, but the data is ${Math.round((1 - DRIFT_QUALITY) * 100)}% less accurate for the rest of the mission.`,
          });
        }
      } else if (due.kind === 'budget') {
        if (picked === 'fewer_passes') {
          contactCut = PASSES_KEPT;
          state.contactFactor = contactCut;
          say(t, 'warn', { ru: 'Решение: сократить сеансы связи', en: 'Decision: cut the ground passes' }, {
            ru: `Аренда станций урезана на ${Math.round((1 - PASSES_KEPT) * 100)}%. Если канал и так был узким, данных дойдёт меньше.`,
            en: `Station time is cut by ${Math.round((1 - PASSES_KEPT) * 100)}%. If the link was already narrow, less data gets home.`,
          });
        } else {
          end = Math.max(m, m + Math.ceil((planned - m) * EARLY_END_KEEP));
          say(t, 'warn', { ru: 'Решение: закончить миссию раньше', en: 'Decision: end the mission early' }, {
            ru: `Связь не урезают, но миссия завершится на ${planned - end} мес. раньше плана.`,
            en: `The passes stay, but the mission will end ${planned - end} months ahead of plan.`,
          });
        }
      }
    }

    if (decays && state.years > orbit.decayYears!) {
      lost = { month: t, cause: { ru: 'Орбита разрушилась, аппарат сгорел в атмосфере', en: 'The orbit decayed and the spacecraft burned up' } };
      say(t, 'bad', { ru: 'Сход с орбиты', en: 'Orbit decay' }, {
        ru: 'Остатки атмосферы месяц за месяцем тормозили аппарат. Без двигателя поднять орбиту было нечем.',
        en: 'Thin air slowed the spacecraft month after month. With no engine there was nothing to raise the orbit with.',
      });
      break;
    }

    // Early failures that testing would have caught on the ground.
    if (m === 1 && test.id === 'minimal' && rng() < 0.06 * D.events) {
      lost = { month: t, cause: { ru: 'Дефект, не найденный на испытаниях', en: 'A defect that testing would have found' } };
      say(t, 'bad', { ru: 'Отказ в первый месяц', en: 'Failure in the first month' }, {
        ru: 'Разъём, не проверенный на вибростенде, отошёл при запуске. Экономия на испытаниях стоила всей миссии.',
        en: 'A connector never shaken on the test table came loose at launch. Saving on testing cost the whole mission.',
      });
      break;
    }

    // Solar storms hit everyone; how hard depends on the electronics.
    if (rng() < 0.012 * orbit.radiation * D.events) {
      if (radDeficit === 0) {
        say(t, 'info', { ru: 'Солнечная буря', en: 'Solar storm' }, {
          ru: 'Поток частиц прошёл через аппарат. Защищённая электроника выдержала.',
          en: 'A burst of particles swept through the spacecraft. The hardened electronics rode it out.',
        });
      } else {
        safeMode = true;
        const killed = state.active.length > 0 && rng() < 0.2 * radDeficit;
        if (killed) {
          const gone = state.active.splice(Math.floor(rng() * state.active.length), 1)[0];
          say(t, 'bad', { ru: 'Солнечная буря сожгла прибор', en: 'A solar storm burned out an instrument' }, {
            ru: `Незащищённая электроника не выдержала: потерян прибор «${gone.name.ru}», месяц наблюдений пропал.`,
            en: `The unprotected electronics gave in: ${gone.name.en} is lost, along with a month of observations.`,
          });
        } else {
          say(t, 'warn', { ru: 'Солнечная буря: безопасный режим', en: 'Solar storm: safe mode' }, {
            ru: 'Частицы сбили память компьютера. Аппарат выключил приборы и месяц ждал команд с Земли.',
            en: 'Particles scrambled the computer’s memory. The spacecraft shut its instruments off and waited a month for commands.',
          });
        }
      }
    }

    // Random hardware failures grow more likely as the spacecraft ages.
    if (rng() < failBase * (1 + 0.15 * state.years)) {
      const roll = rng();
      if (roll < 0.3 && state.active.length > 0) {
        const gone = state.active.splice(Math.floor(rng() * state.active.length), 1)[0];
        say(t, 'bad', { ru: 'Отказ прибора', en: 'Instrument failure' }, {
          ru: `Прибор «${gone.name.ru}» перестал отвечать.`,
          en: `${gone.name.en} has stopped responding.`,
        });
      } else if (roll < 0.5 && flying.adcs.pointing - state.pointingLoss > 1) {
        state.pointingLoss++;
        say(t, 'warn', { ru: 'Отказ маховика', en: 'Reaction wheel failure' }, {
          ru: 'Один из маховиков заклинило. Наведение стало грубее — точные приборы и узкий луч антенны работают хуже.',
          en: 'A reaction wheel seized. Pointing got coarser — precise instruments and narrow antenna beams suffer.',
        });
      } else if (roll < 0.7) {
        state.arrayFactor *= 0.8;
        say(t, 'warn', { ru: 'Отказ секции солнечной батареи', en: 'Solar array string failure' }, {
          ru: 'Выработка упала на 20%. Если запаса по мощности не было, приборам придётся работать по очереди.',
          en: 'Generation dropped by 20%. Without power margin the instruments now have to take turns.',
        });
      } else if (roll < 0.88) {
        state.rateFactor *= 0.5;
        say(t, 'warn', { ru: 'Передатчик потерял мощность', en: 'Transmitter degraded' }, {
          ru: 'Скорость передачи упала вдвое.',
          en: 'The downlink rate has halved.',
        });
      } else if (redundant && !backupUsed) {
        backupUsed = true;
        say(t, 'good', { ru: 'Резерв спас миссию', en: 'The backup saved the mission' }, {
          ru: 'Основной бортовой компьютер отказал. Аппарат переключился на резервный и продолжил работу.',
          en: 'The main onboard computer failed. The spacecraft switched to the backup and carried on.',
        });
      } else {
        lost = { month: t, cause: { ru: 'Отказ служебной системы без резерва', en: 'A critical system failed with no backup' } };
        say(t, 'bad', { ru: 'Связь с аппаратом потеряна', en: 'Contact lost' }, {
          ru: redundant
            ? 'Отказал и резервный комплект. Аппарат замолчал.'
            : 'Отказал бортовой компьютер, а резервного не было. Аппарат замолчал.',
          en: redundant ? 'The backup unit failed too. The spacecraft fell silent.' : 'The onboard computer failed and there was no backup. The spacecraft fell silent.',
        });
        break;
      }
    }

    if (rng() < 0.02 * D.events) {
      state.contactFactor *= 0.7;
      say(t, 'info', { ru: 'Наземная станция на ремонте', en: 'Ground station outage' }, {
        ru: 'Треть сеансов связи в этом месяце не состоялась.',
        en: 'A third of this month’s contacts did not happen.',
      });
    }

    const p = performance(flying, sc, state);
    if (p.average < p.busLoad * 0.85) {
      lost = { month: t, cause: { ru: 'Аппарату перестало хватать энергии', en: 'The spacecraft ran out of power' } };
      say(t, 'bad', { ru: 'Аппарат обесточен', en: 'Power lost' }, {
        ru: 'Солнечные батареи деградировали настолько, что не питают даже служебные системы.',
        en: 'The arrays have degraded so far they can no longer feed even the essential systems.',
      });
      break;
    }
    if (p.batFrac < 0.4 && rng() < 0.04) {
      lost = { month: t, cause: { ru: 'Батарея разрушилась от глубоких разрядов', en: 'The battery died from deep discharge' } };
      say(t, 'bad', { ru: 'Батарея вышла из строя', en: 'Battery failure' }, {
        ru: 'Слишком маленькая батарея каждый виток разряжалась до нуля. В очередной тени аппарат не проснулся.',
        en: 'The undersized battery was drained flat on every orbit. One eclipse, the spacecraft did not wake up.',
      });
      break;
    }
    if (!warnedPower && state.active.length > 0 && p.instFrac < 0.98 && m > 1) {
      warnedPower = true;
      say(t, 'warn', { ru: 'Приборы работают по очереди', en: 'Instruments are taking turns' }, {
        ru: `Энергии хватает только на ${Math.round(p.instFrac * 100)}% нагрузки приборов.`,
        en: `There is only enough power for ${Math.round(p.instFrac * 100)}% of the instrument load.`,
      });
    }
    if (!warnedData && p.generated > 0 && p.returnFraction < 0.9) {
      warnedData = true;
      say(t, 'warn', { ru: 'Данные теряются на борту', en: 'Data is being lost on board' }, {
        ru: `До Земли доходит только ${Math.round(p.returnFraction * 100)}% измерений.`,
        en: `Only ${Math.round(p.returnFraction * 100)}% of the measurements reach Earth.`,
      });
    }

    const live = safeMode ? 0 : 1;
    const days = 30.4;
    dataGenerated += p.generated * days * live;
    dataReturned += p.generated * p.returnFraction * days * live;
    // Each month is worth what it adds to the science-weighted years (less once past the target).
    const worth = 12 * (scienceYears(m / 12, sc.targetYears) - scienceYears((m - 1) / 12, sc.targetYears));
    science += (p.ratePerYear / 12) * p.duty * p.returnFraction * live * worth * quality * boost;
    monthsOperated = m;
    months.push({ t, phase: 'ops', power: live * p.instFrac, data: live * p.returnFraction, science: science / target });
  }

  if (!lost && end < planned)
    say(t, 'info', { ru: 'Миссия завершена досрочно', en: 'Mission ended early' }, {
      ru: `Как и решили при урезании бюджета: отработано ${end} из ${planned} мес.`,
      en: `As decided when the budget was cut: ${end} of ${planned} months flown.`,
    });
  else if (!lost)
    say(t, 'good', { ru: 'Плановый срок отработан', en: 'Design life completed' }, {
      ru: ev.dv.disposalOk
        ? 'Аппарат выполнил программу и безопасно выведен из эксплуатации.'
        : 'Аппарат выполнил программу, но остался на орбите как мусор: увести его нечем.',
      en: ev.dv.disposalOk
        ? 'The spacecraft finished its programme and was safely retired.'
        : 'The spacecraft finished its programme but stays in orbit as debris: there is no way to move it.',
    });

  return finish();
}
