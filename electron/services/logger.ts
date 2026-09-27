import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'path'

const MAX_LOG_SIZE = 5 * 1024 * 1024

// 对常见密钥形态脱敏（sk- 前缀 token、Bearer 凭证），避免明文落盘
function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer ***')
}

function serialize(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * 主进程文件日志：把 console.log/warn/error 同步追加到 userData/logs/main.log。
 * 使用 appendFileSync 保证 native 崩溃（SIGSEGV 等）发生前已输出的日志不丢失。
 */
export function initFileLogger(): void {
  try {
    const logDir = join(app.getPath('userData'), 'logs')
    mkdirSync(logDir, { recursive: true })
    const logFile = join(logDir, 'main.log')

    // 启动时轮转：超过 5MB 保留一份 .old
    try {
      if (existsSync(logFile) && statSync(logFile).size > MAX_LOG_SIZE) {
        renameSync(logFile, join(logDir, 'main.old.log'))
      }
    } catch {
      // 轮转失败不影响运行
    }

    const write = (level: string, args: unknown[]): void => {
      try {
        appendFileSync(logFile, `${new Date().toISOString()} [${level}] ${redact(args.map(serialize).join(' '))}\n`)
      } catch {
        // 日志写失败不能影响主进程
      }
    }

    for (const level of ['log', 'warn', 'error'] as const) {
      const original = console[level].bind(console)
      console[level] = (...args: unknown[]) => {
        original(...args)
        write(level.toUpperCase(), args)
      }
    }

    write('INFO', [
      `=== 主进程启动 pid=${process.pid} app=${app.getVersion()} electron=${process.versions.electron} node=${process.versions.node} ===`
    ])
  } catch {
    // userData 不可用时静默跳过文件日志
  }
}
