import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { play } from '../audio/sfx';
import { sendReset, setNewPassword, signIn, signOut, signUp, useAuth, type Result } from '../auth/session';
import { authConfigured } from '../auth/supabase';
import type { L } from '../engine/types';
import { useT } from '../i18n';
import { useStore } from '../store';
import { LangToggle, SoundToggle } from './common';

type Mode = 'in' | 'up' | 'forgot' | 'reset';

/** How strong a password looks: 0 (empty) to 4. Length matters most. */
function strength(p: string): number {
  if (!p) return 0;
  let s = p.length >= 8 ? 1 : 0;
  if (p.length >= 12) s++;
  if (/[a-zа-я]/.test(p) && /[A-ZА-Я]/.test(p)) s++;
  if (/\d/.test(p) && /[^\p{L}\d]/u.test(p)) s++;
  else if (/\d/.test(p) || /[^\p{L}\d]/u.test(p)) s += 0.5;
  return Math.min(4, Math.max(p.length >= 6 ? 1 : 0, Math.floor(s)));
}

const STRENGTH: L[] = [
  { ru: '', en: '' },
  { ru: 'Слабый', en: 'Weak' },
  { ru: 'Сойдёт', en: 'Fair' },
  { ru: 'Хороший', en: 'Good' },
  { ru: 'Отличный', en: 'Strong' },
];

/**
 * Sign in, create an account, recover a password. Accounts are optional: the game is fully
 * playable as a guest, and without a configured Supabase project this page explains how to add one.
 */
export function Auth() {
  const t = useT();
  const goto = useStore((s) => s.goto);
  const { status, account, recovering } = useAuth();
  const [mode, setMode] = useState<Mode>(recovering ? 'reset' : 'in');
  useEffect(() => {
    if (recovering) setMode('reset');
  }, [recovering]);

  const heading: Record<Mode, [string, string]> = {
    in: [t('С возвращением,', 'Welcome back,'), t('командир.', 'commander.')],
    up: [t('Ваш первый', 'Your first'), t('запуск.', 'launch.')],
    forgot: [t('Потеряли', 'Lost your'), t('ключи?', 'keys?')],
    reset: [t('Новый', 'A new'), t('пароль.', 'password.')],
  };
  const signed = status === 'signed' && account && mode !== 'reset';
  const [h1, h2] = signed ? [t('На связи,', 'Online,'), `${account!.name}.`] : heading[mode];

  return (
    <div className="auth">
      <header className="auth-top">
        <button type="button" className="ghost" onClick={() => goto('home')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          {t('В игру', 'Back to the game')}
        </button>
        <div className="auth-tools">
          <SoundToggle />
          <LangToggle />
        </div>
      </header>

      <section className="auth-stage" aria-hidden="true">
        <Orbits />
      </section>

      <section className="auth-copy">
        <p className="auth-eyebrow">
          <span>Mission Forge</span>
          <span>{t('Центр управления', 'Mission control')}</span>
        </p>
        <h1 className="auth-title" key={`${h1}${h2}`}>
          <span className="auth-line">
            <span>{h1}</span>
          </span>
          <span className="auth-line">
            <span>{h2}</span>
          </span>
        </h1>
        <ol className="auth-perks">
          <li>
            <span>01</span>
            {t('Один аккаунт на всех ваших устройствах.', 'One account on all your devices.')}
          </li>
          <li>
            <span>02</span>
            {t('Мы храним только почту. Имена и чат команды остаются в игре.', 'We keep only your email. Names and team chat stay in the game.')}
          </li>
          <li>
            <span>03</span>
            {t('Играть можно и без аккаунта — как гость.', 'You can also play without one, as a guest.')}
          </li>
        </ol>
      </section>

      <section className="auth-panel" aria-live="polite">
        {!authConfigured ? (
          <GuestOnly />
        ) : status === 'loading' ? (
          <div className="auth-card auth-skeleton" aria-busy="true" aria-label={t('Загрузка', 'Loading')}>
            <i />
            <i />
            <i />
            <i />
          </div>
        ) : signed ? (
          <SignedIn />
        ) : (
          <Forms mode={mode} setMode={setMode} />
        )}
      </section>
    </div>
  );
}

/** Slowly turning orbits with a spacecraft on each: the page's one moving picture. */
function Orbits() {
  const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <svg className="auth-orbits" viewBox="-400 -400 800 800">
      <defs>
        <radialGradient id="auth-planet" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#7aaeff" />
          <stop offset="45%" stopColor="#1d3b78" />
          <stop offset="100%" stopColor="#040814" />
        </radialGradient>
        <radialGradient id="auth-halo" r="50%">
          <stop offset="60%" stopColor="rgba(122,174,255,0.25)" />
          <stop offset="100%" stopColor="rgba(122,174,255,0)" />
        </radialGradient>
      </defs>
      <circle r="150" fill="url(#auth-halo)" />
      <circle r="96" fill="url(#auth-planet)" />
      {[
        { rx: 170, ry: 58, tilt: -24, dur: 14 },
        { rx: 250, ry: 96, tilt: 18, dur: 22 },
        { rx: 340, ry: 140, tilt: -8, dur: 34 },
      ].map((o, i) => (
        <g key={i} transform={`rotate(${o.tilt})`}>
          <ellipse rx={o.rx} ry={o.ry} className="auth-orbit" />
          <circle r={i === 1 ? 5 : 3.5} className="auth-craft" cx={still ? o.rx * Math.cos(i * 2.1) : 0} cy={still ? o.ry * Math.sin(i * 2.1) : 0}>
            {!still && (
              <animateMotion dur={`${o.dur}s`} repeatCount="indefinite" path={`M ${o.rx} 0 A ${o.rx} ${o.ry} 0 1 1 ${-o.rx} 0 A ${o.rx} ${o.ry} 0 1 1 ${o.rx} 0`} />
            )}
          </circle>
        </g>
      ))}
    </svg>
  );
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  children,
  invalid,
  describedBy,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  children?: ReactNode;
  invalid?: boolean;
  describedBy?: string;
}) {
  const id = useId();
  return (
    <div className="auth-field" data-filled={value !== '' || undefined} data-invalid={invalid || undefined}>
      <input
        id={id}
        type={type}
        value={value}
        placeholder=" "
        autoComplete={autoComplete}
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
      />
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function PasswordField({ label, value, onChange, autoComplete, meter }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string; meter?: boolean }) {
  const t = useT();
  const [show, setShow] = useState(false);
  const meterId = useId();
  const s = strength(value);
  return (
    <>
      <Field label={label} type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} describedBy={meter ? meterId : undefined}>
        <button
          type="button"
          className="auth-eye"
          aria-pressed={show}
          aria-label={show ? t('Скрыть пароль', 'Hide password') : t('Показать пароль', 'Show password')}
          onClick={() => setShow((x) => !x)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {show && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </Field>
      {meter && (
        <div className="auth-meter" data-level={s} id={meterId} aria-live="polite">
          <span className="auth-meter-bars" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <i key={i} data-on={s >= i || undefined} />
            ))}
          </span>
          <span>{value ? t(STRENGTH[s]) : t('Не меньше 8 символов', 'At least 8 characters')}</span>
        </div>
      )}
    </>
  );
}

function Forms({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const t = useT();
  const goto = useStore((s) => s.goto);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<L | null>(null);
  const [note, setNote] = useState<L | null>(null);
  const first = useRef<HTMLDivElement>(null);

  // A fresh form for every mode; keep the email, it is usually the same.
  useEffect(() => {
    setPassword('');
    setError(null);
    setNote(null);
    first.current?.querySelector('input')?.focus({ preventScroll: true });
  }, [mode]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const ready =
    mode === 'forgot' ? emailOk : mode === 'reset' ? password.length >= 8 : mode === 'up' ? emailOk && password.length >= 8 : emailOk && password.length > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    let r: Result;
    if (mode === 'in') r = await signIn(email, password);
    else if (mode === 'up') r = await signUp(email, password);
    else if (mode === 'forgot') r = await sendReset(email);
    else r = await setNewPassword(password);
    setBusy(false);
    if (!r.ok) {
      play('deny');
      setError(r.error);
      return;
    }
    play('success');
    if (r.note) setNote(r.note);
    else if (mode === 'reset') setNote({ ru: 'Пароль обновлён. Вы в системе.', en: 'Password updated. You are signed in.' });
  };

  const label: Record<Mode, string> = {
    in: t('Войти', 'Sign in'),
    up: t('Создать аккаунт', 'Create account'),
    forgot: t('Прислать ссылку', 'Send the link'),
    reset: t('Сохранить пароль', 'Save the password'),
  };

  if (note)
    return (
      <div className="auth-card auth-done">
        <span className="auth-done-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48">
            <path d="M8 14h32v22H8z" />
            <path d="M8 14l16 12 16-12" />
          </svg>
        </span>
        <h2>{mode === 'reset' ? t('Готово', 'Done') : t('Проверьте почту', 'Check your inbox')}</h2>
        <p>{t(note)}</p>
        <div className="auth-row">
          {mode === 'reset' ? (
            <button type="button" className="primary" onClick={() => goto('home')}>
              {t('В игру', 'To the game')}
            </button>
          ) : (
            <button type="button" className="secondary" onClick={() => setMode('in')}>
              {t('К входу', 'Back to sign in')}
            </button>
          )}
        </div>
      </div>
    );

  return (
    <form className="auth-card" onSubmit={submit} noValidate>
      {(mode === 'in' || mode === 'up') && (
        <div className="auth-tabs" role="tablist" aria-label={t('Вход или регистрация', 'Sign in or sign up')} data-at={mode}>
          <button type="button" role="tab" aria-selected={mode === 'in'} onClick={() => setMode('in')}>
            {t('Вход', 'Sign in')}
          </button>
          <button type="button" role="tab" aria-selected={mode === 'up'} onClick={() => setMode('up')}>
            {t('Регистрация', 'Sign up')}
          </button>
          <i aria-hidden="true" />
        </div>
      )}
      {mode === 'forgot' && <p className="auth-lead">{t('Пришлём ссылку, по которой можно задать новый пароль.', 'We will email you a link to set a new password.')}</p>}
      {mode === 'reset' && <p className="auth-lead">{t('Придумайте новый пароль для своего аккаунта.', 'Choose a new password for your account.')}</p>}

      <div className="auth-fields" ref={first}>
        {mode !== 'reset' && <Field label={t('Почта', 'Email')} type="email" value={email} onChange={setEmail} autoComplete="email" invalid={email !== '' && !emailOk} />}
        {mode !== 'forgot' && (
          <PasswordField
            label={mode === 'reset' ? t('Новый пароль', 'New password') : t('Пароль', 'Password')}
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            meter={mode === 'up' || mode === 'reset'}
          />
        )}
      </div>

      {error && (
        <p className="auth-error" role="alert">
          {t(error)}
        </p>
      )}

      <button type="submit" className="auth-submit" disabled={!ready || busy} data-busy={busy || undefined}>
        <span>{busy ? t('Секунду…', 'One moment…') : label[mode]}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>

      <div className="auth-links">
        {mode === 'in' && (
          <button type="button" className="link" onClick={() => setMode('forgot')}>
            {t('Забыли пароль?', 'Forgot your password?')}
          </button>
        )}
        {mode === 'forgot' && (
          <button type="button" className="link" onClick={() => setMode('in')}>
            {t('Вспомнили? Войти', 'Remembered it? Sign in')}
          </button>
        )}
        <button type="button" className="link auth-guest" onClick={() => goto('home')}>
          {t('Играть как гость', 'Play as a guest')}
        </button>
      </div>
      {mode === 'up' && (
        <p className="auth-fine">
          {t('Мы храним только почту, а пароль — в зашифрованном виде.', 'We store only your email; the password is kept encrypted.')}
        </p>
      )}
    </form>
  );
}

function SignedIn() {
  const t = useT();
  const goto = useStore((s) => s.goto);
  const account = useAuth((s) => s.account)!;
  const [busy, setBusy] = useState(false);
  return (
    <div className="auth-card auth-account">
      <span className="auth-avatar" aria-hidden="true">
        {account.name.slice(0, 1).toUpperCase() || '·'}
      </span>
      <h2>{account.name}</h2>
      <p className="muted">{account.email}</p>
      <div className="auth-row">
        <button type="button" className="primary" onClick={() => goto('home')}>
          {t('В игру', 'To the game')}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await signOut();
            setBusy(false);
          }}
        >
          {t('Выйти', 'Sign out')}
        </button>
      </div>
    </div>
  );
}

/** Only if a build drops the Supabase settings: no excuses on screen, just the way into the game. */
function GuestOnly() {
  const t = useT();
  const goto = useStore((s) => s.goto);
  return (
    <div className="auth-card">
      <button type="button" className="auth-submit" onClick={() => goto('home')}>
        <span>{t('Играть как гость', 'Play as a guest')}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}
