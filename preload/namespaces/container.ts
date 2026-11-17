import { ipcRenderer } from 'electron'
import type { Container } from './types'

export function createContainerApi() {
  return {
    list: (): Promise<Container[]> => ipcRenderer.invoke('container:list'),
    create: (data: Omit<Container, 'id'>): Promise<Container> =>
      ipcRenderer.invoke('container:create', data),
    update: (id: string, data: Partial<Omit<Container, 'id'>>): Promise<void> =>
      ipcRenderer.invoke('container:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('container:delete', id),
    reorder: (containerIds: string[]): Promise<void> =>
      ipcRenderer.invoke('container:reorder', containerIds),
    uploadIcon: (): Promise<string | null> => ipcRenderer.invoke('container:uploadIcon'),
    uploadIconFromUrl: (url: string): Promise<string | null> =>
      ipcRenderer.invoke('container:uploadIconFromUrl', url),
    createDesktopShortcut: (containerId: string): Promise<string> =>
      ipcRenderer.invoke('container:createDesktopShortcut', containerId)
  }
}
