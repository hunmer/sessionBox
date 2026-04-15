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
  { id: 'next-tab', label: '下一个标签页', defaultAccelerator: 'CmdOrCtrl+Tab', supportsGlobal: true },
  { id: 'prev-tab', label: '上一个标签页', defaultAccelerator: 'CmdOrCtrl+Shift+Tab', supportsGlobal: true },
  { id: 'toggle-sidebar', label: '切换侧边栏', defaultAccelerator: 'CmdOrCtrl+B', supportsGlobal: true },
  { id: 'new-container', label: '新建容器', defaultAccelerator: 'CmdOrCtrl+N', supportsGlobal: true },
  { id: 'reload-tab', label: '刷新当前页', defaultAccelerator: 'CmdOrCtrl+R', supportsGlobal: true },
  { id: 'go-back', label: '后退', defaultAccelerator: 'Alt+Left', supportsGlobal: true },
  { id: 'go-forward', label: '前进', defaultAccelerator: 'Alt+Right', supportsGlobal: true },
  { id: 'focus-address', label: '聚焦地址栏', defaultAccelerator: 'CmdOrCtrl+L', supportsGlobal: true },
  { id: 'toggle-fullscreen', label: '切换全屏', defaultAccelerator: 'F11', supportsGlobal: true },
  { id: 'restore-tab', label: '恢复关闭的标签页', defaultAccelerator: 'CmdOrCtrl+Shift+T', supportsGlobal: true },
  { id: 'reload-tab-f5', label: '刷新页面 (F5)', defaultAccelerator: 'F5', supportsGlobal: true },
  { id: 'force-reload', label: '强制刷新（清除缓存）', defaultAccelerator: 'CmdOrCtrl+Shift+R', supportsGlobal: true },
  { id: 'toggle-bookmark-bar', label: '显示/隐藏书签栏', defaultAccelerator: 'CmdOrCtrl+Shift+B', supportsGlobal: true },
  { id: 'open-downloads', label: '打开下载页面', defaultAccelerator: 'CmdOrCtrl+J', supportsGlobal: true },
  { id: 'open-history', label: '打开历史记录', defaultAccelerator: 'CmdOrCtrl+H', supportsGlobal: true },
  { id: 'zoom-in', label: '放大页面', defaultAccelerator: 'CmdOrCtrl+Plus', supportsGlobal: true },
  { id: 'zoom-out', label: '缩小页面', defaultAccelerator: 'CmdOrCtrl+-', supportsGlobal: true },
  { id: 'zoom-reset', label: '重置页面缩放', defaultAccelerator: 'CmdOrCtrl+0', supportsGlobal: true },
  { id: 'open-devtools', label: '打开开发者工具', defaultAccelerator: 'F12', supportsGlobal: true },
  { id: 'open-devtools-alt', label: '打开开发者工具 (备用)', defaultAccelerator: 'CmdOrCtrl+Shift+I', supportsGlobal: true },
  { id: 'focus-address-f6', label: '聚焦地址栏 (F6)', defaultAccelerator: 'F6', supportsGlobal: true },
  { id: 'goto-tab-1', label: '跳转到第 1 个标签页', defaultAccelerator: 'CmdOrCtrl+1', supportsGlobal: true },
  { id: 'goto-tab-2', label: '跳转到第 2 个标签页', defaultAccelerator: 'CmdOrCtrl+2', supportsGlobal: true },
  { id: 'goto-tab-3', label: '跳转到第 3 个标签页', defaultAccelerator: 'CmdOrCtrl+3', supportsGlobal: true },
  { id: 'goto-tab-4', label: '跳转到第 4 个标签页', defaultAccelerator: 'CmdOrCtrl+4', supportsGlobal: true },
  { id: 'goto-tab-5', label: '跳转到第 5 个标签页', defaultAccelerator: 'CmdOrCtrl+5', supportsGlobal: true },
  { id: 'goto-tab-6', label: '跳转到第 6 个标签页', defaultAccelerator: 'CmdOrCtrl+6', supportsGlobal: true },
  { id: 'goto-tab-7', label: '跳转到第 7 个标签页', defaultAccelerator: 'CmdOrCtrl+7', supportsGlobal: true },
  { id: 'goto-tab-8', label: '跳转到第 8 个标签页', defaultAccelerator: 'CmdOrCtrl+8', supportsGlobal: true },
  { id: 'goto-tab-last', label: '跳转到最后一个标签页', defaultAccelerator: 'CmdOrCtrl+9', supportsGlobal: true },
  { id: 'tab-overview', label: '标签页概览', defaultAccelerator: 'CmdOrCtrl+Shift+A', supportsGlobal: true },
  { id: 'command-palette', label: '命令面板', defaultAccelerator: 'CmdOrCtrl+K', supportsGlobal: true }
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
        console.log('[Shortcut] 全局快捷键触发:', binding.id, binding.accelerator)
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
export function updateShortcutBinding(id: string, accelerator: string, isGlobal: boolean): { success: boolean; error?: string; conflictId?: string } {
  const action = SHORTCUT_ACTIONS.find(a => a.id === id)
  if (!action) return { success: false, error: '功能不存在' }

  // 冲突检测：检查快捷键是否已被其他功能占用
  if (accelerator) {
    const bindings = getMergedBindings()
    const conflict = bindings.find(b => b.id !== id && b.accelerator === accelerator)
    if (conflict) {
      const conflictAction = SHORTCUT_ACTIONS.find(a => a.id === conflict.id)
      return { success: false, error: `快捷键已被「${conflictAction?.label}」占用`, conflictId: conflict.id }
    }
  }

  // 保存到 store
  const bindings = getShortcutBindings()
  const idx = bindings.findIndex(b => b.id === id)
  const binding: ShortcutBinding = { id, accelerator, global: isGlobal }
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

/** 将 before-input-event 的键盘输入转为 Electron accelerator 格式 */
export function inputEventToAccelerator(input: Electron.Input): string | null {
  if (input.type !== 'keyDown') return null

  const parts: string[] = []
  if (input.control || input.meta) parts.push('CmdOrCtrl')
  if (input.alt) parts.push('Alt')
  // Shift 作为产生字符的辅助键（如 + 需要 Shift+=），不计入修饰键
  // 但对于非字符键（如字母/Tab/箭头），Shift 是有意义的修饰键
  const needsShiftForChar = input.key === '+' || input.key === '_'
  if (input.shift && !needsShiftForChar) parts.push('Shift')

  const key = input.key
  if (!key) return null

  // 忽略单独修饰键
  const modifierKeys = ['Control', 'Alt', 'Shift', 'Meta']
  if (modifierKeys.includes(key)) return null

  // 特殊键映射
  const keyMap: Record<string, string> = {
    ' ': 'Space',
    '+': 'Plus',
    'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
    'Tab': 'Tab', 'Enter': 'Enter', 'Escape': 'Escape',
    'Delete': 'Delete', 'Backspace': 'Backspace',
    'Insert': 'Insert', 'Home': 'Home', 'End': 'End',
    'PageUp': 'PageUp', 'PageDown': 'PageDown'
  }

  if (keyMap[key]) {
    parts.push(keyMap[key])
  } else if (key.length === 1) {
    parts.push(key.toUpperCase())
  } else if (key.startsWith('F') && /^F\d{1,2}$/.test(key)) {
    parts.push(key)
  } else {
    return null
  }

  return parts.join('+')
}

/** 根据 accelerator 查找匹配的本地快捷键（非全局） */
export function findLocalShortcutMatch(accelerator: string): string | null {
  const bindings = getMergedBindings()
  const match = bindings.find(b => b.accelerator === accelerator && !b.global)
  return match?.id ?? null
}

/** 根据 accelerator 查找匹配的任意快捷键（含全局） */
export function findAnyShortcutMatch(accelerator: string): string | null {
  const bindings = getMergedBindings()
  const match = bindings.find(b => b.accelerator === accelerator)
  return match?.id ?? null
}

/** 拦截本地快捷键并发送给渲染进程，返回是否已拦截 */
export function handleBeforeInputEvent(input: Electron.Input, sender: Electron.WebContents): boolean {
  const accelerator = inputEventToAccelerator(input)
  if (!accelerator) return false

  const actionId = findLocalShortcutMatch(accelerator)
  if (!actionId) return false

  console.log('[Shortcut] 本地快捷键拦截:', accelerator, '->', actionId)
  // 发送给渲染进程执行
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('on:shortcut', actionId)
  }
  return true
}
