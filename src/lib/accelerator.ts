// src/lib/accelerator.ts
// Electron accelerator 的显示格式化（设置页 / 快捷键列表 / 命令面板共用）

const DISPLAY_KEY_MAP: Record<string, string> = {
  CmdOrCtrl: 'Ctrl',
  CommandOrControl: 'Ctrl',
  Control: 'Ctrl',
  Command: 'Cmd',
  Meta: 'Win',
  Super: 'Win',
  Shift: 'Shift',
  Alt: 'Alt',
  AltGr: 'AltGr'
}

/** accelerator 拆分为显示按键数组（'CmdOrCtrl+Shift+T' -> ['Ctrl', 'Shift', 'T']） */
export function acceleratorToParts(accelerator: string): string[] {
  if (!accelerator) return []
  return accelerator.split('+').map(part => DISPLAY_KEY_MAP[part] || part)
}

/** accelerator 转为显示字符串（'CmdOrCtrl+T' -> 'Ctrl+T'） */
export function acceleratorToDisplay(accelerator: string): string {
  return acceleratorToParts(accelerator).join('+')
}
