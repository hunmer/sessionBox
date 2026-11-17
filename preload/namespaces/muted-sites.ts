import { ipcRenderer } from 'electron'

export function createMutedSitesApi() {
  return {
    list: (): Promise<string[]> => ipcRenderer.invoke('mutedSites:list'),
    set: (sites: string[]): Promise<void> => ipcRenderer.invoke('mutedSites:set', sites),
    add: (hostname: string): Promise<void> => ipcRenderer.invoke('mutedSites:add', hostname),
    remove: (hostname: string): Promise<void> => ipcRenderer.invoke('mutedSites:remove', hostname)
  }
}
