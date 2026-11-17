import { ipcRenderer } from 'electron'

export function createSnifferApi() {
  return {
    toggle: (tabId: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('sniffer:toggle', tabId, enabled),
    setDomainEnabled: (domain: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('sniffer:setDomainEnabled', domain, enabled),
    getDomainList: (): Promise<string[]> =>
      ipcRenderer.invoke('sniffer:getDomainList'),
    clearResources: (tabId: string): Promise<void> =>
      ipcRenderer.invoke('sniffer:clearResources', tabId),
    getState: (tabId: string): Promise<{ enabled: boolean }> =>
      ipcRenderer.invoke('sniffer:getState', tabId),
  }
}
