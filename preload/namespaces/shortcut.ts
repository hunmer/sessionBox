import { ipcRenderer } from 'electron'
import type { ShortcutGroup, ShortcutItem } from './types'

export function createShortcutApi() {
  return {
    list: (): Promise<{ groups: ShortcutGroup[]; shortcuts: ShortcutItem[] }> => ipcRenderer.invoke('shortcut:list'),
    update: (id: string, accelerator: string, isGlobal: boolean, enabled?: boolean): Promise<{ success: boolean; error?: string; conflictId?: string }> =>
      ipcRenderer.invoke('shortcut:update', id, accelerator, isGlobal, enabled),
    toggle: (id: string, enabled: boolean): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('shortcut:toggle', id, enabled),
    clear: (id: string): Promise<{ success: boolean }> => ipcRenderer.invoke('shortcut:clear', id),
    reset: (): Promise<{ success: boolean }> => ipcRenderer.invoke('shortcut:reset')
  }
}
