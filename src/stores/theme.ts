import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type Theme = 'light' | 'dark'

export const useThemeStore = defineStore('theme', () => {
  const STORAGE_KEY = 'sessionbox-theme'

  const theme = ref<Theme>((localStorage.getItem(STORAGE_KEY) as Theme) || 'light')

  function applyTheme(t: Theme) {
    document.documentElement.classList.toggle('dark', t === 'dark')
    document.documentElement.classList.toggle('light', t === 'light')
  }

  function setTheme(t: Theme) {
    theme.value = t
    localStorage.setItem(STORAGE_KEY, t)
    applyTheme(t)
  }

  // 初始化应用主题
  applyTheme(theme.value)

  watch(theme, (t) => applyTheme(t))

  return { theme, setTheme }
})
