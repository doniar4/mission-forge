import { useEffect } from 'react';
import { useStore } from './store';
import { Flight } from './ui/Flight';
import { Home } from './ui/Home';
import { Debrief } from './ui/Debrief';
import { Studio } from './ui/Studio';

export function App() {
  const screen = useStore((s) => s.screen);
  const lang = useStore((s) => s.lang);
  const sim = useStore((s) => s.sim);
  const goto = useStore((s) => s.goto);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  // The design room is daylight; flight happens in the dark.
  useEffect(() => {
    document.documentElement.dataset.mode = screen === 'flight' ? 'space' : 'paper';
    window.scrollTo(0, 0);
  }, [screen]);
  // Flight and report need a flown mission; without one, go back to the drawing board.
  useEffect(() => {
    if ((screen === 'flight' || screen === 'report') && !sim) goto('studio');
  }, [screen, sim, goto]);

  if (screen === 'studio') return <Studio />;
  if (screen === 'flight' && sim) return <Flight />;
  if (screen === 'report' && sim) return <Debrief />;
  return <Home />;
}
