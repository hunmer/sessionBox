import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useThemeStore } from './theme'

export interface WallpaperItem {
  /** 文件名（wallpaper:// 协议的路径部分），如 wp_1760000000_abc123.jpg */
  id: string
  name: string
}

const STORAGE_KEY = 'sessionbox-wallpaper'

/**
 * 壁纸激活时需要透明化的表面变量及其不透明度。
 * 弹层（popover）保持较高不透明度以保证菜单可读性。
 */
const SURFACE_ALPHAS: Array<[name: string, alpha: number]> = [
  ['--background', 0.78],
  ['--sidebar', 0.78],
  ['--card', 0.80],
  ['--popover', 0.92],
  ['--secondary', 0.85],
  ['--muted', 0.85],
  ['--accent', 0.85],
  ['--sidebar-accent', 0.85],
  ['--sidebar-hover', 0.85]
]

export const useWallpaperStore = defineStore('wallpaper', () => {
  // 先实例化主题 store，确保预设的内联 CSS 变量已写入根元素后再叠加透明化
  const themeStore = useThemeStore()

  const wallpapers = ref<WallpaperItem[]>([])
  const selectedId = ref('')
  const blur = ref(0)
  const opacity = ref(1)

  /**
   * 透明化前各表面变量的原始内联值缓存。
   * 主题预设切换时 applyPresetVars 会重写全部内联变量，需置空重读，
   * 否则会把已包过 color-mix 的值再包一层。
   */
  let savedVars: Record<string, string> | null = null

  const activeWallpaper = computed(() => wallpapers.value.find(w => w.id === selectedId.value) || null)
  const activeUrl = computed(() => (activeWallpaper.value ? `wallpaper://${activeWallpaper.value.id}` : ''))

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      id: selectedId.value,
      blur: blur.value,
      opacity: opacity.value
    }))
  }

  /** 将表面变量包一层 color-mix 透明化；取消壁纸时还原为原始值 */
  function applySurfaceTransparency() {
    const el = document.documentElement

    if (!activeWallpaper.value) {
      if (savedVars) {
        for (const [k, v] of Object.entries(savedVars)) {
          if (v) el.style.setProperty(k, v)
          else el.style.removeProperty(k)
        }
        savedVars = null
      }
      return
    }

    if (!savedVars) {
      savedVars = {}
      for (const [k] of SURFACE_ALPHAS) {
        savedVars[k] = el.style.getPropertyValue(k).trim()
      }
    }

    const cs = getComputedStyle(el)
    for (const [k, alpha] of SURFACE_ALPHAS) {
      // 预设未覆盖的变量（内联为空）回落到样式表基色
      const raw = savedVars[k] || cs.getPropertyValue(k).trim()
      if (raw) {
        el.style.setProperty(k, `color-mix(in srgb, ${raw} ${Math.round(alpha * 100)}%, transparent)`)
      } else {
        el.style.removeProperty(k)
      }
    }
  }

  async function init() {
    try {
      wallpapers.value = await window.api.wallpaper.list()
    } catch {
      wallpapers.value = []
    }
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved) {
      if (typeof saved.blur === 'number') blur.value = Math.min(40, Math.max(0, saved.blur))
      if (typeof saved.opacity === 'number') opacity.value = Math.min(1, Math.max(0.2, saved.opacity))
      if (saved.id && wallpapers.value.some(w => w.id === saved.id)) {
        selectedId.value = saved.id
      }
    }
    applySurfaceTransparency()
  }

  /** 打开系统对话框选择图片，成功后立即启用 */
  async function importWallpaper() {
    const item = await window.api.wallpaper.importOpenFile()
    if (!item) return null
    wallpapers.value.push(item)
    selectedId.value = item.id
    return item
  }

  function select(id: string) {
    selectedId.value = id
  }

  async function removeWallpaper(id: string) {
    await window.api.wallpaper.delete(id)
    wallpapers.value = wallpapers.value.filter(w => w.id !== id)
    if (selectedId.value === id) selectedId.value = ''
  }

  // 主题/预设/自定义主题变化时预设变量被整体重写，丢弃缓存并基于新值重新透明化
  // （customTheme 也纳入监听：重复应用自定义主题时 preset 值不变但变量已重写）
  watch(() => [themeStore.theme, themeStore.preset, themeStore.customTheme], () => {
    savedVars = null
    applySurfaceTransparency()
  })

  watch([selectedId, blur, opacity], () => {
    applySurfaceTransparency()
    persist()
  })

  void init()

  return {
    wallpapers, selectedId, blur, opacity,
    activeWallpaper, activeUrl,
    init, importWallpaper, select, removeWallpaper
  }
})
