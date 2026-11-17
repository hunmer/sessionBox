import { ipcRenderer } from 'electron'
import type { SavedSplitSchemeData, SplitLayoutData } from './types'

export function createSplitApi() {
  return {
    updateMultiBounds: (paneBounds: Array<{ tabId: string; rect: { x: number; y: number; width: number; height: number } }>): void =>
      ipcRenderer.send('split:update-multi-bounds', paneBounds),
    getState: (workspaceId: string): Promise<SplitLayoutData | null> =>
      ipcRenderer.invoke('split:get-state', workspaceId),
    setState: (workspaceId: string, data: SplitLayoutData): Promise<void> =>
      ipcRenderer.invoke('split:set-state', workspaceId, data),
    clearState: (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke('split:clear-state', workspaceId),
    listSchemes: (): Promise<SavedSplitSchemeData[]> =>
      ipcRenderer.invoke('split:list-schemes'),
    createScheme: (data: SavedSplitSchemeData): Promise<SavedSplitSchemeData> =>
      ipcRenderer.invoke('split:create-scheme', data),
    deleteScheme: (id: string): Promise<void> =>
      ipcRenderer.invoke('split:delete-scheme', id)
  }
}
