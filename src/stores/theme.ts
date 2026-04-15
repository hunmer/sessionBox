import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type Theme = 'light' | 'dark'

export interface ThemePreset {
  key: string
  label: string
  desc: string
  light: Record<string, string>
  dark: Record<string, string>
}

const THEME_KEY = 'sessionbox-theme'
const PRESET_KEY = 'sessionbox-theme-preset'
const CUSTOM_PRESET_KEY = 'sessionbox-theme-custom'

// 主题预设需要覆盖的 CSS 变量列表
export const THEME_VARS = [
  '--background', '--foreground', '--card', '--card-foreground',
  '--popover', '--popover-foreground', '--primary', '--primary-foreground',
  '--primary-light', '--secondary', '--secondary-foreground',
  '--muted', '--muted-foreground', '--accent', '--accent-foreground',
  '--destructive', '--destructive-foreground', '--border', '--input',
  '--ring', '--sidebar', '--sidebar-foreground', '--sidebar-primary',
  '--sidebar-primary-foreground', '--sidebar-accent', '--sidebar-accent-foreground',
  '--sidebar-hover', '--sidebar-border'
]

/** 生成空白的自定义主题模板 */
export function createEmptyThemeVars(): Record<string, string> {
  return Object.fromEntries(THEME_VARS.map(v => [v, '']))
}

export const themePresets: ThemePreset[] = [
  {
    key: 'default',
    label: '默认',
    desc: 'SessionBox 默认蓝色主题',
    light: {},
    dark: {}
  },
  {
    key: 'apple',
    label: 'Apple',
    desc: '简约精致的 Apple 设计风格',
    light: {
      '--background': '#ffffff',
      '--foreground': '#1d1d1f',
      '--card': '#ffffff',
      '--card-foreground': '#1d1d1f',
      '--primary': '#1d1d1f',
      '--primary-foreground': '#ffffff',
      '--primary-light': '#6e6e73',
      '--secondary': '#f5f5f7',
      '--secondary-foreground': '#1d1d1f',
      '--muted': '#f5f5f7',
      '--muted-foreground': '#86868b',
      '--accent': '#007aff',
      '--accent-foreground': '#ffffff',
      '--destructive': '#ff3b30',
      '--destructive-foreground': '#ffffff',
      '--border': '#d2d2d7',
      '--input': '#d2d2d7',
      '--ring': '#007aff',
      '--sidebar': '#f5f5f7',
      '--sidebar-foreground': '#1d1d1f',
      '--sidebar-primary': '#007aff',
      '--sidebar-primary-foreground': '#ffffff',
      '--sidebar-accent': '#e8e8ed',
      '--sidebar-accent-foreground': '#1d1d1f',
      '--sidebar-hover': '#e8e8ed',
      '--sidebar-border': '#d2d2d7',
    },
    dark: {
      '--background': '#000000',
      '--foreground': '#f5f5f7',
      '--card': '#1c1c1e',
      '--card-foreground': '#f5f5f7',
      '--primary': '#f5f5f7',
      '--primary-foreground': '#000000',
      '--primary-light': '#a1a1a6',
      '--secondary': '#2c2c2e',
      '--secondary-foreground': '#f5f5f7',
      '--muted': '#2c2c2e',
      '--muted-foreground': '#98989d',
      '--accent': '#0a84ff',
      '--accent-foreground': '#ffffff',
      '--destructive': '#ff453a',
      '--destructive-foreground': '#ffffff',
      '--border': '#38383a',
      '--input': '#38383a',
      '--ring': '#0a84ff',
      '--sidebar': '#1c1c1e',
      '--sidebar-foreground': '#f5f5f7',
      '--sidebar-primary': '#0a84ff',
      '--sidebar-primary-foreground': '#ffffff',
      '--sidebar-accent': '#2c2c2e',
      '--sidebar-accent-foreground': '#f5f5f7',
      '--sidebar-hover': '#2c2c2e',
      '--sidebar-border': '#38383a',
    }
  },
  {
    key: 'google',
    label: 'Google',
    desc: 'Material Design 蓝色主题',
    light: {
      '--background': '#ffffff',
      '--foreground': '#1f1f1f',
      '--card': '#ffffff',
      '--card-foreground': '#1f1f1f',
      '--primary': '#1a73e8',
      '--primary-foreground': '#ffffff',
      '--primary-light': '#4fc3f7',
      '--secondary': '#f1f3f4',
      '--secondary-foreground': '#1f1f1f',
      '--muted': '#f1f3f4',
      '--muted-foreground': '#5f6368',
      '--accent': '#1a73e8',
      '--accent-foreground': '#ffffff',
      '--destructive': '#d93025',
      '--destructive-foreground': '#ffffff',
      '--border': '#dadce0',
      '--input': '#dadce0',
      '--ring': '#1a73e8',
      '--sidebar': '#f1f3f4',
      '--sidebar-foreground': '#1f1f1f',
      '--sidebar-primary': '#1a73e8',
      '--sidebar-primary-foreground': '#ffffff',
      '--sidebar-accent': '#e8eaed',
      '--sidebar-accent-foreground': '#1f1f1f',
      '--sidebar-hover': '#e8eaed',
      '--sidebar-border': '#dadce0',
    },
    dark: {
      '--background': '#202124',
      '--foreground': '#e8eaed',
      '--card': '#292a2d',
      '--card-foreground': '#e8eaed',
      '--primary': '#8ab4f8',
      '--primary-foreground': '#202124',
      '--primary-light': '#4fc3f7',
      '--secondary': '#3c4043',
      '--secondary-foreground': '#e8eaed',
      '--muted': '#3c4043',
      '--muted-foreground': '#9aa0a6',
      '--accent': '#8ab4f8',
      '--accent-foreground': '#202124',
      '--destructive': '#f28b82',
      '--destructive-foreground': '#202124',
      '--border': '#3c4043',
      '--input': '#3c4043',
      '--ring': '#8ab4f8',
      '--sidebar': '#171717',
      '--sidebar-foreground': '#e8eaed',
      '--sidebar-primary': '#8ab4f8',
      '--sidebar-primary-foreground': '#202124',
      '--sidebar-accent': '#3c4043',
      '--sidebar-accent-foreground': '#e8eaed',
      '--sidebar-hover': '#3c4043',
      '--sidebar-border': '#3c4043',
    }
  },
  {
    key: 'tesla',
    label: 'Tesla',
    desc: '未来科技感的暗黑风格',
    light: {
      '--background': '#ffffff',
      '--foreground': '#0d0d0d',
      '--card': '#ffffff',
      '--card-foreground': '#0d0d0d',
      '--primary': '#0d0d0d',
      '--primary-foreground': '#ffffff',
      '--primary-light': '#e31937',
      '--secondary': '#f0f0f0',
      '--secondary-foreground': '#0d0d0d',
      '--muted': '#f0f0f0',
      '--muted-foreground': '#6b6b6b',
      '--accent': '#e31937',
      '--accent-foreground': '#ffffff',
      '--destructive': '#e31937',
      '--destructive-foreground': '#ffffff',
      '--border': '#e0e0e0',
      '--input': '#e0e0e0',
      '--ring': '#e31937',
      '--sidebar': '#f7f7f7',
      '--sidebar-foreground': '#0d0d0d',
      '--sidebar-primary': '#e31937',
      '--sidebar-primary-foreground': '#ffffff',
      '--sidebar-accent': '#ebebeb',
      '--sidebar-accent-foreground': '#0d0d0d',
      '--sidebar-hover': '#ebebeb',
      '--sidebar-border': '#e0e0e0',
    },
    dark: {
      '--background': '#0a0a0a',
      '--foreground': '#f5f5f5',
      '--card': '#141414',
      '--card-foreground': '#f5f5f5',
      '--primary': '#ffffff',
      '--primary-foreground': '#0a0a0a',
      '--primary-light': '#e31937',
      '--secondary': '#1a1a1a',
      '--secondary-foreground': '#f5f5f5',
      '--muted': '#1a1a1a',
      '--muted-foreground': '#737373',
      '--accent': '#e31937',
      '--accent-foreground': '#ffffff',
      '--destructive': '#e31937',
      '--destructive-foreground': '#ffffff',
      '--border': '#262626',
      '--input': '#262626',
      '--ring': '#e31937',
      '--sidebar': '#050505',
      '--sidebar-foreground': '#f5f5f5',
      '--sidebar-primary': '#e31937',
      '--sidebar-primary-foreground': '#ffffff',
      '--sidebar-accent': '#1a1a1a',
      '--sidebar-accent-foreground': '#f5f5f5',
      '--sidebar-hover': '#1a1a1a',
      '--sidebar-border': '#262626',
    }
  },
  {
    key: 'spotify',
    label: 'Spotify',
    desc: '活力十足的深色绿色主题',
    light: {
      '--background': '#ffffff',
      '--foreground': '#191414',
      '--card': '#f8f8f8',
      '--card-foreground': '#191414',
      '--primary': '#1db954',
      '--primary-foreground': '#ffffff',
      '--primary-light': '#1ed760',
      '--secondary': '#f0f0f0',
      '--secondary-foreground': '#191414',
      '--muted': '#f0f0f0',
      '--muted-foreground': '#6b7280',
      '--accent': '#1db954',
      '--accent-foreground': '#ffffff',
      '--destructive': '#e91429',
      '--destructive-foreground': '#ffffff',
      '--border': '#dcdcdc',
      '--input': '#dcdcdc',
      '--ring': '#1db954',
      '--sidebar': '#f5f5f5',
      '--sidebar-foreground': '#191414',
      '--sidebar-primary': '#1db954',
      '--sidebar-primary-foreground': '#ffffff',
      '--sidebar-accent': '#e8e8e8',
      '--sidebar-accent-foreground': '#191414',
      '--sidebar-hover': '#e8e8e8',
      '--sidebar-border': '#dcdcdc',
    },
    dark: {
      '--background': '#121212',
      '--foreground': '#ffffff',
      '--card': '#181818',
      '--card-foreground': '#ffffff',
      '--primary': '#1db954',
      '--primary-foreground': '#ffffff',
      '--primary-light': '#1ed760',
      '--secondary': '#232323',
      '--secondary-foreground': '#ffffff',
      '--muted': '#232323',
      '--muted-foreground': '#a7a7a7',
      '--accent': '#1db954',
      '--accent-foreground': '#ffffff',
      '--destructive': '#e91429',
      '--destructive-foreground': '#ffffff',
      '--border': '#2a2a2a',
      '--input': '#2a2a2a',
      '--ring': '#1db954',
      '--sidebar': '#000000',
      '--sidebar-foreground': '#ffffff',
      '--sidebar-primary': '#1db954',
      '--sidebar-primary-foreground': '#ffffff',
      '--sidebar-accent': '#232323',
      '--sidebar-accent-foreground': '#ffffff',
      '--sidebar-hover': '#232323',
      '--sidebar-border': '#2a2a2a',
    }
  },
  {
    key: 'nvidia',
    label: 'NVIDIA',
    desc: '科技感的绿色暗黑主题',
    light: {
      '--background': '#ffffff',
      '--foreground': '#1a1a1a',
      '--card': '#ffffff',
      '--card-foreground': '#1a1a1a',
      '--primary': '#76b900',
      '--primary-foreground': '#ffffff',
      '--primary-light': '#95d400',
      '--secondary': '#f0f0f0',
      '--secondary-foreground': '#1a1a1a',
      '--muted': '#f0f0f0',
      '--muted-foreground': '#6b7280',
      '--accent': '#76b900',
      '--accent-foreground': '#ffffff',
      '--destructive': '#d32f2f',
      '--destructive-foreground': '#ffffff',
      '--border': '#d4d4d4',
      '--input': '#d4d4d4',
      '--ring': '#76b900',
      '--sidebar': '#f5f5f5',
      '--sidebar-foreground': '#1a1a1a',
      '--sidebar-primary': '#76b900',
      '--sidebar-primary-foreground': '#ffffff',
      '--sidebar-accent': '#e5e5e5',
      '--sidebar-accent-foreground': '#1a1a1a',
      '--sidebar-hover': '#e5e5e5',
      '--sidebar-border': '#d4d4d4',
    },
    dark: {
      '--background': '#0c0c0c',
      '--foreground': '#eeeeee',
      '--card': '#161616',
      '--card-foreground': '#eeeeee',
      '--primary': '#76b900',
      '--primary-foreground': '#ffffff',
      '--primary-light': '#95d400',
      '--secondary': '#1e1e1e',
      '--secondary-foreground': '#eeeeee',
      '--muted': '#1e1e1e',
      '--muted-foreground': '#808080',
      '--accent': '#76b900',
      '--accent-foreground': '#ffffff',
      '--destructive': '#d32f2f',
      '--destructive-foreground': '#ffffff',
      '--border': '#2a2a2a',
      '--input': '#2a2a2a',
      '--ring': '#76b900',
      '--sidebar': '#080808',
      '--sidebar-foreground': '#eeeeee',
      '--sidebar-primary': '#76b900',
      '--sidebar-primary-foreground': '#ffffff',
      '--sidebar-accent': '#1e1e1e',
      '--sidebar-accent-foreground': '#eeeeee',
      '--sidebar-hover': '#1e1e1e',
      '--sidebar-border': '#2a2a2a',
    }
  }
]

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>((localStorage.getItem(THEME_KEY) as Theme) || 'light')
  const preset = ref(localStorage.getItem(PRESET_KEY) || 'default')

  /** 自定义主题数据（light + dark 两组 CSS 变量） */
  const customTheme = ref<{ light: Record<string, string>; dark: Record<string, string> }>(
    JSON.parse(localStorage.getItem(CUSTOM_PRESET_KEY) || 'null') || {
      light: createEmptyThemeVars(),
      dark: createEmptyThemeVars(),
    }
  )

  function applyThemeMode(t: Theme) {
    document.documentElement.classList.toggle('dark', t === 'dark')
    document.documentElement.classList.toggle('light', t === 'light')
  }

  function applyPresetVars() {
    const el = document.documentElement
    THEME_VARS.forEach(v => el.style.removeProperty(v))

    if (preset.value === 'custom') {
      const vars = theme.value === 'dark' ? customTheme.value.dark : customTheme.value.light
      Object.entries(vars).forEach(([k, v]) => {
        if (v) el.style.setProperty(k, v)
      })
      return
    }

    const p = themePresets.find(t => t.key === preset.value)
    if (p) {
      const vars = theme.value === 'dark' ? p.dark : p.light
      Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v))
    }
  }

  function setTheme(t: Theme) {
    theme.value = t
    localStorage.setItem(THEME_KEY, t)
    applyThemeMode(t)
    applyPresetVars()
  }

  function setPreset(key: string) {
    preset.value = key
    localStorage.setItem(PRESET_KEY, key)
    applyPresetVars()
  }

  /** 应用自定义主题 CSS 变量 */
  function applyCustomTheme(vars: { light: Record<string, string>; dark: Record<string, string> }) {
    customTheme.value = vars
    localStorage.setItem(CUSTOM_PRESET_KEY, JSON.stringify(vars))
    setPreset('custom')
  }

  /** 导出自定义主题为 JSON（供 zip 打包用） */
  function exportCustomTheme(): { light: Record<string, string>; dark: Record<string, string> } {
    return JSON.parse(JSON.stringify(customTheme.value))
  }

  // 初始化
  applyThemeMode(theme.value)
  applyPresetVars()

  watch(theme, () => applyPresetVars())

  return {
    theme, preset, customTheme,
    setTheme, setPreset, applyCustomTheme, exportCustomTheme
  }
})
