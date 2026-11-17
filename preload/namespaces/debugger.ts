import { ipcRenderer } from 'electron'

export function createDebuggerApi() {
  return {
    getTabs: (): Promise<any[]> => ipcRenderer.invoke('debugger:get-tabs'),
    getActionRun: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:get-action-run', wcId),
    clearActionSteps: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:clear-action-steps', wcId),
    injectActionRecorder: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:inject-action-recorder', wcId),
    startActionRecord: (wcId: number, options?: any): Promise<any> => ipcRenderer.invoke('debugger:start-action-record', wcId, options),
    stopActionRecord: (wcId: number): Promise<any> => ipcRenderer.invoke('debugger:stop-action-record', wcId),
    highlightActionStep: (wcId: number, step?: any | null): Promise<any> => ipcRenderer.invoke('debugger:highlight-action-step', wcId, step),
    playActionRun: (wcId: number, run: any, options?: any): Promise<any> => ipcRenderer.invoke('debugger:play-action-run', wcId, run, options),
    saveActionPreset: (name: string, run: any): Promise<any> => ipcRenderer.invoke('debugger:save-action-preset', name, run),
    listActionPresets: (): Promise<any[]> => ipcRenderer.invoke('debugger:list-action-presets'),
    loadActionPreset: (id: string): Promise<any> => ipcRenderer.invoke('debugger:load-action-preset', id),
    updateActionPreset: (id: string, patch: any): Promise<any> => ipcRenderer.invoke('debugger:update-action-preset', id, patch),
    deleteActionPreset: (id: string): Promise<any> => ipcRenderer.invoke('debugger:delete-action-preset', id),
    stopActionPlay: (playId?: string): Promise<any> => ipcRenderer.invoke('debugger:stop-action-play', playId),
    onActionStep: (callback: (step: any) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, step: any) => callback(step)
      ipcRenderer.on('on:debugger:action-step', handler)
      return () => ipcRenderer.removeListener('on:debugger:action-step', handler)
    },
  }
}
