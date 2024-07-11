import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'
import typescriptEslintParser from '@typescript-eslint/parser'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pluginPadlet from './eslint-plugins/index.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default [
  js.configs.recommended,
  // Config files
  {
    files: ['prettier.config.js', 'projects/expo-app/babel.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Plugin files
  {
    files: ['eslint-plugins/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Vue app configs
  ...pluginVue.configs['flat/recommended'].map((config) => ({
    ...config,
    files: ['projects/vue-app/**/*.vue', 'projects/vue-app/**/*.js', 'projects/vue-app/**/*.ts'],
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        ...config.languageOptions?.parserOptions,
        parser: '@typescript-eslint/parser',
        project: 'projects/vue-app/tsconfig.app.json',
        extraFileExtensions: ['.vue'],
      },
    },
  })),
  {
    files: ['projects/vue-app/**/*.vue'],
    plugins: {
      '@padlet': pluginPadlet,
    },
    rules: {
      '@padlet/no-unstable-computed-value': 'error',
    },
  },
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
  // React Component files
  {
    files: ['projects/expo-app/**/*.tsx'],
    plugins: {
      '@padlet': pluginPadlet,
    },
    rules: {
      '@padlet/memoize-jsx-attributes': 'error',
    },
  },
  // Script files
  {
    files: ['projects/expo-app/scripts/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Prettier
  eslintPluginPrettierRecommended,
]
