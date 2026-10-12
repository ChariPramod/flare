import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['apps/**/tests/**/*.integration.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
