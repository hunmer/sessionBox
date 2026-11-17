import { ipcRenderer } from 'electron'
import type { Proxy } from './types'

export function createProxyApi() {
  return {
    list: (): Promise<Proxy[]> => ipcRenderer.invoke('proxy:list'),
    create: (data: Omit<Proxy, 'id'>): Promise<Proxy> =>
      ipcRenderer.invoke('proxy:create', data),
    update: (id: string, data: Partial<Omit<Proxy, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('proxy:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('proxy:delete', id),
    test: (proxyId: string): Promise<{ ok: boolean; ip?: string; error?: string }> =>
      ipcRenderer.invoke('proxy:test', proxyId),
    testConfig: (config: Omit<Proxy, 'id'>): Promise<{ ok: boolean; ip?: string; error?: string }> =>
      ipcRenderer.invoke('proxy:test-config', config)
  }
}
