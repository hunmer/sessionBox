import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Page } from '../types'

const api = window.api

export const usePageStore = defineStore('page', () => {
  const pages = ref<Page[]>([])

  const pagesByGroup = computed(() => {
    const map = new Map<string, Page[]>()
    for (const page of pages.value) {
      const list = map.get(page.groupId) || []
      list.push(page)
      map.set(page.groupId, list)
    }
    return map
  })

  function getPage(id: string): Page | undefined {
    return pages.value.find(p => p.id === id)
  }

  async function loadPages() {
    pages.value = await api.page.list()
  }

  async function createPage(data: Omit<Page, 'id'>) {
    const page = await api.page.create(data)
    pages.value.push(page)
    return page
  }

  async function updatePage(id: string, data: Partial<Omit<Page, 'id'>>) {
    await api.page.update(id, data)
    const idx = pages.value.findIndex(p => p.id === id)
    if (idx !== -1) pages.value[idx] = { ...pages.value[idx], ...data }
  }

  async function deletePage(id: string) {
    await api.page.delete(id)
    pages.value = pages.value.filter(p => p.id !== id)
  }

  async function reorderPages(pageIds: string[]) {
    await api.page.reorder(pageIds)
    pageIds.forEach((id, order) => {
      const p = pages.value.find(p => p.id === id)
      if (p) p.order = order
    })
  }

  return {
    pages,
    pagesByGroup,
    getPage,
    loadPages,
    createPage,
    updatePage,
    deletePage,
    reorderPages
  }
})
