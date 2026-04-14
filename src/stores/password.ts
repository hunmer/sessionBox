import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PasswordEntry } from '../types'

const api = window.api

export const usePasswordStore = defineStore('password', () => {
  // ====== 状态 ======
  const entries = ref<PasswordEntry[]>([])

  // ====== 操作 ======

  async function loadEntries() {
    entries.value = await api.password.list()
  }

  async function createEntry(data: Omit<PasswordEntry, 'id'>) {
    const entry = await api.password.create(data)
    entries.value.push(entry)
    return entry
  }

  async function updateEntry(id: string, data: Partial<Omit<PasswordEntry, 'id'>>) {
    await api.password.update(id, data)
    const idx = entries.value.findIndex((e) => e.id === id)
    if (idx !== -1) {
      entries.value[idx] = { ...entries.value[idx], ...data, updatedAt: Date.now() }
    }
  }

  async function deleteEntry(id: string) {
    await api.password.delete(id)
    entries.value = entries.value.filter((e) => e.id !== id)
  }

  /** 获取指定站点的条目 */
  function getEntriesBySite(siteOrigin: string): PasswordEntry[] {
    return entries.value
      .filter((e) => e.siteOrigin === siteOrigin)
      .sort((a, b) => a.order - b.order)
  }

  /** 获取所有已保存的站点去重列表 */
  function getUniqueSites(): string[] {
    return [...new Set(entries.value.map((e) => e.siteOrigin))]
  }

  /** 根据 ID 查找条目 */
  function getEntryById(id: string): PasswordEntry | undefined {
    return entries.value.find((e) => e.id === id)
  }

  // ====== 初始化 ======
  async function init() {
    await loadEntries()
  }

  return {
    entries,
    loadEntries,
    createEntry,
    updateEntry,
    deleteEntry,
    getEntriesBySite,
    getUniqueSites,
    getEntryById,
    init
  }
})
