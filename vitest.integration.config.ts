import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Config dedicada a tests de integracion (npm run test:rls).
// Corre en entorno node contra el proyecto Supabase real (cloud, .env.local);
// excluida del `npm test` normal (que usa vitest.config.ts / jsdom).
loadEnv({ path: path.resolve(__dirname, '.env.local') });

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/test/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
