import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/* The simulator runs under vitest, not as a test: `npm run sim`. Each
   *.sim.ts file is an experiment; files run in parallel. */
export default defineConfig({
  resolve: {
    alias: { '~': fileURLToPath(new URL('../app', import.meta.url)) },
  },
  test: {
    include: ['sim/**/*.sim.ts'],
    testTimeout: 6 * 60 * 60 * 1000,
    hookTimeout: 60 * 1000,
  },
});
