import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Component } from 'vue'
import {
  Bookmark,
  History,
  Download,
  Shield,
  Box,
  Radar,
  Puzzle,
  Circle,
  MessageSquare,
} from 'lucide-vue-next'

export interface ToolbarItemDef {
  id: string
  label: string
  icon: Component
}

/** 右侧工具栏全部可配置项（顺序即默认顺序） */
export const TOOLBAR_ITEMS: ToolbarItemDef[] = [
  { id: 'bookmark', label: '书签', icon: Bookmark },
  { id: 'history', label: '历史记录', icon: History },
  { id: 'download', label: '下载管理', icon: Download },
  { id: 'proxy', label: '代理切换', icon: Shield },
  { id: 'container', label: '容器切换', icon: Box },
  { id: 'sniffer', label: '网络嗅探', icon: Radar },
  { id: 'plugin', label: '插件', icon: Puzzle },
  { id: 'debugger', label: '网页调试', icon: Circle },
  { id: 'chat', label: 'AI 聊天', icon: MessageSquare },
]

export interface ToolbarEntry {
  id: string
  visible: boolean
}

const STORAGE_KEY = 'sessionbox-right-toolbar-config'

/** 合并已存配置与当前定义：去掉失效 id、追加新增 id，输入损坏时回退默认 */
export function mergeToolbarConfig(stored: unknown): ToolbarEntry[] {
  const known = new Map(TOOLBAR_ITEMS.map((d) => [d.id, d]))
  const defaults = (): ToolbarEntry[] => TOOLBAR_ITEMS.map((d) => ({ id: d.id, visible: true }))
  if (!Array.isArray(stored)) return defaults()
  const merged: ToolbarEntry[] = []
  const seen = new Set<string>()
  for (const raw of stored) {
    if (!raw || typeof raw !== 'object') continue
    const { id, visible } = raw as Partial<ToolbarEntry>
    if (typeof id !== 'string' || seen.has(id) || !known.has(id)) continue
    seen.add(id)
    merged.push({ id, visible: visible !== false })
  }
  for (const def of TOOLBAR_ITEMS) {
    if (!seen.has(def.id)) merged.push({ id: def.id, visible: true })
  }
  return merged
}

function loadConfig(): ToolbarEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return mergeToolbarConfig(JSON.parse(stored))
  } catch {
    /* 损坏配置回退默认 */
  }
  return mergeToolbarConfig(null)
}

export const useToolbarStore = defineStore('right-toolbar', () => {
  /** 完整配置：顺序 + 显隐，index 0 为工具栏最上方 */
  const config = ref<ToolbarEntry[]>(loadConfig())

  const defMap = computed(() => new Map(TOOLBAR_ITEMS.map((d) => [d.id, d])))

  /** 工具栏实际渲染的项（按 config 顺序、仅可见） */
  const visibleItems = computed(() =>
    config.value.filter((e) => e.visible).map((e) => defMap.value.get(e.id)!).filter(Boolean),
  )

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value))
  }

  function setVisible(id: string, visible: boolean) {
    const entry = config.value.find((e) => e.id === id)
    if (!entry) return
    entry.visible = visible
    persist()
  }

  /** 按新顺序重排（不改显隐），未知/缺失 id 忽略 */
  function applyOrder(ordered: ToolbarEntry[]) {
    config.value = mergeToolbarConfig(ordered)
    persist()
  }

  function reset() {
    config.value = mergeToolbarConfig(null)
    persist()
  }

  function defOf(id: string): ToolbarItemDef | undefined {
    return defMap.value.get(id)
  }

  return { config, visibleItems, setVisible, applyOrder, reset, defOf }
})
