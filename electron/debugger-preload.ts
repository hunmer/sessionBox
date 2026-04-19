// electron/debugger-preload.ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getTabs: (): Promise<any[]> => ipcRenderer.invoke('debugger:get-tabs'),
  inject: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:inject', wcId),
  startRecord: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:start-record', wcId),
  stopRecord: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:stop-record', wcId),
  getEvents: (wcId: number): Promise<any[]> => ipcRenderer.invoke('debugger:get-events', wcId),
  exportEvents: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:export-events', wcId),
  loadUrl: (url: string): Promise<any> => ipcRenderer.invoke('debugger:load-url', url),

  minimize: () => ipcRenderer.invoke('debugger:window-minimize'),
  maximize: () => ipcRenderer.invoke('debugger:window-maximize'),
  close: () => ipcRenderer.invoke('debugger:window-close'),

  on: (channel: string, callback: (...args: any[]) => void) => {
    const handler = (_e: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('debuggerApi', api)
}
