import { ipcMain } from 'electron'
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_GROUPS,
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
    return {
      groups: SHORTCUT_GROUPS,
      shortcuts: SHORTCUT_ACTIONS.map(action => {
        const binding = bindings.find(b => b.id === action.id)
        return {
          id: action.id,
          label: action.label,
          accelerator: binding?.accelerator ?? action.defaultAccelerator,
          global: binding?.global ?? false,
          enabled: binding?.enabled ?? true,
          supportsGlobal: action.supportsGlobal,
          defaultAccelerator: action.defaultAccelerator,
          group: action.group
        }
      })
    }
  })

  // 更新快捷键绑定
  ipcMain.handle('shortcut:update', (_e, id: string, accelerator: string, isGlobal: boolean, enabled?: boolean) => {
    // 获取当前 enabled 状态，如果没传则保持不变
    if (enabled === undefined) {
      const bindings = getMergedBindings()
      const current = bindings.find(b => b.id === id)
      enabled = current?.enabled ?? true
    }
    return updateShortcutBinding(id, accelerator, isGlobal, enabled)
  })

  // 切换快捷键启用状态
  ipcMain.handle('shortcut:toggle', (_e, id: string, enabled: boolean) => {
    const bindings = getMergedBindings()
    const current = bindings.find(b => b.id === id)
    if (!current) return { success: false, error: '快捷键不存在' }
    return updateShortcutBinding(id, current.accelerator, current.global, enabled)
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
