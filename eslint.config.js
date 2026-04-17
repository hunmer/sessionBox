const js = require('@eslint/js')
const tseslint = require('typescript-eslint')
const pluginVue = require('eslint-plugin-vue')

module.exports = tseslint.config(
  // 全局忽略
  {
    ignores: [
      'node_modules/',
      'out/',
      'dist/',
      'resources/',
      'scripts/',
      '*.config.js',
      '*.config.ts',
      '*.json'
    ]
  },

  // 基础 JS 规则
  js.configs.recommended,

  // TypeScript 规则
  ...tseslint.configs.recommended,

  // Vue 规则
  ...pluginVue.configs['flat/recommended'],

  // Vue 文件需要 TypeScript 解析器
  {
    files: ['*.vue', '**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  },

  // 自定义规则：代码行数限制
  {
    files: ['**/*.{ts,js,vue}'],
    rules: {
      'max-lines': ['error', { max: 1000, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 50, skipBlankLines: true, skipComments: true, IIFEs: false }
      ]
    }
  },

  // 放宽 TypeScript 规则（仅做行数检查，不做类型检查）
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off'
    }
  }
)
