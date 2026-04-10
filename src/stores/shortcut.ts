import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ShortcutItem } from '../../preload/index'

const api = window.api

export const useShortcutStore = defineStore('shortcut', () => {
  const shortcuts = ref<ShortcutItem[]>([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      shortcuts.value = await api.shortcut.list()
    } finally {
      loading.value = false
    }
  }

  async function updateShortcut(id: string, accelerator: string, isGlobal: boolean) {
    const result = await api.shortcut.update(id, accelerator, isGlobal)
    if (result.success) {
      const idx = shortcuts.value.findIndex(s => s.id === id)
      if (idx >= 0) {
        shortcuts.value[idx] = { ...shortcuts.value[idx], accelerator, global: isGlobal }
      }
    }
    return result
  }

  async function clearShortcut(id: string) {
    await api.shortcut.clear(id)
    const idx = shortcuts.value.findIndex(s => s.id === id)
    if (idx >= 0) {
      shortcuts.value[idx] = { ...shortcuts.value[idx], accelerator: '', global: false }
    }
  }

  async function resetShortcuts() {
    await api.shortcut.reset()
    await load()
  }

  return { shortcuts, loading, load, updateShortcut, clearShortcut, resetShortcuts }
})
