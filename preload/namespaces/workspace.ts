import { ipcRenderer } from 'electron'
import type { Workspace } from './types'

export function createWorkspaceApi() {
  return {
    list: (): Promise<Workspace[]> => ipcRenderer.invoke('workspace:list'),
    create: (title: string, color: string, icon?: string): Promise<Workspace> =>
      ipcRenderer.invoke('workspace:create', title, color, icon),
    update: (id: string, data: Partial<Omit<Workspace, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('workspace:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('workspace:delete', id),
    reorder: (workspaceIds: string[]): Promise<void> =>
      ipcRenderer.invoke('workspace:reorder', workspaceIds)
  }
}
