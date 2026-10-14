import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      ['shared', 'db', 'mail', 'platform'].map((name) => [
        `@flare/${name}`,
        fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
      ]),
    ),
  },
  test: {
    include: ['tests/evals/**/*.eval.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    reporters: ['verbose'],
    fileParallelism: false,
    hookTimeout: 30000,
  },
});
