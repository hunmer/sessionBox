import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Extension } from '@/types'

export const useExtensionStore = defineStore('extension', () => {
  // 扩展列表
  const extensions = ref<Extension[]>([])

  // 账号已加载的扩展 ID 映射
  const accountLoadedExtensions = ref<Record<string, string[]>>({})

  // 加载状态
  const isLoading = ref(false)

  /**
   * 获取当前账号的已加载扩展 ID 列表
   */
  function getLoadedExtensionIds(accountId: string): string[] {
    return accountLoadedExtensions.value[accountId] || []
  }

  /**
   * 判断扩展是否已加载到指定账号
   */
  function isExtensionLoaded(accountId: string, extensionId: string): boolean {
    return getLoadedExtensionIds(accountId).includes(extensionId)
  }

  /**
   * 获取当前账号的已加载扩展列表
   */
  function getLoadedExtensions(accountId: string): Extension[] {
    const loadedIds = getLoadedExtensionIds(accountId)
    return extensions.value.filter((e) => loadedIds.includes(e.id) && e.enabled)
  }

  /**
   * 初始化扩展列表
   */
  async function init(): Promise<void> {
    isLoading.value = true
    try {
      extensions.value = await window.api.extension.list()
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 为账号加载扩展
   */
  async function loadExtension(accountId: string, extensionId: string): Promise<void> {
    await window.api.extension.load(accountId, extensionId)

    // 更新本地状态
    if (!accountLoadedExtensions.value[accountId]) {
      accountLoadedExtensions.value[accountId] = []
    }
    if (!accountLoadedExtensions.value[accountId].includes(extensionId)) {
      accountLoadedExtensions.value[accountId].push(extensionId)
    }
  }

  /**
   * 从账号卸载扩展
   */
  async function unloadExtension(accountId: string, extensionId: string): Promise<void> {
    await window.api.extension.unload(accountId, extensionId)

    // 更新本地状态
    if (accountLoadedExtensions.value[accountId]) {
      accountLoadedExtensions.value[accountId] = accountLoadedExtensions.value[accountId].filter(
        (id) => id !== extensionId
      )
    }
  }

  /**
   * 选择并添加扩展
   */
  async function selectExtension(): Promise<Extension | null> {
    const extension = await window.api.extension.select()
    if (extension) {
      extensions.value.push(extension)
    }
    return extension
  }

  /**
   * 删除扩展（从所有账号卸载并删除）
   */
  async function deleteExtension(extensionId: string): Promise<void> {
    await window.api.extension.delete(extensionId)
    extensions.value = extensions.value.filter((e) => e.id !== extensionId)

    // 从所有账号的加载列表中移除
    for (const accountId in accountLoadedExtensions.value) {
      accountLoadedExtensions.value[accountId] = accountLoadedExtensions.value[accountId].filter(
        (id) => id !== extensionId
      )
    }
  }

  /**
   * 更新扩展信息
   */
  async function updateExtension(id: string, data: Partial<Omit<Extension, 'id'>>): Promise<void> {
    await window.api.extension.update(id, data)
    const idx = extensions.value.findIndex((e) => e.id === id)
    if (idx !== -1) {
      extensions.value[idx] = { ...extensions.value[idx], ...data }
    }
  }

  /**
   * 获取指定账号已加载的扩展 ID 列表
   */
  async function fetchAccountLoadedExtensions(accountId: string): Promise<void> {
    const ids = await window.api.extension.getLoaded(accountId)
    accountLoadedExtensions.value[accountId] = ids
  }

  return {
    extensions,
    accountLoadedExtensions,
    isLoading,
    getLoadedExtensionIds,
    isExtensionLoaded,
    getLoadedExtensions,
    init,
    loadExtension,
    unloadExtension,
    selectExtension,
    deleteExtension,
    updateExtension,
    fetchAccountLoadedExtensions
  }
})
