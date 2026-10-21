import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
export default defineConfig(
  {
    ignores: [
      'dist/**',
      'output/**',
      '.astro/**',
      '.wrangler/**',
      '.npm-cache/**',
      '.local-tools/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...astro.configs.recommended,
  {
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        location: 'readonly',
        history: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Buffer: 'readonly',
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        HTMLButtonElement: 'readonly',
      },
    },
  },
);
