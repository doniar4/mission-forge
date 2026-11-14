import { useEffect } from 'react';
import { useStore } from './store';
import { Flight } from './ui/Flight';
import { Home } from './ui/Home';
import { Debrief } from './ui/Debrief';
import { Auth } from './ui/Auth';
import { useAuth } from './auth/session';
import { Development } from './ui/Development';
import { Studio } from './ui/Studio';
import { Lobby } from './ui/Team';

export function App() {
  const screen = useStore((s) => s.screen);
  const lang = useStore((s) => s.lang);
  const sim = useStore((s) => s.sim);
  const goto = useStore((s) => s.goto);
  const inTeam = useStore((s) => !!s.team);
  const recovering = useAuth((s) => s.recovering);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  // The design room is daylight; flight happens in the dark.
  useEffect(() => {
    document.documentElement.dataset.mode = 'space';
    window.scrollTo(0, 0);
  }, [screen]);
  // Flight and report need a flown mission; without one, go back to the drawing board.
  useEffect(() => {
    if ((screen === 'flight' || screen === 'report') && !sim) goto('studio');
  }, [screen, sim, goto]);

  // A lobby needs a room: if it is gone (left, or the page was reloaded), go home.
  useEffect(() => {
    if (screen === 'lobby' && !inTeam) goto('home');
  }, [screen, inTeam, goto]);

  // A password-reset link opens the "new password" form wherever the player was.
  useEffect(() => {
    if (recovering) goto('auth');
  }, [recovering, goto]);

  if (screen === 'auth') return <Auth />;
  if (screen === 'lobby' && inTeam) return <Lobby />;
  if (screen === 'studio') return <Studio />;
  if (screen === 'dev') return <Development />;
  if (screen === 'flight' && sim) return <Flight />;
  if (screen === 'report' && sim) return <Debrief />;
  return <Home />;
}
