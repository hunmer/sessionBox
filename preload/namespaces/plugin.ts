import { ipcRenderer } from 'electron'
import type { PluginMeta } from './types'

export function createPluginApi() {
  return {
    list: (): Promise<PluginMeta[]> => ipcRenderer.invoke('plugin:list'),
    enable: (pluginId: string): Promise<void> => ipcRenderer.invoke('plugin:enable', pluginId),
    disable: (pluginId: string): Promise<void> => ipcRenderer.invoke('plugin:disable', pluginId),
    getView: (pluginId: string): Promise<string | null> => ipcRenderer.invoke('plugin:get-view', pluginId),
    getIcon: (pluginId: string): Promise<string | null> => ipcRenderer.invoke('plugin:get-icon', pluginId),
    importZip: (): Promise<{ success: boolean; pluginName?: string; error?: string }> =>
      ipcRenderer.invoke('plugin:import-zip'),
    openFolder: (): Promise<void> => ipcRenderer.invoke('plugin:open-folder'),
    install: (url: string): Promise<{ success: boolean; pluginName?: string; error?: string }> =>
      ipcRenderer.invoke('plugin:install', url),
    uninstall: (pluginId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('plugin:uninstall', pluginId),
    openDefault: (pluginId: string): Promise<void> => ipcRenderer.invoke('plugin:open-default', pluginId),
    openLog: (pluginId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('plugin:open-log', pluginId)
  }
}
