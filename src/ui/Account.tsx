import { useAuth } from '../auth/session';
import { useT } from '../i18n';
import { useStore } from '../store';

/** "Sign in", or the signed-in player's initial and name; both open the account page. */
export function AccountButton() {
  const t = useT();
  const goto = useStore((s) => s.goto);
  const { status, account } = useAuth();
  if (status === 'loading') return <span className="account-btn" data-state="loading" aria-hidden="true" />;
  if (status === 'signed' && account)
    return (
      <button type="button" className="account-btn" data-state="signed" onClick={() => goto('auth')} aria-label={t(`Аккаунт: ${account.email}`, `Account: ${account.email}`)}>
        <span className="account-avatar" aria-hidden="true">
          {account.name.slice(0, 1).toUpperCase() || '·'}
        </span>
        <span className="account-name">{account.name}</span>
      </button>
    );
  return (
    <button type="button" className="account-btn" data-state="guest" onClick={() => goto('auth')}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
      <span>{t('Войти', 'Sign in')}</span>
    </button>
  );
}
