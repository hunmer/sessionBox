import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Proxy } from '../types'

const api = window.api

export const useProxyStore = defineStore('proxy', () => {
  // ====== 状态 ======
  const proxies = ref<Proxy[]>([])

  /** 根据 ID 获取代理 */
  function getProxy(id: string): Proxy | undefined {
    return proxies.value.find((p) => p.id === id)
  }

  // ====== 操作 ======

  async function loadProxies() {
    proxies.value = await api.proxy.list()
  }

  async function createProxy(data: Omit<Proxy, 'id'>) {
    const proxy = await api.proxy.create(data)
    proxies.value.push(proxy)
    return proxy
  }

  async function updateProxy(id: string, data: Partial<Omit<Proxy, 'id'>>) {
    await api.proxy.update(id, data)
    const idx = proxies.value.findIndex((p) => p.id === id)
    if (idx !== -1) proxies.value[idx] = { ...proxies.value[idx], ...data }
  }

  async function deleteProxy(id: string) {
    await api.proxy.delete(id)
    proxies.value = proxies.value.filter((p) => p.id !== id)
  }

  async function testProxy(proxyId: string) {
    return api.proxy.test(proxyId)
  }

  /** 初始化 */
  async function init() {
    await loadProxies()
  }

  return {
    proxies,
    getProxy,
    loadProxies,
    createProxy,
    updateProxy,
    deleteProxy,
    testProxy,
    init
  }
})
