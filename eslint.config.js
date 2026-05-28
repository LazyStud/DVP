import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },

  js.configs.recommended,

  // Base config for all source JS files
  {
    files: ['*.js', 'src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // project globals declared in one file, consumed by others
        DEBUG:       'readonly',
        reportError: 'readonly',
        Formats:     'readonly',
        DB:          'readonly',
        VenueWindow: 'readonly',
        // CDN libraries loaded via <script> tags
        d3:          'readonly',
        topojson:    'readonly',
        initSqlJs:   'readonly',
      },
    },
    rules: {
      'prefer-const':              'warn',
      'no-unused-vars':            ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-async-promise-executor': 'error',
      'no-undef':                  'error',
      'no-prototype-builtins':     'error',
    },
  },

  // Files that DECLARE the shared globals — allow redeclaring them
  {
    files: ['db.js', 'formats.js'],
    rules: { 'no-redeclare': 'off' },
  },

  // Web worker — has importScripts and self but not window
  {
    files: ['venue-worker.js'],
    languageOptions: {
      globals: { ...globals.worker },
    },
  },

  // Config/tooling files are ES modules run by Node, not browser scripts
  {
    files: ['vite.config.js', 'eslint.config.js', 'vitest.config.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  prettierConfig,
];
