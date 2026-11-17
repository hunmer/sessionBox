import { ipcRenderer } from 'electron'
import type { DefaultBrowserResult, TabImplementation } from './types'

export function createSettingsApi() {
  return {
    getTabFreezeMinutes: (): Promise<number> => ipcRenderer.invoke('settings:getTabFreezeMinutes'),
    setTabFreezeMinutes: (minutes: number): Promise<void> => ipcRenderer.invoke('settings:setTabFreezeMinutes', minutes),
    getRestoreLastUrl: (): Promise<boolean> => ipcRenderer.invoke('settings:getRestoreLastUrl'),
    setRestoreLastUrl: (enabled: boolean): Promise<void> => ipcRenderer.invoke('settings:setRestoreLastUrl', enabled),
    getTabImplementation: (): Promise<TabImplementation> => ipcRenderer.invoke('settings:getTabImplementation'),
    setTabImplementation: (implementation: TabImplementation): Promise<void> => ipcRenderer.invoke('settings:setTabImplementation', implementation),
    setDefaultBrowser: (enabled: boolean): Promise<DefaultBrowserResult> => ipcRenderer.invoke('settings:setDefaultBrowser', enabled),
    checkDefaultBrowser: (): Promise<boolean> => ipcRenderer.invoke('settings:checkDefaultBrowser'),
    getMinimizeOnClose: (): Promise<boolean> => ipcRenderer.invoke('settings:getMinimizeOnClose'),
    setMinimizeOnClose: (enabled: boolean): Promise<void> => ipcRenderer.invoke('settings:setMinimizeOnClose', enabled),
    getDefaultContainerId: (): Promise<string> => ipcRenderer.invoke('settings:getDefaultContainerId'),
    setDefaultContainerId: (id: string): Promise<void> => ipcRenderer.invoke('settings:setDefaultContainerId', id),
    getAskContainerOnOpen: (): Promise<boolean> => ipcRenderer.invoke('settings:getAskContainerOnOpen'),
    setAskContainerOnOpen: (enabled: boolean): Promise<void> => ipcRenderer.invoke('settings:setAskContainerOnOpen', enabled),
    getDefaultWorkspaceId: (): Promise<string> => ipcRenderer.invoke('settings:getDefaultWorkspaceId'),
    setDefaultWorkspaceId: (id: string): Promise<void> => ipcRenderer.invoke('settings:setDefaultWorkspaceId', id),
    getSessionApi: (): Promise<{ port: number; token: string }> => ipcRenderer.invoke('settings:getSessionApi'),
    setSessionApi: (settings: { port: number; token: string }): Promise<void> => ipcRenderer.invoke('settings:setSessionApi', settings)
  }
}
