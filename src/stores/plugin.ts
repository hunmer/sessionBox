import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PluginMeta } from '@/types'

export const usePluginStore = defineStore('plugin', () => {
  const plugins = ref<PluginMeta[]>([])
  const isLoading = ref(false)
  const activeViewPluginId = ref<string | null>(null)
  const viewContents = ref<Record<string, string>>({})

  const enabledPlugins = computed(() => plugins.value.filter((p) => p.enabled))
  const disabledPlugins = computed(() => plugins.value.filter((p) => !p.enabled))

  async function init(): Promise<void> {
    isLoading.value = true
    try {
      plugins.value = await window.api.plugin.list()
    } finally {
      isLoading.value = false
    }
  }

  async function enablePlugin(pluginId: string): Promise<void> {
    await window.api.plugin.enable(pluginId)
    const plugin = plugins.value.find((p) => p.id === pluginId)
    if (plugin) plugin.enabled = true
  }

  async function disablePlugin(pluginId: string): Promise<void> {
    await window.api.plugin.disable(pluginId)
    const plugin = plugins.value.find((p) => p.id === pluginId)
    if (plugin) plugin.enabled = false
    if (activeViewPluginId.value === pluginId) {
      activeViewPluginId.value = null
    }
  }

  async function loadViewContent(pluginId: string): Promise<string | null> {
    if (viewContents.value[pluginId]) return viewContents.value[pluginId]
    const content = await window.api.plugin.getView(pluginId)
    if (content) {
      viewContents.value[pluginId] = content
    }
    return content
  }

  async function loadIcon(pluginId: string): Promise<string | null> {
    return window.api.plugin.getIcon(pluginId)
  }

  function openView(pluginId: string): void {
    activeViewPluginId.value = pluginId
  }

  function closeView(): void {
    activeViewPluginId.value = null
  }

  async function importPlugin(): Promise<{ success: boolean; pluginName?: string; error?: string }> {
    const result = await window.api.plugin.importZip()
    if (result.success) {
      await init()
    }
    return result
  }

  async function openPluginsFolder(): Promise<void> {
    await window.api.plugin.openFolder()
  }

  return {
    plugins,
    isLoading,
    activeViewPluginId,
    viewContents,
    enabledPlugins,
    disabledPlugins,
    init,
    enablePlugin,
    disablePlugin,
    loadViewContent,
    loadIcon,
    openView,
    closeView,
    importPlugin,
    openPluginsFolder
  }
})
