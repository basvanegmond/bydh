import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', '_archive', 'src/components/ui'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
    },
  },
  {
    // Fixtures index into records they just built, and geometry code indexes arrays modulo their
    // length; with noUncheckedIndexedAccess, `!` is clearer than guards there.
    files: ['tests/**/*.ts', 'src/domain/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // Entities live in Record<Id, T> maps; `delete map[id]` is how they are removed.
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    rules: { '@typescript-eslint/no-dynamic-delete': 'off' },
  },
  {
    // The domain layer is pure TypeScript: no React, three.js, stores or DOM-bound code.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-*', 'react/*'], message: 'src/domain must stay framework-free.' },
            { group: ['three', 'three/*', '@react-three/*'], message: 'src/domain must stay renderer-free.' },
            {
              group: ['zustand', 'zustand/*', '@/store/*', '@/render*/*', '@/features/*', '@/app/*'],
              message: 'src/domain must not depend on app layers.',
            },
          ],
        },
      ],
    },
  },
);
