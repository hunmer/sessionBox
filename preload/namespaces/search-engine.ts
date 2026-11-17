import { ipcRenderer } from 'electron'
import type { SearchEngine } from './types'

export function createSearchEngineApi() {
  return {
    list: (): Promise<SearchEngine[]> => ipcRenderer.invoke('searchEngine:list'),
    set: (engines: SearchEngine[]): Promise<void> => ipcRenderer.invoke('searchEngine:set', engines),
    getDefault: (): Promise<string> => ipcRenderer.invoke('searchEngine:getDefault'),
    setDefault: (id: string): Promise<void> => ipcRenderer.invoke('searchEngine:setDefault', id)
  }
}
