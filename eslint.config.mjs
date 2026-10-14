import js from '@eslint/js';
import ts from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default ts.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/public/monaco/**', '**/node_modules/**', '.tools/**', '.venv/**', 'coverage/**', 'test-results/**', 'playwright-report/**', '**/next-env.d.ts'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  prettier,
  { files: ['**/*.ts', '**/*.tsx'], rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }], '@typescript-eslint/consistent-type-imports': 'error' } },
  { files: ['**/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', fetch: 'readonly', URL: 'readonly', setTimeout: 'readonly' } } },
);
