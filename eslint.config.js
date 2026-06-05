import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },

  js.configs.recommended,

  // Legacy IIFE scripts still at root (venue.js, venue-worker.js — kept for reference)
  {
    files: ['*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        DEBUG:       'readonly',
        reportError: 'readonly',
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

  // ES modules under src/ — support import/export and top-level await
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        DEBUG:       'readonly',
        reportError: 'readonly',
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


  // Web workers — classic scripts with importScripts, self, no window
  {
    files: ['venue-worker.js', 'src/venue-worker.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
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
