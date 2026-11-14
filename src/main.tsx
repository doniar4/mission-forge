import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { readSharedLink } from './store';
import { readRoomLink } from './team/net';
import './styles.css';

readSharedLink();
readRoomLink();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
