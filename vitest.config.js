import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node environment — no DOM needed for pure logic tests
    environment: 'node',
    // Where to find test files
    include: ['tests/unit/**/*.spec.js'],
    // Reporter: verbose in CI (where NO_COLOR is set), concise locally
    reporter: process.env.CI ? 'verbose' : 'default',
  },
});
