import { ipcRenderer } from 'electron'
import type { Group } from './types'

export function createGroupApi() {
  return {
    list: (): Promise<Group[]> => ipcRenderer.invoke('group:list'),
    create: (name: string, color?: string, workspaceId?: string, proxyId?: string, icon?: string): Promise<Group> =>
      ipcRenderer.invoke('group:create', name, color, workspaceId, proxyId, icon),
    update: (id: string, data: Partial<Omit<Group, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('group:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('group:delete', id),
    reorder: (groupIds: string[]): Promise<void> =>
      ipcRenderer.invoke('group:reorder', groupIds)
  }
}
