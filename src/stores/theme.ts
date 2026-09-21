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
  '--sidebar-hover', '--sidebar-border', '--radius'
]

/** 生成空白的自定义主题模板 */
export function createEmptyThemeVars(): Record<string, string> {
  return Object.fromEntries(THEME_VARS.map(v => [v, '']))
}

/**
 * 预设迁移自 mira-client 的 theme-style.ts（oklch 色值原样保留）。
 * 源主题未定义本项目在用的 --sidebar-hover / --primary-light /
 * --destructive-foreground，按语义派生：sidebar-hover 取各主题的
 * sidebar-accent，primary-light 取主色的浅一档同系色。
 * 源文件的 rhea 与 mira 色值完全相同（原差异仅在字体，已被裁剪），故未收录。
 */
export const themePresets: ThemePreset[] = [
  {
    key: 'default',
    label: '默认',
    desc: 'SessionBox 默认蓝色主题',
    light: {},
    dark: {}
  },
  {
    key: 'mira',
    label: 'Mira',
    desc: '中性灰白 · 经典圆角',
    light: {
      '--background': 'oklch(1 0 0)',
      '--foreground': 'oklch(0.145 0 0)',
      '--card': 'oklch(1 0 0)',
      '--card-foreground': 'oklch(0.145 0 0)',
      '--popover': 'oklch(1 0 0)',
      '--popover-foreground': 'oklch(0.145 0 0)',
      '--primary': 'oklch(0.205 0 0)',
      '--primary-foreground': 'oklch(0.985 0 0)',
      '--primary-light': 'oklch(0.556 0 0)',
      '--secondary': 'oklch(0.97 0 0)',
      '--secondary-foreground': 'oklch(0.205 0 0)',
      '--muted': 'oklch(0.97 0 0)',
      '--muted-foreground': 'oklch(0.556 0 0)',
      '--accent': 'oklch(0.97 0 0)',
      '--accent-foreground': 'oklch(0.205 0 0)',
      '--destructive': 'oklch(0.577 0.245 27.325)',
      '--destructive-foreground': 'oklch(0.985 0 0)',
      '--border': 'oklch(0.922 0 0)',
      '--input': 'oklch(0.922 0 0)',
      '--ring': 'oklch(0.708 0 0)',
      '--sidebar': 'oklch(0.985 0 0)',
      '--sidebar-foreground': 'oklch(0.145 0 0)',
      '--sidebar-primary': 'oklch(0.205 0 0)',
      '--sidebar-primary-foreground': 'oklch(0.985 0 0)',
      '--sidebar-accent': 'oklch(0.97 0 0)',
      '--sidebar-accent-foreground': 'oklch(0.205 0 0)',
      '--sidebar-hover': 'oklch(0.97 0 0)',
      '--sidebar-border': 'oklch(0.922 0 0)',
      '--radius': '0.625rem',
    },
    dark: {
      '--background': 'oklch(0.145 0 0)',
      '--foreground': 'oklch(0.985 0 0)',
      '--card': 'oklch(0.205 0 0)',
      '--card-foreground': 'oklch(0.985 0 0)',
      '--popover': 'oklch(0.205 0 0)',
      '--popover-foreground': 'oklch(0.985 0 0)',
      '--primary': 'oklch(0.922 0 0)',
      '--primary-foreground': 'oklch(0.205 0 0)',
      '--primary-light': 'oklch(0.708 0 0)',
      '--secondary': 'oklch(0.269 0 0)',
      '--secondary-foreground': 'oklch(0.985 0 0)',
      '--muted': 'oklch(0.269 0 0)',
      '--muted-foreground': 'oklch(0.708 0 0)',
      '--accent': 'oklch(0.269 0 0)',
      '--accent-foreground': 'oklch(0.985 0 0)',
      '--destructive': 'oklch(0.704 0.191 22.216)',
      '--destructive-foreground': 'oklch(0.985 0 0)',
      '--border': 'oklch(1 0 0 / 10%)',
      '--input': 'oklch(1 0 0 / 15%)',
      '--ring': 'oklch(0.556 0 0)',
      '--sidebar': 'oklch(0.205 0 0)',
      '--sidebar-foreground': 'oklch(0.985 0 0)',
      '--sidebar-primary': 'oklch(0.488 0.243 264.376)',
      '--sidebar-primary-foreground': 'oklch(0.985 0 0)',
      '--sidebar-accent': 'oklch(0.269 0 0)',
      '--sidebar-accent-foreground': 'oklch(0.985 0 0)',
      '--sidebar-hover': 'oklch(0.269 0 0)',
      '--sidebar-border': 'oklch(1 0 0 / 10%)',
      '--radius': '0.625rem',
    }
  },
  {
    key: 'lyra',
    label: 'Lyra',
    desc: '中性灰白 · 直角极简',
    light: {
      '--background': 'oklch(1 0 0)',
      '--foreground': 'oklch(0.145 0 0)',
      '--card': 'oklch(1 0 0)',
      '--card-foreground': 'oklch(0.145 0 0)',
      '--popover': 'oklch(1 0 0)',
      '--popover-foreground': 'oklch(0.145 0 0)',
      '--primary': 'oklch(0.205 0 0)',
      '--primary-foreground': 'oklch(0.985 0 0)',
      '--primary-light': 'oklch(0.556 0 0)',
      '--secondary': 'oklch(0.97 0 0)',
      '--secondary-foreground': 'oklch(0.205 0 0)',
      '--muted': 'oklch(0.97 0 0)',
      '--muted-foreground': 'oklch(0.556 0 0)',
      '--accent': 'oklch(0.97 0 0)',
      '--accent-foreground': 'oklch(0.205 0 0)',
      '--destructive': 'oklch(0.577 0.245 27.325)',
      '--destructive-foreground': 'oklch(0.985 0 0)',
      '--border': 'oklch(0.922 0 0)',
      '--input': 'oklch(0.922 0 0)',
      '--ring': 'oklch(0.708 0 0)',
      '--sidebar': 'oklch(0.985 0 0)',
      '--sidebar-foreground': 'oklch(0.145 0 0)',
      '--sidebar-primary': 'oklch(0.205 0 0)',
      '--sidebar-primary-foreground': 'oklch(0.985 0 0)',
      '--sidebar-accent': 'oklch(0.97 0 0)',
      '--sidebar-accent-foreground': 'oklch(0.205 0 0)',
      '--sidebar-hover': 'oklch(0.97 0 0)',
      '--sidebar-border': 'oklch(0.922 0 0)',
      '--radius': '0',
    },
    dark: {
      '--background': 'oklch(0.145 0 0)',
      '--foreground': 'oklch(0.985 0 0)',
      '--card': 'oklch(0.205 0 0)',
      '--card-foreground': 'oklch(0.985 0 0)',
      '--popover': 'oklch(0.205 0 0)',
      '--popover-foreground': 'oklch(0.985 0 0)',
      '--primary': 'oklch(0.922 0 0)',
      '--primary-foreground': 'oklch(0.205 0 0)',
      '--primary-light': 'oklch(0.708 0 0)',
      '--secondary': 'oklch(0.269 0 0)',
      '--secondary-foreground': 'oklch(0.985 0 0)',
      '--muted': 'oklch(0.269 0 0)',
      '--muted-foreground': 'oklch(0.708 0 0)',
      '--accent': 'oklch(0.269 0 0)',
      '--accent-foreground': 'oklch(0.985 0 0)',
      '--destructive': 'oklch(0.704 0.191 22.216)',
      '--destructive-foreground': 'oklch(0.985 0 0)',
      '--border': 'oklch(1 0 0 / 10%)',
      '--input': 'oklch(1 0 0 / 15%)',
      '--ring': 'oklch(0.556 0 0)',
      '--sidebar': 'oklch(0.205 0 0)',
      '--sidebar-foreground': 'oklch(0.985 0 0)',
      '--sidebar-primary': 'oklch(0.488 0.243 264.376)',
      '--sidebar-primary-foreground': 'oklch(0.985 0 0)',
      '--sidebar-accent': 'oklch(0.269 0 0)',
      '--sidebar-accent-foreground': 'oklch(0.985 0 0)',
      '--sidebar-hover': 'oklch(0.269 0 0)',
      '--sidebar-border': 'oklch(1 0 0 / 10%)',
      '--radius': '0',
    }
  },
  {
    key: 'luma',
    label: 'Luma',
    desc: '暖棕橙色 · 圆润大圆角',
    light: {
      '--background': 'oklch(1 0 0)',
      '--foreground': 'oklch(0.147 0.004 49.3)',
      '--card': 'oklch(1 0 0)',
      '--card-foreground': 'oklch(0.147 0.004 49.3)',
      '--popover': 'oklch(1 0 0)',
      '--popover-foreground': 'oklch(0.147 0.004 49.3)',
      '--primary': 'oklch(0.505 0.213 27.518)',
      '--primary-foreground': 'oklch(0.971 0.013 17.38)',
      '--primary-light': 'oklch(0.637 0.237 25.331)',
      '--secondary': 'oklch(0.967 0.001 286.375)',
      '--secondary-foreground': 'oklch(0.21 0.006 285.885)',
      '--muted': 'oklch(0.96 0.002 17.2)',
      '--muted-foreground': 'oklch(0.547 0.021 43.1)',
      '--accent': 'oklch(0.96 0.002 17.2)',
      '--accent-foreground': 'oklch(0.214 0.009 43.1)',
      '--destructive': 'oklch(0.577 0.245 27.325)',
      '--destructive-foreground': 'oklch(0.971 0.013 17.38)',
      '--border': 'oklch(0.922 0.005 34.3)',
      '--input': 'oklch(0.922 0.005 34.3)',
      '--ring': 'oklch(0.714 0.014 41.2)',
      '--sidebar': 'oklch(0.986 0.002 67.8)',
      '--sidebar-foreground': 'oklch(0.147 0.004 49.3)',
      '--sidebar-primary': 'oklch(0.577 0.245 27.325)',
      '--sidebar-primary-foreground': 'oklch(0.971 0.013 17.38)',
      '--sidebar-accent': 'oklch(0.96 0.002 17.2)',
      '--sidebar-accent-foreground': 'oklch(0.214 0.009 43.1)',
      '--sidebar-hover': 'oklch(0.96 0.002 17.2)',
      '--sidebar-border': 'oklch(0.922 0.005 34.3)',
      '--radius': '0.875rem',
    },
    dark: {
      '--background': 'oklch(0.147 0.004 49.3)',
      '--foreground': 'oklch(0.986 0.002 67.8)',
      '--card': 'oklch(0.214 0.009 43.1)',
      '--card-foreground': 'oklch(0.986 0.002 67.8)',
      '--popover': 'oklch(0.214 0.009 43.1)',
      '--popover-foreground': 'oklch(0.986 0.002 67.8)',
      '--primary': 'oklch(0.444 0.177 26.899)',
      '--primary-foreground': 'oklch(0.971 0.013 17.38)',
      '--primary-light': 'oklch(0.637 0.237 25.331)',
      '--secondary': 'oklch(0.274 0.006 286.033)',
      '--secondary-foreground': 'oklch(0.985 0 0)',
      '--muted': 'oklch(0.268 0.011 36.5)',
      '--muted-foreground': 'oklch(0.714 0.014 41.2)',
      '--accent': 'oklch(0.268 0.011 36.5)',
      '--accent-foreground': 'oklch(0.986 0.002 67.8)',
      '--destructive': 'oklch(0.704 0.191 22.216)',
      '--destructive-foreground': 'oklch(0.971 0.013 17.38)',
      '--border': 'oklch(1 0 0 / 10%)',
      '--input': 'oklch(1 0 0 / 15%)',
      '--ring': 'oklch(0.547 0.021 43.1)',
      '--sidebar': 'oklch(0.214 0.009 43.1)',
      '--sidebar-foreground': 'oklch(0.986 0.002 67.8)',
      '--sidebar-primary': 'oklch(0.637 0.237 25.331)',
      '--sidebar-primary-foreground': 'oklch(0.971 0.013 17.38)',
      '--sidebar-accent': 'oklch(0.268 0.011 36.5)',
      '--sidebar-accent-foreground': 'oklch(0.986 0.002 67.8)',
      '--sidebar-hover': 'oklch(0.268 0.011 36.5)',
      '--sidebar-border': 'oklch(1 0 0 / 10%)',
      '--radius': '0.875rem',
    }
  },
  {
    key: 'twitter',
    label: 'Twitter',
    desc: 'Twitter 蓝黑配色 · 特大圆角',
    light: {
      '--background': 'oklch(1 0 0)',
      '--foreground': 'oklch(0.1884 0.0128 248.5103)',
      '--card': 'oklch(0.9784 0.0011 197.1387)',
      '--card-foreground': 'oklch(0.1884 0.0128 248.5103)',
      '--popover': 'oklch(1 0 0)',
      '--popover-foreground': 'oklch(0.1884 0.0128 248.5103)',
      '--primary': 'oklch(0.6723 0.1606 244.9955)',
      '--primary-foreground': 'oklch(1 0 0)',
      '--primary-light': 'oklch(0.6818 0.1584 243.354)',
      '--secondary': 'oklch(0.1884 0.0128 248.5103)',
      '--secondary-foreground': 'oklch(1 0 0)',
      '--muted': 'oklch(0.9222 0.0013 286.3737)',
      '--muted-foreground': 'oklch(0.1884 0.0128 248.5103)',
      '--accent': 'oklch(0.9392 0.0166 250.8453)',
      '--accent-foreground': 'oklch(0.6723 0.1606 244.9955)',
      '--destructive': 'oklch(0.6188 0.2376 25.7658)',
      '--destructive-foreground': 'oklch(1 0 0)',
      '--border': 'oklch(0.9317 0.0118 231.6594)',
      '--input': 'oklch(0.9809 0.0025 228.7836)',
      '--ring': 'oklch(0.6818 0.1584 243.354)',
      '--sidebar': 'oklch(0.9784 0.0011 197.1387)',
      '--sidebar-foreground': 'oklch(0.1884 0.0128 248.5103)',
      '--sidebar-primary': 'oklch(0.6723 0.1606 244.9955)',
      '--sidebar-primary-foreground': 'oklch(1 0 0)',
      '--sidebar-accent': 'oklch(0.9392 0.0166 250.8453)',
      '--sidebar-accent-foreground': 'oklch(0.6723 0.1606 244.9955)',
      '--sidebar-hover': 'oklch(0.9392 0.0166 250.8453)',
      '--sidebar-border': 'oklch(0.9271 0.0101 238.5177)',
      '--radius': '1.3rem',
    },
    dark: {
      '--background': 'oklch(0 0 0)',
      '--foreground': 'oklch(0.9328 0.0025 228.7857)',
      '--card': 'oklch(0.2097 0.008 274.5332)',
      '--card-foreground': 'oklch(0.8853 0 0)',
      '--popover': 'oklch(0 0 0)',
      '--popover-foreground': 'oklch(0.9328 0.0025 228.7857)',
      '--primary': 'oklch(0.6692 0.1607 245.011)',
      '--primary-foreground': 'oklch(1 0 0)',
      '--primary-light': 'oklch(0.6818 0.1584 243.354)',
      '--secondary': 'oklch(0.9622 0.0035 219.5331)',
      '--secondary-foreground': 'oklch(0.1884 0.0128 248.5103)',
      '--muted': 'oklch(0.209 0 0)',
      '--muted-foreground': 'oklch(0.5637 0.0078 247.9662)',
      '--accent': 'oklch(0.1928 0.0331 242.5459)',
      '--accent-foreground': 'oklch(0.6692 0.1607 245.011)',
      '--destructive': 'oklch(0.6188 0.2376 25.7658)',
      '--destructive-foreground': 'oklch(1 0 0)',
      '--border': 'oklch(0.2674 0.0047 248.0045)',
      '--input': 'oklch(0.302 0.0288 244.8244)',
      '--ring': 'oklch(0.6818 0.1584 243.354)',
      '--sidebar': 'oklch(0.2097 0.008 274.5332)',
      '--sidebar-foreground': 'oklch(0.8853 0 0)',
      '--sidebar-primary': 'oklch(0.6818 0.1584 243.354)',
      '--sidebar-primary-foreground': 'oklch(1 0 0)',
      '--sidebar-accent': 'oklch(0.1928 0.0331 242.5459)',
      '--sidebar-accent-foreground': 'oklch(0.6692 0.1607 245.011)',
      '--sidebar-hover': 'oklch(0.1928 0.0331 242.5459)',
      '--sidebar-border': 'oklch(0.3795 0.022 240.5943)',
      '--radius': '1.3rem',
    }
  }
]

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>((localStorage.getItem(THEME_KEY) as Theme) || 'light')
  const preset = ref(localStorage.getItem(PRESET_KEY) || 'default')

  // 旧版预设（apple/google 等）已移除，存储的 key 失效时回退到默认
  if (preset.value !== 'custom' && !themePresets.some(t => t.key === preset.value)) {
    preset.value = 'default'
    localStorage.setItem(PRESET_KEY, 'default')
  }

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

  /** 同步 Electron nativeTheme，让 BrowserView/WebView 里的网页（含第三方站点）读取到相同的 prefers-color-scheme */
  function syncNativeTheme(t: Theme) {
    window.api?.theme?.setNativeTheme(t)?.catch(() => {})
  }

  function setTheme(t: Theme) {
    theme.value = t
    localStorage.setItem(THEME_KEY, t)
    applyThemeMode(t)
    applyPresetVars()
    syncNativeTheme(t)
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
  syncNativeTheme(theme.value)

  watch(theme, () => applyPresetVars())

  return {
    theme, preset, customTheme,
    setTheme, setPreset, applyCustomTheme, exportCustomTheme
  }
})
