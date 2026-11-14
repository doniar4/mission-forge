import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' keeps the build portable (GitHub Pages serves from a sub-path).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
