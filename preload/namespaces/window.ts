import { ipcRenderer } from 'electron'

export function createWindowApi() {
  return {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<boolean> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    toggleFullscreen: (): Promise<void> => ipcRenderer.invoke('window:toggleFullscreen'),
    toggleDevTools: (): Promise<void> => ipcRenderer.invoke('window:toggleDevTools'),
    startResize: (direction: string): void => {
      ipcRenderer.send('window:startResize', direction)
    },
    endResize: (): void => {
      ipcRenderer.send('window:endResize')
    }
  }
}
