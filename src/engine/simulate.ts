import { DIFFICULTY } from './catalog';
import { EXTENDED_VALUE, evaluate, performance, resolve, type FlightState, type Flying } from './evaluate';
import type { Design, Difficulty, L, MonthRecord, Scenario, SimEvent, SimResult } from './types';

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

/**
 * Flies the mission month by month. Call only for designs without blockers.
 * Warnings are allowed to fly — their consequences play out here.
 */
export function simulate(d: Design, sc: Scenario, diff: Difficulty, seed: number): SimResult {
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

  for (let m = 1; m <= planned && !lost; m++) {
    t++;
    state.years = m / 12;
    state.contactFactor = 1;
    let safeMode = false;

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
      state.contactFactor = 0.7;
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
    science += (p.ratePerYear / 12) * p.duty * p.returnFraction * live * (m > sc.targetYears * 12 ? EXTENDED_VALUE : 1);
    monthsOperated = m;
    months.push({ t, phase: 'ops', power: live * p.instFrac, data: live * p.returnFraction, science: science / target });
  }

  if (!lost)
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
