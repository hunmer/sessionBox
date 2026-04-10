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
      // 更新本地状态
      const item = shortcuts.value.find(s => s.id === id)
      if (item) {
        item.accelerator = accelerator
        item.global = isGlobal
      }
    }
    return result
  }

  async function clearShortcut(id: string) {
    await api.shortcut.clear(id)
    const item = shortcuts.value.find(s => s.id === id)
    if (item) {
      item.accelerator = ''
      item.global = false
    }
  }

  async function resetShortcuts() {
    await api.shortcut.reset()
    await load()
  }

  return { shortcuts, loading, load, updateShortcut, clearShortcut, resetShortcuts }
})
