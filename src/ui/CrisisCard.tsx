import { useEffect, useRef, useState } from 'react';
import { CRISIS_LEAD, DEBRIS_HIT, DODGE_KEEP, DRIFT_QUALITY, EARLY_END_KEEP, OUTAGE_DAYS, PASSES_KEPT, RECAL_MONTHS, REROUTE_SLIP, STORM_BONUS, outageKept } from '../engine/simulate';
import type { Crisis, CrisisKind, Evaluation, L } from '../engine/types';
import { useT } from '../i18n';
import { ROLES } from './common';

interface Option {
  title: L;
  /** What it costs and what it buys, in the player's own numbers. */
  effect: L;
  /** The cautious one is marked; the bold one is a gamble. */
  tone: 'safe' | 'bold';
}

/** The story of each decision and its options, worded from the design being flown. */
function story(c: Crisis, ev: Evaluation, monthsLeft: number): { title: L; text: L; who: L; options: Record<string, Option> } {
  const pct = (x: number) => Math.round(x * 100);
  const exposed = ev.checks.some((x) => x.id === 'radiation');
  const linkBound = ev.data.returnFraction < 0.97;
  const name = c.instrument ?? { ru: 'прибор', en: 'an instrument' };
  const kept = outageKept(ev.data.storage, ev.data.generated);
  const byKind: Record<CrisisKind, ReturnType<typeof story>> = {
    storm: {
      who: { ru: 'Служба космической погоды', en: 'Space weather desk' },
      title: { ru: 'Идёт сильная солнечная буря', en: 'A strong solar storm is coming' },
      text: {
        ru: 'Через двое суток до аппарата дойдёт поток частиц. Учёные просят не выключать приборы: такие данные бывают раз в несколько лет.',
        en: 'In two days a stream of particles will reach the spacecraft. The scientists ask to keep observing: data like this comes once in years.',
      },
      options: {
        safe: {
          tone: 'safe',
          title: { ru: 'Безопасный режим', en: 'Safe mode' },
          effect: { ru: 'Приборы выключены на время бури. Электроника цела, редкие данные упущены.', en: 'Instruments off while it passes. Electronics safe, the rare data missed.' },
        },
        observe: {
          tone: 'bold',
          title: { ru: 'Снимать бурю', en: 'Observe the storm' },
          effect: {
            ru: `Месяц даст в ${String(STORM_BONUS).replace('.', ',')} раза больше науки. Риск сжечь прибор: ${exposed ? '50% — электроника не рассчитана на эту радиацию' : '15%'}.`,
            en: `The month returns ${STORM_BONUS}× the science. Risk of burning out an instrument: ${exposed ? '50% — the electronics are not built for this radiation' : '15%'}.`,
          },
        },
      },
    },
    drift: {
      who: { ru: 'Научная группа', en: 'Science team' },
      title: { ru: `Уходит калибровка: ${name.ru}`, en: `Calibration drift: ${name.en}` },
      text: {
        ru: `Показания прибора «${name.ru}» медленно сползают. Его можно перекалибровать по звёздам и эталонным участкам Земли, но на это время он не измеряет.`,
        en: `${name.en}’s readings are slowly drifting. It can be recalibrated against stars and reference sites, but it does not measure while that happens.`,
      },
      options: {
        recalibrate: {
          tone: 'safe',
          title: { ru: 'Перекалибровать', en: 'Recalibrate' },
          effect: {
            ru: `Прибор выключен на ${RECAL_MONTHS} мес., остальные работают. Потом снова точен.`,
            en: `The instrument is off for ${RECAL_MONTHS} months, the others keep working. Then it is accurate again.`,
          },
        },
        carry_on: {
          tone: 'bold',
          title: { ru: 'Работать дальше', en: 'Carry on' },
          effect: {
            ru: `Ни дня простоя, но до конца миссии (${monthsLeft} мес.) данные на ${pct(1 - DRIFT_QUALITY)}% менее точны. Чем меньше осталось, тем выгоднее.`,
            en: `No downtime, but for the rest of the mission (${monthsLeft} months) the data is ${pct(1 - DRIFT_QUALITY)}% less accurate. The less time left, the better this pays.`,
          },
        },
      },
    },
    budget: {
      who: { ru: 'Руководство агентства', en: 'Agency management' },
      title: { ru: 'Бюджет на управление урезан', en: 'Operations budget cut' },
      text: {
        ru: 'Денег на работу миссии стало меньше. Можно сэкономить на аренде наземных станций или закончить миссию раньше.',
        en: 'There is less money to run the mission. You can save on ground station time, or end the mission early.',
      },
      options: {
        fewer_passes: {
          tone: 'safe',
          title: { ru: 'Меньше сеансов связи', en: 'Fewer ground passes' },
          effect: {
            ru: `Станций на ${pct(1 - PASSES_KEPT)}% меньше до конца миссии. ${linkBound ? 'Канал у вас и так узкий — данных дойдёт меньше.' : 'Канал у вас с запасом — потеря небольшая.'}`,
            en: `${pct(1 - PASSES_KEPT)}% less station time to the end. ${linkBound ? 'Your link is already narrow — less data will get home.' : 'Your link has margin — the loss is small.'}`,
          },
        },
        end_early: {
          tone: 'bold',
          title: { ru: 'Закончить раньше', en: 'End early' },
          effect: {
            ru: `Связь полная, но из ${monthsLeft} оставшихся мес. будет только ${Math.ceil(monthsLeft * EARLY_END_KEEP)}.`,
            en: `Full station time, but only ${Math.ceil(monthsLeft * EARLY_END_KEEP)} of the ${monthsLeft} remaining months.`,
          },
        },
      },
    },
    outage: {
      who: { ru: 'Наземный сегмент', en: 'Ground segment' },
      title: { ru: 'Отказала наземная станция', en: 'A ground station is down' },
      text: {
        ru: `Главную антенну ждёт ремонт на ${OUTAGE_DAYS} дней. Можно копить данные в бортовой памяти или договориться о чужих станциях, с которыми команда ещё не работала.`,
        en: `The main antenna is out for ${OUTAGE_DAYS} days of repairs. You can hold the data in onboard storage, or borrow partner stations the team has never worked with.`,
      },
      options: {
        store: {
          tone: 'safe',
          title: { ru: 'Копить на борту', en: 'Hold it on board' },
          effect: {
            ru: kept >= 1 ? `Памяти хватает на все ${OUTAGE_DAYS} дней — ничего не потеряется.` : `Память вместит только ${pct(kept)}% — остальное перезапишется.`,
            en: kept >= 1 ? `Storage holds all ${OUTAGE_DAYS} days — nothing is lost.` : `Storage holds only ${pct(kept)}% — the rest gets overwritten.`,
          },
        },
        reroute: {
          tone: 'bold',
          title: { ru: 'Чужие антенны', en: 'Borrowed antennas' },
          effect: {
            ru: `Данные идут без перерыва, но с вероятностью ${pct(REROUTE_SLIP)}% незнакомая станция ошибётся с командой — и месяц науки пропадёт.`,
            en: `Data keeps flowing, but there is a ${pct(REROUTE_SLIP)}% chance the unfamiliar station fumbles a command — and a month of science is lost.`,
          },
        },
      },
    },
    debris: {
      who: { ru: 'Служба контроля космического мусора', en: 'Space debris watch' },
      title: { ru: 'Опасное сближение с обломком', en: 'A close approach with debris' },
      text: {
        ru: 'Обломок старой ракеты пройдёт рядом через сутки. Точность прогноза — сотни метров: может пронести, а может и нет.',
        en: 'A fragment of an old rocket will pass close by tomorrow. The forecast is good to a few hundred metres: it may miss, or it may not.',
      },
      options: {
        dodge: {
          tone: 'safe',
          title: { ru: 'Увернуться', en: 'Dodge' },
          effect: {
            ru: `Манёвр двигателем: приборы выключены на несколько дней, месяц даст ${pct(DODGE_KEEP)}% обычной науки.`,
            en: `An engine burn: instruments off for a few days, the month returns ${pct(DODGE_KEEP)}% of the usual science.`,
          },
        },
        hold: {
          tone: 'bold',
          title: { ru: 'Не менять курс', en: 'Hold course' },
          effect: {
            ru: `Ни дня простоя, но с вероятностью ${pct(DEBRIS_HIT)}% осколок выведет из строя один прибор до конца миссии (${monthsLeft} мес.).`,
            en: `No downtime, but a ${pct(DEBRIS_HIT)}% chance a fragment knocks out one instrument for the rest of the mission (${monthsLeft} months).`,
          },
        },
      },
    },
  };
  return byKind[c.kind];
}

const TITLES: Record<CrisisKind, L> = {
  storm: { ru: 'Солнечная буря', en: 'Solar storm' },
  drift: { ru: 'Уход калибровки', en: 'Calibration drift' },
  budget: { ru: 'Урезан бюджет', en: 'Budget cut' },
  outage: { ru: 'Отказ наземной станции', en: 'Ground station outage' },
  debris: { ru: 'Сближение с обломком', en: 'Debris approach' },
};
export const CRISIS_TITLE = (c: Crisis): L => TITLES[c.kind];

/** How long a team has to vote before the host closes the vote. */
export const VOTE_SECONDS = 30;

/** A team's vote on one decision, as this player sees it. */
export interface Ballot {
  /** This player's vote, if cast. */
  mine?: string;
  votes: { name: string; option: string }[];
  /** People in the room: everyone votes, whatever their roles. */
  total: number;
  /** Who holds this decision's lead role and so breaks a tie. */
  lead?: string;
}

/** Seconds left of the team's vote, counted from when this screen reached the decision. */
function useCountdown(key: string, on: boolean): number {
  const [left, setLeft] = useState(VOTE_SECONDS);
  useEffect(() => {
    if (!on) return;
    const start = Date.now();
    setLeft(VOTE_SECONDS);
    const id = setInterval(() => setLeft(Math.max(0, VOTE_SECONDS - Math.floor((Date.now() - start) / 1000))), 250);
    return () => clearInterval(id);
  }, [key, on]);
  return left;
}

/**
 * A decision in flight: the mission stands still until the player picks an option. In a team the
 * pick is a vote: everyone sees who voted for what, and the host's referee decides when all have
 * voted or the time is up (a tie goes to the cautious option).
 */
export function CrisisCard({ crisis, ev, monthsLeft, team, onPick }: { crisis: Crisis; ev: Evaluation; monthsLeft: number; team?: Ballot; onPick: (option: string) => void }) {
  const t = useT();
  const s = story(crisis, ev, monthsLeft);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), [crisis.id]);
  const left = useCountdown(crisis.id, !!team);
  return (
    <div className="crisis" role="alertdialog" aria-modal="true" aria-labelledby="crisis-title" aria-describedby="crisis-text">
      <div className="crisis-card">
        <span className="crisis-from">
          <i aria-hidden="true" />
          {t(s.who)} · {t(`месяц ${crisis.month}`, `month ${crisis.month}`)} · {t('миссия на паузе', 'mission paused')}
        </span>
        <span className="crisis-lead" data-role={CRISIS_LEAD[crisis.kind]}>
          {t('Решение за ролью', 'Lead role')}: <b>{t(ROLES[CRISIS_LEAD[crisis.kind]].name)}</b>
          {team?.lead && ` · ${team.lead}`}
        </span>
        <h2 id="crisis-title">{t(s.title)}</h2>
        <p id="crisis-text">{t(s.text)}</p>
        <div className="crisis-options">
          {crisis.options.map((id, i) => {
            const o = s.options[id];
            return (
              <button
                key={id}
                ref={i === 0 ? first : undefined}
                type="button"
                className="crisis-option"
                data-tone={o.tone}
                aria-pressed={team ? team.mine === id : undefined}
                onClick={() => onPick(id)}
              >
                <span className="crisis-tag">{o.tone === 'safe' ? t('осторожно', 'cautious') : t('рискованно', 'bold')}</span>
                <b>{t(o.title)}</b>
                <span>{t(o.effect)}</span>
                {team && (
                  <span className="crisis-voters">
                    {team.votes
                      .filter((v) => v.option === id)
                      .map((v) => v.name)
                      .join(', ') || t('пока никто', 'no votes yet')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {team && (
          <p className="crisis-vote" role="status">
            {t(
              `Голосует команда: ${team.votes.length} из ${team.total}. Осталось ${left} с. При ничьей решает ${team.lead ?? 'ведущая роль'}, если не голосовал(а) — осторожный вариант.`,
              `Team vote: ${team.votes.length} of ${team.total} in. ${left} s left. In a tie ${team.lead ?? 'the lead role'} decides; without their vote, the cautious option wins.`,
            )}
          </p>
        )}
      </div>
    </div>
  );
}
