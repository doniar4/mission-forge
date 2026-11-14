import { useMemo, useState } from 'react';
import { DIFFICULTY } from '../engine/catalog';
import { evaluate } from '../engine/evaluate';
import { scenarioById } from '../engine/scenarios';
import { goalsFor, memberName, rolesOf } from '../engine/team';
import type { Check, Evaluation, L, Role } from '../engine/types';
import { useT } from '../i18n';
import { shareLink, useDesign, useStore } from '../store';
import { Gauge, ROLES, TopBar } from './common';
import {
  BriefSection,
  CommsSection,
  OrbitSection,
  PayloadSection,
  PlanSection,
  PlatformSection,
  PowerSection,
  type SectionId,
} from './Sections';
import { Spacecraft } from './Spacecraft';
import { LostBanner, TeamPanel, useTeamState } from './Team';

const SECTIONS: { id: SectionId; role: Role; name: L }[] = [
  { id: 'brief', role: 'manager', name: { ru: 'Задача', en: 'Objective' } },
  { id: 'orbit', role: 'science', name: { ru: 'Орбита', en: 'Orbit' } },
  { id: 'payload', role: 'science', name: { ru: 'Приборы', en: 'Instruments' } },
  { id: 'power', role: 'engineer', name: { ru: 'Энергия', en: 'Power' } },
  { id: 'platform', role: 'engineer', name: { ru: 'Платформа', en: 'Platform' } },
  { id: 'comms', role: 'comms', name: { ru: 'Связь и данные', en: 'Comms and data' } },
  { id: 'plan', role: 'manager', name: { ru: 'Запуск и план', en: 'Launch and plan' } },
];

/** Which section fixes which review finding. */
const WHERE: Record<string, SectionId> = {
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

export function Studio() {
  const t = useT();
  const scenarioId = useStore((s) => s.scenarioId);
  const difficulty = useStore((s) => s.difficulty);
  const goto = useStore((s) => s.goto);
  const launch = useStore((s) => s.launch);
  const resetDesign = useStore((s) => s.resetDesign);
  const design = useDesign();
  const sc = scenarioById(scenarioId);
  const ev = useMemo(() => evaluate(design, sc, difficulty), [design, sc, difficulty]);
  const team = useTeamState();
  const goals = useMemo(() => goalsFor(sc, ev), [sc, ev]);
  const [section, setSection] = useState<SectionId>('brief');
  const [copied, setCopied] = useState(false);

  const current = SECTIONS.find((x) => x.id === section)!;
  const canEdit = !team?.state || section === 'brief' || rolesOf(team.state, team.myId).includes(current.role);
  const issues = (id: SectionId) => ev.checks.filter((c) => WHERE[c.id] === id);
  const props = { design, ev, sc };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink(scenarioId, difficulty, design));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="page studio">
      <TopBar
        left={
          <>
            <button
              type="button"
              className="link"
              onClick={() => {
                if (!team || window.confirm(t('Выйти из комнаты? Проект команды останется у остальных.', 'Leave the room? The team’s design stays with the others.'))) goto('home');
              }}
            >
              {team ? t('Выйти из комнаты', 'Leave the room') : t('Все миссии', 'All missions')}
            </button>
            <span className="crumb">
              {t(sc.name)}, {t(DIFFICULTY[difficulty].name).toLowerCase()}
              {team?.state && t(`, комната ${team.state.code}`, `, room ${team.state.code}`)}
            </span>
          </>
        }
      >
        {!team && (
          <>
            <button type="button" className="link" onClick={copy}>
              {copied ? t('Ссылка скопирована', 'Link copied') : t('Скопировать ссылку на проект', 'Copy link to design')}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                if (window.confirm(t('Очистить проект и начать заново?', 'Clear the design and start over?'))) resetDesign();
              }}
            >
              {t('Очистить проект', 'Clear design')}
            </button>
          </>
        )}
      </TopBar>
      <LostBanner />

      <div className="studio-grid">
        <nav className="rail" aria-label={t('Разделы проекта', 'Design sections')}>
          {SECTIONS.map((s) => {
            const list = issues(s.id);
            const blocked = list.some((c) => c.level === 'blocker');
            return (
              <button
                key={s.id}
                type="button"
                className="rail-item"
                data-role={s.role}
                aria-current={section === s.id ? 'page' : undefined}
                onClick={() => setSection(s.id)}
                title={t(ROLES[s.role].name)}
              >
                <span className="rail-name">{t(s.name)}</span>
                {list.length > 0 && (
                  <span className="rail-flag" data-level={blocked ? 'blocker' : 'warn'}>
                    {list.length}
                  </span>
                )}
              </button>
            );
          })}
          <p className="rail-legend">
            {t('Цвет полосы — роль в команде, которая отвечает за раздел.', 'The stripe colour is the team role that owns the section.')}
          </p>
        </nav>

        <main className="sheet" key={section}>
          <p className="owner" data-role={current.role}>
            {t(ROLES[current.role].name)}
            {team?.state && section !== 'brief' && (
              <span className="muted"> {t('— ведёт', '— held by')} {memberName(team.state, team.state.owners[current.role])}</span>
            )}
          </p>
          {!canEdit && (
            <p className="readonly" role="note">
              {t(
                'Этот раздел ведёт другой участник. Вы видите всё, но менять можете только свои разделы. Предложите правку в обсуждении.',
                'Another player holds this section. You can see everything but change only your own sections. Propose an edit in the discussion.',
              )}
            </p>
          )}
          <fieldset className="edit" disabled={!canEdit}>
          {section === 'brief' && <BriefSection {...props} />}
          {section === 'orbit' && <OrbitSection {...props} />}
          {section === 'payload' && <PayloadSection {...props} />}
          {section === 'power' && <PowerSection {...props} />}
          {section === 'platform' && <PlatformSection {...props} />}
          {section === 'comms' && <CommsSection {...props} />}
          {section === 'plan' && <PlanSection {...props} />}
          </fieldset>
          <SectionNext section={section} onGo={setSection} />
        </main>

        <aside className="spec" aria-label={t('Сводка проекта', 'Design summary')}>
          <Spacecraft design={design} ev={ev} />
          <Budgets ev={ev} />
          <Review checks={ev.checks} onGo={setSection} />
          {team ? (
            <TeamPanel goals={goals} blockers={ev.blockers} />
          ) : (
            <div className="launch">
              <button type="button" className="primary" disabled={ev.blockers > 0} onClick={launch}>
                {t('Запустить миссию', 'Launch the mission')}
              </button>
              <p className="muted">
                {ev.blockers > 0
                  ? t(
                      `Комиссия не допустит к запуску, пока не закрыты обязательные замечания: ${ev.blockers}.`,
                      `The review board will not clear the launch until the required findings are closed: ${ev.blockers}.`,
                    )
                  : ev.checks.length > 0
                    ? t(
                        'Запуск разрешён. Предупреждения не запрещают полёт, но их последствия проявятся в космосе.',
                        'Cleared for launch. Warnings do not stop the flight, but their consequences will show up in space.',
                      )
                    : t('Замечаний нет. Проект готов к запуску.', 'No findings. The design is ready to fly.')}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function SectionNext({ section, onGo }: { section: SectionId; onGo: (s: SectionId) => void }) {
  const t = useT();
  const i = SECTIONS.findIndex((s) => s.id === section);
  const next = SECTIONS[i + 1];
  if (!next) return null;
  return (
    <div className="next">
      <button type="button" className="secondary" onClick={() => onGo(next.id)}>
        {t(`Перейти к разделу «${next.name.ru}»`, `Go to ${next.name.en}`)}
      </button>
    </div>
  );
}

function Budgets({ ev }: { ev: Evaluation }) {
  const t = useT();
  return (
    <div className="budgets">
      <Gauge
        label={t('Масса', 'Mass')}
        used={ev.mass.wet}
        limit={ev.mass.capacity}
        unit={t('кг', 'kg')}
        hint={t(
          `приборы ${t.n(ev.mass.payload)}, платформа ${t.n(ev.mass.bus + ev.mass.structure)}, топливо и баки ${t.n(ev.mass.wet - ev.mass.payload - ev.mass.bus - ev.mass.structure)}`,
          `payload ${t.n(ev.mass.payload)}, platform ${t.n(ev.mass.bus + ev.mass.structure)}, fuel and tanks ${t.n(ev.mass.wet - ev.mass.payload - ev.mass.bus - ev.mass.structure)}`,
        )}
      />
      <Gauge
        label={t('Энергия', 'Power')}
        used={ev.power.load}
        limit={ev.power.average}
        unit={t('Вт', 'W')}
        hint={t('потребление / средняя выработка за виток', 'demand / orbit-average supply')}
      />
      <Gauge
        label={t('Данные', 'Data')}
        used={ev.data.generated}
        limit={ev.data.downlink}
        unit={t('ГБ/сут', 'GB/day')}
        digits={1}
        hint={t('создают приборы / пропускает канал связи', 'produced by instruments / carried by the link')}
      />
      <Gauge
        label={t('Бюджет', 'Budget')}
        used={ev.cost.total}
        limit={ev.cost.budget}
        unit={t('млн $', '$M')}
        hint={t(
          `аппарат ${t.n(ev.cost.payload + ev.cost.bus)}, разработка и испытания ${t.n(ev.cost.dev + ev.cost.testing)}, запуск ${t.n(ev.cost.launch)}, работа на орбите ${t.n(ev.cost.ops + ev.cost.ground)}`,
          `spacecraft ${t.n(ev.cost.payload + ev.cost.bus)}, development and testing ${t.n(ev.cost.dev + ev.cost.testing)}, launch ${t.n(ev.cost.launch)}, operations ${t.n(ev.cost.ops + ev.cost.ground)}`,
        )}
      />
      <Gauge
        label={t('Срок разработки', 'Development time')}
        used={ev.time.devMonths}
        limit={ev.time.deadline}
        unit={t('мес.', 'mo')}
      />
      <div className="forecast" data-state={ev.science.projected >= 1 ? 'ok' : ev.science.projected >= 0.5 ? 'tight' : 'over'}>
        <div className="gauge-row">
          <span className="gauge-label">{t('Прогноз науки', 'Science forecast')}</span>
          <span className="gauge-value">{t.pct(ev.science.projected)}</span>
        </div>
        <div className="gauge-track forecast-track" role="img" aria-label={t(`Прогноз науки: ${t.pct(ev.science.projected)} от цели`, `Science forecast: ${t.pct(ev.science.projected)} of target`)}>
          <div className="gauge-fill" style={{ width: `${Math.min(100, (ev.science.projected / 1.4) * 100)}%` }} />
        </div>
        <p className="gauge-hint">
          {t('отметка — цель заказчика; прогноз верен, если в полёте ничего не сломается', 'the tick is the customer’s target; the forecast holds if nothing breaks in flight')}
        </p>
      </div>
    </div>
  );
}

function Review({ checks, onGo }: { checks: Check[]; onGo: (s: SectionId) => void }) {
  const t = useT();
  const sorted = [...checks].sort((a, b) => (a.level === b.level ? 0 : a.level === 'blocker' ? -1 : 1));
  return (
    <div className="review">
      <h3>{t('Замечания комиссии', 'Review board findings')}</h3>
      {sorted.length === 0 ? (
        <p className="muted">{t('Замечаний нет.', 'No findings.')}</p>
      ) : (
        <ul>
          {sorted.map((c) => (
            <li key={c.id} data-level={c.level}>
              <details>
                <summary>
                  <span className="review-level">{c.level === 'blocker' ? t('Обязательно', 'Required') : t('Риск', 'Risk')}</span>
                  {t(c.title)}
                </summary>
                <p>{t(c.why)}</p>
                {WHERE[c.id] && (
                  <button type="button" className="link" onClick={() => onGo(WHERE[c.id])}>
                    {t(`Открыть раздел «${SECTIONS.find((s) => s.id === WHERE[c.id])!.name.ru}»`, `Open ${SECTIONS.find((s) => s.id === WHERE[c.id])!.name.en}`)}
                  </button>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
