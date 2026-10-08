import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'chrome', message: 'Do not reference chrome in src/core/**. Keep core platform-independent.' },
        { name: 'document', message: 'Do not reference document in src/core/**. Keep core platform-independent.' },
        { name: 'window', message: 'Do not reference window in src/core/**. Keep core platform-independent.' },
        { name: 'HTMLElement', message: 'Do not reference HTMLElement in src/core/**. Keep core platform-independent.' },
      ],
    },
  },
];
