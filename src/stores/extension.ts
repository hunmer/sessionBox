import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Extension } from '@/types'

export const useExtensionStore = defineStore('extension', () => {
  const extensions = ref<Extension[]>([])
  const loadedExtensionIds = ref<string[]>([])
  const isLoading = ref(false)

  const enabledExtensions = computed(() =>
    extensions.value.filter((extension) => extension.enabled)
  )

  function isExtensionLoaded(extensionId: string): boolean {
    return loadedExtensionIds.value.includes(extensionId)
  }

  async function init(): Promise<void> {
    isLoading.value = true
    try {
      const [extensionList, loadedIds] = await Promise.all([
        window.api.extension.list(),
        window.api.extension.getLoaded()
      ])
      extensions.value = extensionList
      loadedExtensionIds.value = loadedIds
    } finally {
      isLoading.value = false
    }
  }

  async function loadExtension(extensionId: string): Promise<void> {
    await window.api.extension.load(extensionId)

    if (!loadedExtensionIds.value.includes(extensionId)) {
      loadedExtensionIds.value.push(extensionId)
    }
  }

  async function unloadExtension(extensionId: string): Promise<void> {
    await window.api.extension.unload(extensionId)
    loadedExtensionIds.value = loadedExtensionIds.value.filter((id) => id !== extensionId)
  }

  async function selectExtension(): Promise<Extension | null> {
    console.log('[ExtensionStore] Calling window.api.extension.select()')
    try {
      const extension = await window.api.extension.select()
      console.log('[ExtensionStore] select result:', extension)

      if (extension && !extensions.value.some((item) => item.id === extension.id)) {
        extensions.value.push(extension)
      }

      return extension
    } catch (error) {
      console.error('[ExtensionStore] select error:', error)
      throw error
    }
  }

  async function deleteExtension(extensionId: string): Promise<void> {
    await window.api.extension.delete(extensionId)
    extensions.value = extensions.value.filter((extension) => extension.id !== extensionId)
    loadedExtensionIds.value = loadedExtensionIds.value.filter((id) => id !== extensionId)
  }

  async function updateExtension(
    id: string,
    data: Partial<Omit<Extension, 'id'>>
  ): Promise<void> {
    await window.api.extension.update(id, data)
    const index = extensions.value.findIndex((extension) => extension.id === id)
    if (index !== -1) {
      extensions.value[index] = { ...extensions.value[index], ...data }
    }
  }

  async function refreshLoadedExtensions(): Promise<void> {
    loadedExtensionIds.value = await window.api.extension.getLoaded()
  }

  return {
    extensions,
    loadedExtensionIds,
    isLoading,
    enabledExtensions,
    isExtensionLoaded,
    init,
    loadExtension,
    unloadExtension,
    selectExtension,
    deleteExtension,
    updateExtension,
    refreshLoadedExtensions
  }
})
