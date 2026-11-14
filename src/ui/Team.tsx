import { useEffect, useRef, useState } from 'react';
import { DIFFICULTY } from '../engine/catalog';
import { SCENARIOS, scenarioById } from '../engine/scenarios';
import {
  HOST,
  ROLE_LIST,
  TEAM_MAX,
  allRolesOwned,
  memberName,
  owners,
  rolesOf,
  type Goal,
  type RoomKind,
  type TeamState,
} from '../engine/team';
import type { Difficulty } from '../engine/types';
import { useT } from '../i18n';
import { useStore } from '../store';
import { createTeam, joinTeam, leaveRoom, normalizeCode, roomLink, teamSend, useNet } from '../team/net';
import { ROLES, TopBar } from './common';

export function useTeamState(): { state: TeamState | null; myId: string; isHost: boolean; lost: boolean } | null {
  const team = useStore((s) => s.team);
  return team ? { state: team.state, myId: team.myId, isHost: team.isHost, lost: team.status === 'lost' } : null;
}

// ---- home: create or join a room -------------------------------------------

export function TeamEntry() {
  const t = useT();
  const playerName = useStore((s) => s.playerName);
  const setPlayerName = useStore((s) => s.setPlayerName);
  const difficulty = useStore((s) => s.difficulty);
  const lang = useStore((s) => s.lang);
  const { busy, error } = useNet();
  const [name, setName] = useState(playerName);
  const [kind, setKind] = useState<RoomKind>('online');
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [code, setCode] = useState('');
  const who = () => {
    const n = name.trim() || (lang === 'ru' ? 'Игрок' : 'Player');
    setPlayerName(name.trim());
    return n;
  };

  return (
    <section className="block" id="team">
      <h2>{t('Командная игра', 'Team play')}</h2>
      <p className="muted">
        {t(
          `До ${TEAM_MAX} человек проектируют одну миссию, каждый на своём устройстве. Ролей четыре, поэтому при трёх игроках один ведёт две. У каждой роли свои разделы и свои цели, и они тянут проект в разные стороны: договариваться придётся.`,
          `Up to ${TEAM_MAX} people design one mission, each on their own device. There are four roles, so with three players one holds two. Each role owns its own sections and has its own goals, and the goals pull the design apart: you will have to negotiate.`,
        )}
      </p>
      <div className="team-entry">
        <div className="field">
          <label htmlFor="pname">{t('Ваше имя в команде', 'Your name in the team')}</label>
          <input id="pname" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <span id="kind-label">{t('Связь между игроками', 'How players connect')}</span>
          <div className="segmented" role="radiogroup" aria-labelledby="kind-label">
            <button type="button" role="radio" aria-checked={kind === 'online'} onClick={() => setKind('online')}>
              {t('По интернету', 'Over the internet')}
            </button>
            <button type="button" role="radio" aria-checked={kind === 'local'} onClick={() => setKind('local')}>
              {t('На этом компьютере', 'On this computer')}
            </button>
          </div>
          <p className="hint">
            {kind === 'online'
              ? t(
                  'Игроки находят друг друга через бесплатный сервис PeerJS, а проект и чат идут напрямую между браузерами.',
                  'Players find each other through the free PeerJS service, while the design and chat go directly between browsers.',
                )
              : t(
                  'Игроки открывают игру в разных вкладках или окнах одного браузера. Интернет не нужен.',
                  'Players open the game in different tabs or windows of one browser. No internet needed.',
                )}
          </p>
        </div>

        <div className="team-actions">
          <div className="team-create">
            <h3>{t('Создать комнату', 'Create a room')}</h3>
            <div className="field">
              <label htmlFor="tmission">{t('Миссия', 'Mission')}</label>
              <select id="tmission" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(s.name)}
                  </option>
                ))}
              </select>
              <p className="hint">{t(`Сложность: ${DIFFICULTY[difficulty].name.ru}. Её и миссию можно сменить в комнате.`, `Difficulty: ${DIFFICULTY[difficulty].name.en}. You can change it and the mission inside the room.`)}</p>
            </div>
            <button type="button" className="primary" disabled={busy} onClick={() => createTeam({ kind, name: who(), scenarioId, difficulty })}>
              {busy ? t('Подключаемся…', 'Connecting…') : t('Создать комнату', 'Create the room')}
            </button>
          </div>
          <div className="team-join">
            <h3>{t('Войти по коду', 'Join with a code')}</h3>
            <div className="field">
              <label htmlFor="rcode">{t('Код комнаты', 'Room code')}</label>
              <input id="rcode" className="code-input" value={code} maxLength={5} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(normalizeCode(e.target.value))} />
            </div>
            <button type="button" className="secondary" disabled={busy || code.length !== 5} onClick={() => joinTeam(code, kind, who())}>
              {busy ? t('Подключаемся…', 'Connecting…') : t('Войти в комнату', 'Join the room')}
            </button>
          </div>
        </div>
        {error && (
          <p className="problem" role="alert">
            {t(error)}
          </p>
        )}
      </div>
    </section>
  );
}

// ---- shared pieces -----------------------------------------------------------

export function LostBanner() {
  const t = useT();
  const team = useStore((s) => s.team);
  if (!team || team.status !== 'lost') return null;
  return (
    <div className="problem banner" role="alert">
      <span>{team.error ? t(team.error) : t('Связь потеряна.', 'Connection lost.')}</span>
      <button type="button" className="link" onClick={() => leaveRoom()}>
        {t('Выйти из комнаты', 'Leave the room')}
      </button>
    </div>
  );
}

export function Chat({ state }: { state: TeamState }) {
  const t = useT();
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [state.chat.length]);
  return (
    <div className="chat">
      <h3>{t('Обсуждение', 'Discussion')}</h3>
      <ol ref={list} aria-live="polite" aria-label={t('Сообщения команды', 'Team messages')}>
        {state.chat.length === 0 && (
          <li className="muted">{t('Пока тихо. Предложите изменение или спросите, что нужно другим ролям.', 'Quiet so far. Propose a change or ask what the other roles need.')}</li>
        )}
        {state.chat.map((m) => (
          <li key={m.id}>
            <b>{m.name}</b> {m.text}
          </li>
        ))}
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) teamSend({ t: 'chat', text });
          setText('');
        }}
      >
        <label htmlFor="chat-text" className="sr-only">
          {t('Сообщение команде', 'Message to the team')}
        </label>
        <input id="chat-text" value={text} maxLength={240} onChange={(e) => setText(e.target.value)} placeholder={t('Написать команде', 'Write to the team')} />
        <button type="submit" className="secondary" disabled={!text.trim()}>
          {t('Отправить', 'Send')}
        </button>
      </form>
    </div>
  );
}

function RoleChips({ state, id }: { state: TeamState; id: string }) {
  const t = useT();
  const mine = rolesOf(state, id);
  if (mine.length === 0) return <span className="muted">{t('без роли', 'no role')}</span>;
  return (
    <span className="chips">
      {mine.map((r) => (
        <span key={r} className="role-chip" data-role={r}>
          {t(ROLES[r].name)}
        </span>
      ))}
    </span>
  );
}

// ---- lobby -------------------------------------------------------------------

export function Lobby() {
  const t = useT();
  const team = useTeamState();
  const goto = useStore((s) => s.goto);
  const [copied, setCopied] = useState(false);
  const [rename, setRename] = useState('');
  const st = team?.state;
  const sc = st ? scenarioById(st.scenarioId) : null;

  const copy = async () => {
    if (!st) return;
    try {
      await navigator.clipboard.writeText(roomLink(st.code, st.kind));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="page lobby">
      <TopBar
        left={
          <>
            <button type="button" className="link" onClick={() => goto('home')}>
              {t('Выйти из комнаты', 'Leave the room')}
            </button>
            {st && <span className="crumb">{t(`Комната ${st.code}`, `Room ${st.code}`)}</span>}
          </>
        }
      />
      <LostBanner />
      {!st || !sc || !team ? (
        <p className="muted pad">{team?.lost ? '' : t('Подключаемся к комнате…', 'Connecting to the room…')}</p>
      ) : (
        <div className="lobby-grid">
          <div>
            <section className="invite">
              <span className="invite-label">{t('Код комнаты', 'Room code')}</span>
              <span className="invite-code" aria-label={st.code.split('').join(' ')}>
                {st.code}
              </span>
              <p className="muted">
                {st.kind === 'online'
                  ? t('Назовите код или отправьте ссылку: игрок войдёт со своего устройства.', 'Share the code or the link: a player can join from their own device.')
                  : t('Откройте эту же страницу в другой вкладке этого браузера и войдите по коду в режиме «На этом компьютере».', 'Open this page in another tab of this browser and join with the code in “On this computer” mode.')}
              </p>
              <button type="button" className="secondary" onClick={copy}>
                {copied ? t('Ссылка скопирована', 'Link copied') : t('Скопировать ссылку-приглашение', 'Copy the invitation link')}
              </button>
            </section>

            <section className="block">
              <h2>{t('Миссия', 'Mission')}</h2>
              {team.isHost ? (
                <div className="setup">
                  <div className="field">
                    <label htmlFor="lmission">{t('Миссия', 'Mission')}</label>
                    <select id="lmission" value={st.scenarioId} onChange={(e) => teamSend({ t: 'setup', scenarioId: e.target.value, difficulty: st.difficulty })}>
                      {SCENARIOS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {t(s.name)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <span id="ldiff">{t('Сложность', 'Difficulty')}</span>
                    <div className="segmented" role="radiogroup" aria-labelledby="ldiff">
                      {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                        <button key={d} type="button" role="radio" aria-checked={st.difficulty === d} onClick={() => teamSend({ t: 'setup', scenarioId: st.scenarioId, difficulty: d })}>
                          {t(DIFFICULTY[d].name)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p>
                  <b>{t(sc.name)}</b>, {t(DIFFICULTY[st.difficulty].name).toLowerCase()}. {t('Миссию выбирает хозяин комнаты.', 'The host chooses the mission.')}
                </p>
              )}
              <p className="brief">{t(sc.brief)}</p>
            </section>
          </div>

          <div>
            <section className="block">
              <h2>{t(`Команда, ${st.members.length} из ${TEAM_MAX}`, `Team, ${st.members.length} of ${TEAM_MAX}`)}</h2>
              <ul className="members">
                {st.members.map((m) => (
                  <li key={m.id}>
                    <span>
                      <b>{m.name}</b>
                      {m.id === HOST && <span className="muted"> {t('(хозяин)', '(host)')}</span>}
                      {m.id === team.myId && <span className="muted"> {t('(вы)', '(you)')}</span>}
                    </span>
                    <RoleChips state={st} id={m.id} />
                  </li>
                ))}
              </ul>
              <form
                className="rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (rename.trim()) teamSend({ t: 'name', name: rename });
                  setRename('');
                }}
              >
                <label htmlFor="rename">{t('Сменить своё имя', 'Change your name')}</label>
                <div className="save-row">
                  <input id="rename" value={rename} maxLength={20} onChange={(e) => setRename(e.target.value)} />
                  <button type="submit" className="secondary" disabled={!rename.trim()}>
                    {t('Сохранить имя', 'Save the name')}
                  </button>
                </div>
              </form>
            </section>

            <section className="block">
              <h2>{t('Роли', 'Roles')}</h2>
              <ul className="role-table">
                {ROLE_LIST.map((r) => {
                  const owner = st.owners[r];
                  return (
                    <li key={r} data-role={r}>
                      <div>
                        <b>{t(ROLES[r].name)}</b>
                        <span className="muted">{t(ROLES[r].duty)}</span>
                      </div>
                      <div className="role-owner">
                        {owner ? <span>{memberName(st, owner)}</span> : <span className="muted">{t('свободна', 'free')}</span>}
                        {!owner && (
                          <button type="button" className="secondary small" onClick={() => teamSend({ t: 'claim', role: r })}>
                            {t('Взять роль', 'Take the role')}
                          </button>
                        )}
                        {owner === team.myId && (
                          <button type="button" className="link" onClick={() => teamSend({ t: 'release', role: r })}>
                            {t('Отказаться', 'Give up')}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {team.isHost && !allRolesOwned(st) && (
                <button type="button" className="secondary" onClick={() => teamSend({ t: 'auto' })}>
                  {t('Раздать свободные роли поровну', 'Share out the free roles evenly')}
                </button>
              )}
            </section>

            <div className="launch">
              {team.isHost ? (
                <button type="button" className="primary" disabled={!allRolesOwned(st) || team.lost} onClick={() => teamSend({ t: 'start' })}>
                  {t('Начать проектирование', 'Start designing')}
                </button>
              ) : (
                <p className="muted">{t('Проектирование начнёт хозяин комнаты, когда все роли будут розданы.', 'The host starts the design once every role is taken.')}</p>
              )}
              {team.isHost && !allRolesOwned(st) && <p className="muted">{t('Начать можно, когда у каждой роли есть владелец.', 'You can start once every role has an owner.')}</p>}
            </div>
            <Chat state={st} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---- studio side panel -----------------------------------------------------------

export function TeamPanel({ goals, blockers }: { goals: Goal[]; blockers: number }) {
  const t = useT();
  const team = useTeamState();
  const st = team?.state;
  if (!team || !st) return null;
  const mine = rolesOf(st, team.myId);
  const everyone = owners(st);
  const iAmReady = !!st.ready[team.myId];
  const readyCount = everyone.filter((id) => st.ready[id]).length;
  const canSign = mine.length > 0 && !team.lost;

  return (
    <div className="team-panel">
      <section>
        <h3>{t('Команда', 'Team')}</h3>
        <ul className="members compact">
          {st.members.map((m) => (
            <li key={m.id}>
              <span>
                <b>{m.name}</b>
                {m.id === team.myId && <span className="muted"> {t('(вы)', '(you)')}</span>}
              </span>
              <span className="ready-mark" data-ready={!!st.ready[m.id]}>
                {st.ready[m.id] ? t('готов', 'ready') : ''}
              </span>
              <RoleChips state={st} id={m.id} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>{t('Цели ролей', 'Role goals')}</h3>
        <p className="hint">
          {t('Ваши цели выделены. Чужие тоже видны: чтобы договориться, нужно знать, что нужно остальным.', 'Yours are highlighted. You can see the others’: to negotiate you need to know what they need.')}
        </p>
        <ul className="goals">
          {ROLE_LIST.map((r) => (
            <li key={r} data-role={r} data-mine={mine.includes(r)}>
              <b>
                {t(ROLES[r].name)}
                <span className="muted"> {memberName(st, st.owners[r])}</span>
              </b>
              <ul>
                {goals
                  .filter((g) => g.role === r)
                  .map((g) => (
                    <li key={g.id} data-met={g.met}>
                      <span className="goal-mark" aria-hidden="true">
                        {g.met ? '✓' : '✗'}
                      </span>
                      <span>
                        <span className="sr-only">{g.met ? t('Выполнено: ', 'Done: ') : t('Не выполнено: ', 'Not done: ')}</span>
                        {t(g.label)}
                        <span className="muted"> {t(g.detail)}</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <Chat state={st} />

      <div className="launch">
        <button
          type="button"
          className={iAmReady ? 'secondary' : 'primary'}
          disabled={!canSign || (!iAmReady && blockers > 0)}
          onClick={() => teamSend({ t: 'ready', ready: !iAmReady })}
        >
          {iAmReady ? t('Снять подтверждение', 'Withdraw my sign-off') : t('Подтвердить запуск', 'Sign off for launch')}
        </button>
        <p className="muted">
          {blockers > 0
            ? t(`Пока есть обязательные замечания комиссии: ${blockers}.`, `The review board still has required findings: ${blockers}.`)
            : t(
                `Подтвердили ${readyCount} из ${everyone.length}. Миссия стартует, когда подтвердят все; любое изменение проекта снимает подтверждения.`,
                `${readyCount} of ${everyone.length} signed off. The mission launches when all have; any change to the design clears the sign-offs.`,
              )}
        </p>
      </div>
    </div>
  );
}

