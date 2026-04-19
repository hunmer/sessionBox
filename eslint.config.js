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

  // 全局变量声明
  {
    languageOptions: {
      globals: {
        // Browser
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        localStorage: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        confirm: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        DragEvent: 'readonly',
        TouchEvent: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLAudioElement: 'readonly',
        Node: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        Audio: 'readonly',
        DOMRect: 'readonly',
        ResizeObserver: 'readonly',
        // Electron
        __APP_VERSION__: 'readonly'
      }
    }
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
      'max-lines': ['warn', { max: 1000, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'warn',
        { max: 200, skipBlankLines: true, skipComments: true, IIFEs: false }
      ]
    }
  },

  // 放宽规则
  {
    rules: {
      // TypeScript
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
      // Vue
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
      // 允许空 catch 块
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  }
)
