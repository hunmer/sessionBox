import { ipcRenderer } from 'electron'

export function createAiProviderApi() {
  return {
    list: (): Promise<any[]> => ipcRenderer.invoke('ai-provider:list'),
    create: (data: any): Promise<any> => ipcRenderer.invoke('ai-provider:create', data),
    update: (data: { id: string; [key: string]: any }): Promise<any> =>
      ipcRenderer.invoke('ai-provider:update', data),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('ai-provider:delete', id),
    test: (id: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('ai-provider:test', id),
  }
}
