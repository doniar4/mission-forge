import type { AuthError, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { L } from '../engine/types';
import { authConfigured, returnUrl, supabase } from './supabase';

/*
 * The signed-in player, if any. Kept apart from the game store: accounts are optional and the
 * game never waits for them.
 */

export interface Account {
  id: string;
  email: string;
  /** A short label for the account: the part of the email before the @. */
  name: string;
}

export type AuthStatus = 'off' | 'loading' | 'guest' | 'signed';

interface AuthState {
  status: AuthStatus;
  account: Account | null;
  /** Set when the player came back from a password-reset email: show "choose a new password". */
  recovering: boolean;
  /** Which form the account page opens on: the button the player pressed. */
  intent: 'in' | 'up';
}

export const useAuth = create<AuthState>(() => ({
  status: authConfigured ? 'loading' : 'off',
  account: null,
  recovering: false,
  intent: 'in',
}));

// Only the email goes to Supabase: player names and team chat never leave the game (AGENTS.md,
// rule 10). The name shown for an account is the part of the address before the @.
const toAccount = (u: User | null | undefined): Account | null =>
  u ? { id: u.id, email: u.email ?? '', name: (u.email ?? '').split('@')[0].slice(0, 40) } : null;

let started = false;

/** Restores the session (and finishes a sign-in from an email link). Safe to call more than once. */
export async function initAuth() {
  if (!authConfigured || started) return;
  started = true;
  try {
    const sb = await supabase();
    sb.auth.onAuthStateChange((event, session) => {
      const account = toAccount(session?.user);
      useAuth.setState({
        account,
        status: account ? 'signed' : 'guest',
        ...(event === 'PASSWORD_RECOVERY' ? { recovering: true } : {}),
      });
    });
    const { data } = await sb.auth.getSession();
    const account = toAccount(data.session?.user);
    useAuth.setState((s) => ({ account, status: account ? 'signed' : 'guest', recovering: s.recovering }));
    // The email link brought a ?code=…; once exchanged it only clutters the address bar.
    if (new URLSearchParams(location.search).has('code')) history.replaceState(null, '', location.pathname + location.hash);
  } catch {
    useAuth.setState({ status: 'guest' });
  }
}

/** Friendly words for what went wrong: never the player's fault, always a way forward. */
export function explain(e: unknown): L {
  const err = e as Partial<AuthError> & { message?: string };
  const code = String(err?.code ?? '');
  const msg = String(err?.message ?? '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login'))
    return { ru: 'Почта или пароль не подходят. Проверьте раскладку и Caps Lock — или восстановите пароль.', en: 'That email and password do not match. Check Caps Lock — or reset your password.' };
  if (code === 'email_not_confirmed' || msg.includes('not confirmed'))
    return { ru: 'Почта ещё не подтверждена. Откройте письмо от нас и нажмите на ссылку — потом войдите.', en: 'Your email is not confirmed yet. Open our email, follow the link, then sign in.' };
  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered'))
    return { ru: 'С этой почтой уже есть аккаунт. Войдите или восстановите пароль.', en: 'There is already an account with this email. Sign in, or reset your password.' };
  if (code === 'weak_password' || msg.includes('password should'))
    return { ru: 'Пароль слишком простой: нужно не меньше 8 символов, лучше с цифрами и буквами разного регистра.', en: 'That password is too easy to guess: use at least 8 characters, ideally with digits and mixed case.' };
  if (code.includes('rate_limit') || msg.includes('rate limit') || err?.status === 429)
    return { ru: 'Слишком много попыток подряд. Подождите минуту и попробуйте снова.', en: 'Too many attempts in a row. Wait a minute and try again.' };
  if (code === 'validation_failed' || msg.includes('invalid email') || msg.includes('unable to validate email'))
    return { ru: 'Похоже, в адресе почты опечатка. Проверьте его.', en: 'The email address looks mistyped. Please check it.' };
  if (msg.includes('fetch') || msg.includes('network'))
    return { ru: 'Нет связи с сервером входа. Проверьте интернет — играть можно и без аккаунта.', en: 'Cannot reach the sign-in server. Check your connection — you can play without an account too.' };
  return { ru: 'Не получилось. Попробуйте ещё раз через минуту.', en: 'That did not work. Please try again in a minute.' };
}

export type Result = { ok: true; note?: L } | { ok: false; error: L };

export async function signIn(email: string, password: string): Promise<Result> {
  try {
    const sb = await supabase();
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    return error ? { ok: false, error: explain(error) } : { ok: true };
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

export async function signUp(email: string, password: string): Promise<Result> {
  try {
    const sb = await supabase();
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: returnUrl() },
    });
    if (error) return { ok: false, error: explain(error) };
    // With email confirmation on (the Supabase default) there is no session until the link is followed.
    if (!data.session)
      return {
        ok: true,
        note: {
          ru: `Письмо отправлено на ${email.trim()}. Откройте его и нажмите на ссылку — аккаунт заработает.`,
          en: `We sent an email to ${email.trim()}. Open it and follow the link to activate your account.`,
        },
      };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

export async function sendReset(email: string): Promise<Result> {
  try {
    const sb = await supabase();
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: returnUrl() });
    if (error) return { ok: false, error: explain(error) };
    // The same answer whether or not the address has an account: nobody learns who plays here.
    return {
      ok: true,
      note: {
        ru: `Если аккаунт с адресом ${email.trim()} есть, письмо со ссылкой уже в пути.`,
        en: `If there is an account for ${email.trim()}, an email with a link is on its way.`,
      },
    };
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

export async function setNewPassword(password: string): Promise<Result> {
  try {
    const sb = await supabase();
    const { error } = await sb.auth.updateUser({ password });
    if (error) return { ok: false, error: explain(error) };
    useAuth.setState({ recovering: false });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

export async function signOut() {
  try {
    const sb = await supabase();
    await sb.auth.signOut();
  } finally {
    useAuth.setState({ account: null, status: authConfigured ? 'guest' : 'off' });
  }
}
