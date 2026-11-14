import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initAuth } from './auth/session';
import { readSharedLink, useStore } from './store';
import { readRoomLink } from './team/net';
import './styles.css';

readSharedLink();
readRoomLink();
// Restores a signed-in player and finishes a sign-in from an email link (no-op without Supabase).
void initAuth();
// Development only: lets tests and the console reach the game state.
if (import.meta.env.DEV) (window as unknown as { __store?: unknown }).__store = useStore;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
