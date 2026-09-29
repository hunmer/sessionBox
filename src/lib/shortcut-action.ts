// src/lib/shortcut-action.ts
// 渲染进程快捷键动作执行入口：App.vue 挂载时注册唯一 handler（与主进程 on:shortcut 事件共用），
// 命令面板 provider / 快捷键速查弹窗通过 executeShortcutAction 复用同一条执行路径

let handler: ((actionId: string) => void) | null = null

export function registerShortcutActionHandler(fn: (actionId: string) => void): void {
  handler = fn
}

/** 按 actionId 执行快捷键动作，返回是否已执行（handler 未注册时为 false） */
export function executeShortcutAction(actionId: string): boolean {
  if (!handler) {
    console.warn('[ShortcutAction] handler 未注册，无法执行:', actionId)
    return false
  }
  handler(actionId)
  return true
}
