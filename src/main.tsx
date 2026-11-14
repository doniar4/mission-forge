import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { readSharedLink, useStore } from './store';
import { readRoomLink } from './team/net';
import './styles.css';

readSharedLink();
readRoomLink();
// Development only: lets tests and the console reach the game state.
if (import.meta.env.DEV) (window as unknown as { __store?: unknown }).__store = useStore;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
