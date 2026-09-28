import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { listExtensions, updateExtension } from './store'

/**
 * 崩溃哨兵：启动时写入「运行中」标记，正常退出时更新为 clean。
 * 下次启动若标记仍为 running，说明上次进程被异常终止（主进程崩溃/强杀/断电），
 * 此时自动禁用全部扩展，打破「加载扩展 → 主进程崩溃 → 重启 → 再加载」的闪退循环。
 * 关机/注销场景标记可能来不及清理导致误禁用一次，属可接受代价，用户可在设置中重新启用。
 */
const STATE_FILE = '.crash-guard.json'

interface CrashGuardState {
  status: 'running' | 'clean'
  pid: number
  at: string
}

function statePath(): string {
  return join(app.getPath('userData'), STATE_FILE)
}

/**
 * 启动时调用（须在扩展加载前）：写入本次运行标记。
 * 返回上次是否异常退出。
 */
export function initCrashGuard(): boolean {
  let crashedLastRun = false
  try {
    if (existsSync(statePath())) {
      const state = JSON.parse(readFileSync(statePath(), 'utf-8')) as CrashGuardState
      crashedLastRun = state?.status === 'running'
    }
  } catch {
    // 标记损坏按异常退出处理，宁可多禁用一次也不冒闪退循环的风险
    crashedLastRun = true
  }
  try {
    const state: CrashGuardState = { status: 'running', pid: process.pid, at: new Date().toISOString() }
    writeFileSync(statePath(), JSON.stringify(state))
  } catch (error) {
    console.warn('[CrashGuard] 运行标记写入失败，崩溃检测不可用:', error)
  }
  return crashedLastRun
}

/** 正常退出路径（before-quit/session-end）调用：把标记更新为 clean */
export function markCleanQuit(): void {
  try {
    const state: CrashGuardState = { status: 'clean', pid: process.pid, at: new Date().toISOString() }
    writeFileSync(statePath(), JSON.stringify(state))
  } catch {
    // 退出路径上静默失败，不影响退出
  }
}

/** 禁用全部已启用的扩展，返回禁用数量 */
export function disableAllExtensions(): number {
  let count = 0
  for (const extension of listExtensions()) {
    if (!extension.enabled) continue
    try {
      updateExtension(extension.id, { enabled: false })
      count++
    } catch (error) {
      console.warn('[CrashGuard] 禁用扩展失败:', extension.name, error)
    }
  }
  return count
}
