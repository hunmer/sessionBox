import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface HomepageSettings {
  url: string
  autoOpen: boolean
}

const STORAGE_KEY = 'sessionbox-homepage'

const defaults: HomepageSettings = {
  url: 'https://web.jgtab.link',
  autoOpen: false,
}

function loadSettings(): HomepageSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch { /* 忽略解析错误 */ }
  return { ...defaults }
}

export const useHomepageStore = defineStore('homepage', () => {
  const settings = ref<HomepageSettings>(loadSettings())

  function updateSettings(patch: Partial<HomepageSettings>) {
    settings.value = { ...settings.value, ...patch }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
  }

  /** 是否已配置主页 */
  const hasHomepage = () => !!settings.value.url.trim()

  return { settings, updateSettings, hasHomepage }
})
