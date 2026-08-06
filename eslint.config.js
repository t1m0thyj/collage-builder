import js from '@eslint/js'
import svelte from 'eslint-plugin-svelte'
import tseslint from 'typescript-eslint'

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: { 'no-undef': 'off' },
  },
  { ignores: ['dist/', 'node_modules/', 'playwright-report/', 'test-results/'] },
]
