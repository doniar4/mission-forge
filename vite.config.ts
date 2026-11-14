import { networkInterfaces } from 'node:os';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const PORT = 5173;

/** This computer's address on the local network, so phones and laptops on the same Wi-Fi can join. */
function lanAddress(): string {
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  return '';
}

// base './' keeps the build portable (GitHub Pages serves from a sub-path).
export default defineConfig(({ command }) => {
  const lan = command === 'serve' ? lanAddress() : '';
  return {
    base: './',
    plugins: [react()],
    // Listen on the local network too: team players open the game from their own devices.
    server: { host: true, port: PORT },
    define: { __LAN_ORIGIN__: JSON.stringify(lan ? `http://${lan}:${PORT}` : '') },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});
