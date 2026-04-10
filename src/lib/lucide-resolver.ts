import * as lucideIcons from 'lucide-vue-next'
import { markRaw, type Component } from 'vue'

const cache = new Map<string, Component | null>()

/** 解析 lucide 图标名称为 Vue 组件 */
export function resolveLucideIcon(name: string): Component | null {
  let comp = cache.get(name)
  if (comp !== undefined) return comp
  const raw = (lucideIcons as any)[name]
  comp = raw ? markRaw(raw) : null
  cache.set(name, comp)
  return comp
}

/** 所有可用的 lucide 图标名（排除 Icon 后缀的别名） */
export const lucideIconNames = Object.keys(lucideIcons).filter(k => !k.endsWith('Icon'))
