import { resolve } from 'path'
import { existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import vueDevTools from 'vite-plugin-vue-devtools'

// 获取编辑器路径（用于 DevTools 的 "在编辑器中打开" 功能）
function getEditor() {
  const editor = process.env.VUE_EDITOR || 'code'
  if (process.platform === 'win32' && (editor === 'code' || editor === 'vscode')) {
    const possiblePaths = [
      resolve(process.env.USERPROFILE || '', 'AppData/Local/Programs/Microsoft VS Code/bin/code.cmd'),
      resolve('C:/Program Files/Microsoft VS Code/bin/code.cmd'),
      resolve('C:/Program Files (x86)/Microsoft VS Code/bin/code.cmd')
    ]
    for (const p of possiblePaths) {
      if (existsSync(p)) return p
    }
  }
  return editor
}

const isProduction = process.env.NODE_ENV === 'production'

// 自定义插件：在构建后复制 chrome-extension-api.preload.js
function copyChromeExtensionPreload() {
  return {
    name: 'copy-chrome-extension-preload',
    closeBundle() {
      const src = resolve(__dirname, 'node_modules/electron-chrome-extensions/dist/chrome-extension-api.preload.js')
      const destDir = resolve(__dirname, 'out/preload')
      const dest = resolve(destDir, 'chrome-extension-api.preload.js')

      if (existsSync(src)) {
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true })
        }
        copyFileSync(src, dest)
        console.log('[copy-chrome-extension-preload] Copied to out/preload/')
      } else {
        console.warn('[copy-chrome-extension-preload] Source not found:', src)
      }
    }
  }
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts')
        }
      }
    }
  },
  preload: {
    plugins: [copyChromeExtensionPreload()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: '.',
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    optimizeDeps: {
      exclude: [
        'electron-chrome-extensions',
        'electron-chrome-extensions/browser-action',
        'electron-chrome-extensions/dist/browser-action'
      ]
    },
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => tag === 'browser-action-list'
          }
        }
      }),
      tailwindcss(),
      // 仅开发环境启用 Vue DevTools
      ...(isProduction ? [] : [vueDevTools({ launchEditor: getEditor() })])
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html')
        }
      }
    }
  }
})
