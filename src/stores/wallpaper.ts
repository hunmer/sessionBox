import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useThemeStore, setOnPresetApplied } from './theme'

export interface WallpaperItem {
  /** 文件名（wallpaper:// 协议的路径部分），如 wp_1760000000_abc123.jpg */
  id: string
  name: string
}

const STORAGE_KEY = 'sessionbox-wallpaper'

/** 卡片类表面：直接跟随卡片不透明度滑杆 */
const CARD_SURFACES = ['--background', '--sidebar', '--card']
/** 次级表面：比卡片略不透明，保证悬停/填充态可读 */
const INNER_SURFACES = ['--secondary', '--muted', '--accent', '--sidebar-accent', '--sidebar-hover']
/**
 * 弹层表面（popover/dropdown/dialog/sheet/context-menu/command palette 都用 bg-popover）
 * 不参与透明化，始终用主题原始的不透明色，保证弹出内容可读。
 * 仍纳入变量循环并主动写回原始值：自愈旧版本遗留的透明包装。
 */
const OPAQUE_SURFACES = new Set(['--popover'])

const ALL_SURFACES = [...CARD_SURFACES, ...INNER_SURFACES]

/**
 * 对比度补偿变量：半透明卡片让壁纸透出后，弱化文本与杂色背景对比度下降，
 * 向 --foreground 混合一部分以恢复可读性（亮色变深/暗色变亮，随主题自适应）
 */
const CONTRAST_FOREGROUND_VARS = new Set(['--muted-foreground'])

/**
 * 描边变量：亮色模式下壁纸激活时隐藏（半透明白卡上的描边像贴边方框）；
 * 暗色模式的白色低透明描边在毛玻璃上效果好，保留原值。--input 不动，表单输入框保留轮廓
 */
const STROKE_VARS = new Set(['--border', '--sidebar-border'])

const ALL_KEYS = [...ALL_SURFACES, ...CONTRAST_FOREGROUND_VARS, ...STROKE_VARS, ...OPAQUE_SURFACES]

/** muted-foreground 向前景色混合的比例 */
const CONTRAST_MIX_RATIO = 0.35

const WRAP_PATTERN = /^color-mix\(in srgb, (.+) \d+%, transparent\)$/

/** 剥掉透明化包装（可能多层嵌套），得到原始色值 */
function unwrapColorMix(value: string): string {
  let out = value
  let m = out.match(WRAP_PATTERN)
  while (m) {
    out = m[1]
    m = out.match(WRAP_PATTERN)
  }
  return out
}

export const useWallpaperStore = defineStore('wallpaper', () => {
  // 确保主题 store 先完成初始化（预设内联变量已写入根元素）再叠加透明化；
  // 同时读取当前亮暗模式，亮色模式下隐藏描边
  const themeStore = useThemeStore()

  const wallpapers = ref<WallpaperItem[]>([])
  const selectedId = ref('')
  const blur = ref(0)
  /** 卡片等表面的不透明度（0.3–1），壁纸图片本身始终不透明 */
  const cardOpacity = ref(0.8)

  /** 表面透明度：卡片直接取滑杆值，次级表面 +0.05 保证悬停态可读 */
  function alphaFor(name: string): number {
    if (CARD_SURFACES.includes(name)) return cardOpacity.value
    return Math.min(1, cardOpacity.value + 0.05)
  }

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
      cardOpacity: cardOpacity.value
    }))
  }

  /**
   * 将表面变量包一层 color-mix 透明化、弱化前景色做对比度补偿；取消壁纸时还原。
   * @param refreshRaw 预设变量刚被重写后由回调传 true，从内联值重新采集原始色；
   * 其他时候沿用缓存，避免把已包装的值当作原始值反复叠加。
   */
  function applySurfaceTransparency(refreshRaw = false) {
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

    if (!savedVars) savedVars = {}
    if (refreshRaw) {
      for (const k of ALL_KEYS) {
        savedVars[k] = el.style.getPropertyValue(k).trim()
      }
    }

    const cs = getComputedStyle(el)
    for (const k of ALL_KEYS) {
      if (!(k in savedVars)) {
        savedVars[k] = el.style.getPropertyValue(k).trim()
      }
      const inline = el.style.getPropertyValue(k).trim()
      const raw = savedVars[k]
        || unwrapColorMix(inline)
        || unwrapColorMix(cs.getPropertyValue(k).trim())
      if (!raw) {
        el.style.removeProperty(k)
        continue
      }
      if (OPAQUE_SURFACES.has(k)) {
        // 弹层表面：写回原始不透明色（同时清理历史版本遗留的透明包装）
        el.style.setProperty(k, raw)
      } else if (STROKE_VARS.has(k)) {
        // 亮色模式隐藏描边；暗色模式写回原始值（低透明白描边在毛玻璃上效果尚可）
        el.style.setProperty(k, themeStore.theme === 'light' ? 'transparent' : raw)
      } else if (CONTRAST_FOREGROUND_VARS.has(k)) {
        const fg = savedVars['--foreground']
          || unwrapColorMix(cs.getPropertyValue('--foreground').trim())
        el.style.setProperty(
          k,
          `color-mix(in srgb, ${raw} ${Math.round((1 - CONTRAST_MIX_RATIO) * 100)}%, ${fg})`
        )
      } else {
        el.style.setProperty(k, `color-mix(in srgb, ${raw} ${Math.round(alphaFor(k) * 100)}%, transparent)`)
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
      if (typeof saved.cardOpacity === 'number') cardOpacity.value = Math.min(1, Math.max(0.3, saved.cardOpacity))
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

  // 预设变量每次重写后由 theme store 回调重新叠加透明化（回调时内联值必为原始值，
  // 传 refreshRaw 重新采集）；不再用 watch 监听主题状态，顺序由回调保证
  setOnPresetApplied(() => applySurfaceTransparency(true))

  watch([selectedId, blur, cardOpacity], () => {
    applySurfaceTransparency()
    persist()
  })

  void init()

  return {
    wallpapers, selectedId, blur, cardOpacity,
    activeWallpaper, activeUrl,
    init, importWallpaper, select, removeWallpaper
  }
})
