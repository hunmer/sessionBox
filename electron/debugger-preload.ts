// electron/debugger-preload.ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getTabs: (): Promise<any[]> => ipcRenderer.invoke('debugger:get-tabs'),
  getTargetInfo: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:get-target-info', wcId),
  injectActionRecorder: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:inject-action-recorder', wcId),
  startActionRecord: (wcId: number, options?: any): Promise<any> => ipcRenderer.invoke('debugger:start-action-record', wcId, options),
  stopActionRecord: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:stop-action-record', wcId),
  getActionRun: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:get-action-run', wcId),
  exportActionRun: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:export-action-run', wcId),
  playActionRun: (wcId: number, run: any, options?: any): Promise<any> => ipcRenderer.invoke('debugger:play-action-run', wcId, run, options),
  saveActionPreset: (name: string, run: any): Promise<any> => ipcRenderer.invoke('debugger:save-action-preset', name, run),
  listActionPresets: (): Promise<any[]> => ipcRenderer.invoke('debugger:list-action-presets'),
  loadActionPreset: (id: string): Promise<any> => ipcRenderer.invoke('debugger:load-action-preset', id),
  stopActionPlay: (playId?: string): Promise<any> => ipcRenderer.invoke('debugger:stop-action-play', playId),
  loadUrl: (url: string): Promise<any> => ipcRenderer.invoke('debugger:load-url', url),
  getEmbeddedWcId: (): Promise<number | null> => ipcRenderer.invoke('debugger:get-embedded-wcid'),
  setEmbeddedWcId: (wcId: number | null): Promise<any> => ipcRenderer.invoke('debugger:set-embedded-wcid', wcId),

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
