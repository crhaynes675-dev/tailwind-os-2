import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Source only — dist/ holds compiled CommonJS that vitest cannot import.
    include: ['src/**/*.test.ts'],
  },
});
