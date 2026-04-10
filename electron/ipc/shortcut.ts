import { ipcMain } from 'electron'
import {
  SHORTCUT_ACTIONS,
  getMergedBindings,
  updateShortcutBinding,
  clearShortcutBinding,
  registerGlobalShortcuts,
  unregisterGlobalShortcuts
} from '../services/shortcut-manager'

export function registerShortcutIpcHandlers(): void {
  // 获取功能列表（含当前绑定）
  ipcMain.handle('shortcut:list', () => {
    const bindings = getMergedBindings()
    return SHORTCUT_ACTIONS.map(action => {
      const binding = bindings.find(b => b.id === action.id)
      return {
        id: action.id,
        label: action.label,
        accelerator: binding?.accelerator ?? action.defaultAccelerator,
        global: binding?.global ?? false,
        supportsGlobal: action.supportsGlobal,
        defaultAccelerator: action.defaultAccelerator
      }
    })
  })

  // 更新快捷键绑定
  ipcMain.handle('shortcut:update', (_e, id: string, accelerator: string, isGlobal: boolean) => {
    return updateShortcutBinding(id, accelerator, isGlobal)
  })

  // 清除快捷键
  ipcMain.handle('shortcut:clear', (_e, id: string) => {
    clearShortcutBinding(id)
    return { success: true }
  })

  // 重置为默认
  ipcMain.handle('shortcut:reset', () => {
    registerGlobalShortcuts()
    return { success: true }
  })
}

export { registerGlobalShortcuts, unregisterGlobalShortcuts }
