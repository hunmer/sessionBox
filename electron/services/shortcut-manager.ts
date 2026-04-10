import { globalShortcut, BrowserWindow } from 'electron'
import { getShortcutBindings, setShortcutBindings } from './store'

/** 功能定义 */
export interface ShortcutAction {
  id: string
  label: string
  defaultAccelerator: string
  supportsGlobal: boolean
}

/** 预定义功能注册表 */
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'new-tab', label: '新建标签页', defaultAccelerator: 'CmdOrCtrl+T', supportsGlobal: true },
  { id: 'close-tab', label: '关闭当前标签页', defaultAccelerator: 'CmdOrCtrl+W', supportsGlobal: true },
  { id: 'next-tab', label: '下一个标签页', defaultAccelerator: 'CmdOrCtrl+Tab', supportsGlobal: false },
  { id: 'prev-tab', label: '上一个标签页', defaultAccelerator: 'CmdOrCtrl+Shift+Tab', supportsGlobal: false },
  { id: 'toggle-sidebar', label: '切换侧边栏', defaultAccelerator: 'CmdOrCtrl+B', supportsGlobal: true },
  { id: 'new-account', label: '新建账号', defaultAccelerator: 'CmdOrCtrl+N', supportsGlobal: true },
  { id: 'reload-tab', label: '刷新当前页', defaultAccelerator: 'CmdOrCtrl+R', supportsGlobal: false },
  { id: 'go-back', label: '后退', defaultAccelerator: 'Alt+Left', supportsGlobal: false },
  { id: 'go-forward', label: '前进', defaultAccelerator: 'Alt+Right', supportsGlobal: false },
  { id: 'focus-address', label: '聚焦地址栏', defaultAccelerator: 'CmdOrCtrl+L', supportsGlobal: false }
]

/** 快捷键绑定 */
export interface ShortcutBinding {
  id: string
  accelerator: string
  global: boolean
}

/** 获取功能的有效快捷键（用户自定义或默认） */
export function getEffectiveAccelerator(actionId: string): string {
  const bindings = getShortcutBindings()
  const binding = bindings.find(b => b.id === actionId)
  if (binding) return binding.accelerator
  const action = SHORTCUT_ACTIONS.find(a => a.id === actionId)
  return action?.defaultAccelerator || ''
}

/** 获取合并后的完整绑定列表（用户自定义 + 默认值） */
export function getMergedBindings(): ShortcutBinding[] {
  const bindings = getShortcutBindings()
  return SHORTCUT_ACTIONS.map(action => {
    const custom = bindings.find(b => b.id === action.id)
    return {
      id: action.id,
      accelerator: custom?.accelerator ?? action.defaultAccelerator,
      global: custom?.global ?? false
    }
  })
}

/** 注册所有标记为全局的快捷键 */
export function registerGlobalShortcuts(): void {
  // 先清除所有已注册的
  globalShortcut.unregisterAll()

  const bindings = getMergedBindings()
  for (const binding of bindings) {
    if (!binding.global || !binding.accelerator) continue

    try {
      globalShortcut.register(binding.accelerator, () => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) {
          if (win.isMinimized()) win.restore()
          win.focus()
          win.webContents.send('on:shortcut', binding.id)
        }
      })
    } catch {
      console.warn(`[ShortcutManager] 注册全局快捷键失败: ${binding.accelerator} (${binding.id})`)
    }
  }
}

/** 卸载所有全局快捷键 */
export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
}

/** 更新单个快捷键绑定 */
export function updateShortcutBinding(id: string, accelerator: string, isGlobal: boolean): { success: boolean; error?: string } {
  const action = SHORTCUT_ACTIONS.find(a => a.id === id)
  if (!action) return { success: false, error: '功能不存在' }

  // 冲突检测：检查快捷键是否已被其他功能占用
  if (accelerator) {
    const bindings = getMergedBindings()
    const conflict = bindings.find(b => b.id !== id && b.accelerator === accelerator)
    if (conflict) {
      const conflictAction = SHORTCUT_ACTIONS.find(a => a.id === conflict.id)
      return { success: false, error: `快捷键已被「${conflictAction?.label}」占用` }
    }
  }

  // 保存到 store
  const bindings = getShortcutBindings()
  const idx = bindings.findIndex(b => b.id === id)
  const binding: ShortcutBinding = { id, accelerator, global: action.supportsGlobal && isGlobal }
  if (idx >= 0) {
    bindings[idx] = binding
  } else {
    bindings.push(binding)
  }
  setShortcutBindings(bindings)

  // 重新注册全局快捷键
  registerGlobalShortcuts()

  return { success: true }
}

/** 清除单个快捷键 */
export function clearShortcutBinding(id: string): void {
  updateShortcutBinding(id, '', false)
}
