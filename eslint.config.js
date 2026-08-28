/**
 * eslint.config.js
 * ================
 * ESLint 9 flat config.
 *
 * Goal: catch the mistakes that actually bite in this codebase —
 * unused imports left behind after a refactor, and accidental globals.
 * Style is not enforced; that is not what breaks extensions.
 */

import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType:  'module',
      globals: {
        chrome:          'readonly',
        fetch:           'readonly',
        console:         'readonly',
        atob:            'readonly',
        btoa:            'readonly',
        TextEncoder:     'readonly',
        TextDecoder:     'readonly',
        URLSearchParams: 'readonly',
        setTimeout:      'readonly',
        clearTimeout:    'readonly',
        setInterval:     'readonly',
        clearInterval:   'readonly',
        document:        'readonly',
        window:          'readonly',
        Image:           'readonly',
        FileReader:      'readonly',
        Blob:            'readonly',
        DOMParser:       'readonly',
        FormData:        'readonly',
        location:        'readonly',
        alert:           'readonly',
        URL:             'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        argsIgnorePattern:     '^_',
        varsIgnorePattern:     '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      // Parser regexes escape '-' inside character classes on purpose:
      // it reads clearer and survives being moved around the class.
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['bot/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        Buffer:       'readonly',
        console:      'readonly',
        fetch:        'readonly',
        process:      'readonly',
        setTimeout:   'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Discord ANSI code blocks intentionally strip the ESC control byte.
      'no-control-regex': 'off',
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
  },
  {
    // Build tooling runs in Node, not in the browser.
    files: ['build.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType:  'module',
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
];
