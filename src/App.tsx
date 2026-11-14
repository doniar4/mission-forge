import { useEffect } from 'react';
import { useStore } from './store';
import { Flight } from './ui/Flight';
import { Home } from './ui/Home';
import { Debrief } from './ui/Debrief';
import { Studio } from './ui/Studio';
import { Lobby } from './ui/Team';

export function App() {
  const screen = useStore((s) => s.screen);
  const lang = useStore((s) => s.lang);
  const sim = useStore((s) => s.sim);
  const goto = useStore((s) => s.goto);
  const inTeam = useStore((s) => !!s.team);

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

  if (screen === 'lobby' && inTeam) return <Lobby />;
  if (screen === 'studio') return <Studio />;
  if (screen === 'flight' && sim) return <Flight />;
  if (screen === 'report' && sim) return <Debrief />;
  return <Home />;
}
