import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FavoriteSite } from '../types'

const api = window.api

export const useFavoriteSiteStore = defineStore('favoriteSite', () => {
  // ====== 状态 ======
  const sites = ref<FavoriteSite[]>([])

  // ====== 操作 ======

  async function loadSites() {
    sites.value = await api.favoriteSite.list()
  }

  async function createSite(data: Omit<FavoriteSite, 'id'>) {
    const site = await api.favoriteSite.create(data)
    sites.value.push(site)
    return site
  }

  async function updateSite(id: string, data: Partial<Omit<FavoriteSite, 'id'>>) {
    await api.favoriteSite.update(id, data)
    const idx = sites.value.findIndex((s) => s.id === id)
    if (idx !== -1) sites.value[idx] = { ...sites.value[idx], ...data }
  }

  async function deleteSite(id: string) {
    await api.favoriteSite.delete(id)
    sites.value = sites.value.filter((s) => s.id !== id)
  }

  /** 初始化 */
  async function init() {
    await loadSites()
  }

  return {
    sites,
    loadSites,
    createSite,
    updateSite,
    deleteSite,
    init
  }
})
