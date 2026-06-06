import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.spec.js'],
    reporter: process.env.CI ? 'verbose' : 'default',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      // D3 rendering layers and DOM-heavy entry points can't be exercised in a
      // Node environment — exclude them so the thresholds reflect the logic layer
      exclude: [
        'src/layers/**',
        'src/globe/**',
        'src/main.js',
        'src/venue.js',
        'src/venue-worker.js',
        'src/debug.js',
      ],
      reporter: ['text', 'lcov', 'html', 'json', 'json-summary'],
      // Regression floor set at current levels — raise as test coverage improves.
      // Most of src/ui/ and src/data/queries.js are DOM/SQL templates with near-0%
      // coverage, which keeps the aggregate low even after excluding rendering layers.
      thresholds: {
        lines: 45,
        functions: 42,
        branches: 35,
        statements: 44,
      },
    },
  },
});
