import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom for the browser APIs the outbox relies on (localStorage, events).
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
