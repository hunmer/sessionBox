import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ShortcutItem, ShortcutGroup } from '../../preload/index'

const api = window.api

export const useShortcutStore = defineStore('shortcut', () => {
  const shortcuts = ref<ShortcutItem[]>([])
  const groups = ref<ShortcutGroup[]>([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const result = await api.shortcut.list()
      groups.value = result.groups
      shortcuts.value = result.shortcuts
    } finally {
      loading.value = false
    }
  }

  async function updateShortcut(id: string, accelerator: string, isGlobal: boolean, enabled?: boolean) {
    const result = await api.shortcut.update(id, accelerator, isGlobal, enabled)
    if (result.success) {
      const idx = shortcuts.value.findIndex(s => s.id === id)
      if (idx >= 0) {
        const updated = { ...shortcuts.value[idx], accelerator, global: isGlobal }
        if (enabled !== undefined) updated.enabled = enabled
        shortcuts.value.splice(idx, 1, updated)
      }
    }
    return result
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    const result = await api.shortcut.toggle(id, enabled)
    if (result.success) {
      const idx = shortcuts.value.findIndex(s => s.id === id)
      if (idx >= 0) {
        shortcuts.value.splice(idx, 1, { ...shortcuts.value[idx], enabled })
      }
    }
    return result
  }

  async function clearShortcut(id: string) {
    await api.shortcut.clear(id)
    const idx = shortcuts.value.findIndex(s => s.id === id)
    if (idx >= 0) {
      shortcuts.value.splice(idx, 1, { ...shortcuts.value[idx], accelerator: '', global: false })
    }
  }

  async function resetShortcuts() {
    await api.shortcut.reset()
    await load()
  }

  /** 按 group 过滤快捷键 */
  function getShortcutsByGroup(group: string): ShortcutItem[] {
    return shortcuts.value.filter(s => s.group === group)
  }

  return { shortcuts, groups, loading, load, updateShortcut, toggleEnabled, clearShortcut, resetShortcuts, getShortcutsByGroup }
})
