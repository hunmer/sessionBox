import { ipcRenderer } from 'electron'

// Skill 管理
export function createSkillApi() {
  return {
    list: (): Promise<Array<{ name: string; description: string; created: string; updated: string }>> =>
      ipcRenderer.invoke('skill:list'),
    search: (query: string): Promise<Array<{ name: string; description: string; created: string; updated: string }>> =>
      ipcRenderer.invoke('skill:search', query),
    read: (name: string): Promise<{ name: string; description: string; content: string; updated: string } | null> =>
      ipcRenderer.invoke('skill:read', name),
    write: (name: string, description: string, content: string) =>
      ipcRenderer.invoke('skill:write', name, description, content),
    delete: (name: string): Promise<boolean> =>
      ipcRenderer.invoke('skill:delete', name),
  }
}
