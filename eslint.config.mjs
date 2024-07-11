import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'
import typescriptEslintParser from '@typescript-eslint/parser'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import pluginVue from 'eslint-plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default [
  // Vue app configs
  ...pluginVue.configs['flat/recommended'].map((config) => ({
    ...config,
    files: ['projects/vue-app/**/*.vue', 'projects/vue-app/**/*.js', 'projects/vue-app/**/*.ts'],
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        ...config.languageOptions?.parserOptions,
        parser: '@typescript-eslint/parser',
      },
    },
  })),
  // Expo app configs
  ...compat.extends('expo').map((config) => ({
    ...config,
    files: ['projects/expo-app/**/*.js', 'projects/expo-app/**/*.ts', 'projects/expo-app/**/*.tsx'],
    ignores: [...(config.ignores ?? []), 'projects/expo-app/babel.config.js', 'projects/expo-app/scripts/**/*.js'],
    languageOptions: {
      ...config.languageOptions,
      parser: typescriptEslintParser,
      parserOptions: {
        project: true,
      },
    },
  })),
  {
    files: ['projects/expo-app/**/*.js', 'projects/expo-app/**/*.ts', 'projects/expo-app/**/*.tsx'],
    rules: {
      'import/namespace': 'off',
      'import/no-unresolved': 'off',
    },
  },
  eslintPluginPrettierRecommended,
]
