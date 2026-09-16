import { app } from 'electron'
import type { WebContents } from 'electron'
import { createLogger, createProcmClient, setupLogger } from '@hunmer/procm-mcp-sdk'
import type { JsonValue, Logger, ProcmClient } from '@hunmer/procm-mcp-sdk'

// procm-mcp 托管启动（procm-commands.json 里带 roomId 的命令）时会注入这些环境变量；
// 手动启动（pnpm dev / 打包后的应用）不注入，console 保持原有行为不变
export function isProcmManaged(): boolean {
  return !!(process.env.PROCM_ROOM_ID && process.env.PROCM_WS_URL)
}

let client: ProcmClient | undefined
let rendererLogger: Logger | undefined

const RENDERER_LEVEL_MAP: Record<string, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: 'debug',
  info: 'info',
  warning: 'warn',
  error: 'error'
}

// 渲染进程日志独立写入 stderr：主进程 console 已被 setupLogger 接管，
// 直接走 stderr 避免 readable 文本被二次捕获造成重复条目
const stderrSink = {
  debug: (text: string) => process.stderr.write(`${text}\n`),
  info: (text: string) => process.stderr.write(`${text}\n`),
  warn: (text: string) => process.stderr.write(`${text}\n`),
  error: (text: string) => process.stderr.write(`${text}\n`)
}

/** 应用自身页面（dev server / 打包后的 file://）；容器中打开的外部网页不算 */
function isAppOrigin(url: string): boolean {
  return url.startsWith('http://localhost') || url.startsWith('file://')
}

/**
 * 仅转发应用自身窗口的渲染进程 console。Electron 38 中 WebContentsView 的
 * getType() 也是 'window'，无法按类型区分，改为按页面 URL 判断：
 * 应用页面全量转发，外部网页只转发告警和错误，避免容器网页刷屏。
 */
function forwardRendererConsole(contents: WebContents): void {
  contents.on('console-message', (details) => {
    const level = RENDERER_LEVEL_MAP[details.level] ?? 'info'
    const url = contents.getURL()
    const isAppPage = isAppOrigin(url)
    if (!isAppPage && level !== 'warn' && level !== 'error') return
    const data: Record<string, JsonValue> = { sourceId: details.sourceId, line: details.lineNumber }
    if (!isAppPage) data.page = url
    rendererLogger?.log(level, details.message, data)
  })
}

/**
 * 主进程 console（log/info/warn/error/debug/trace）→ procm room 结构化日志；
 * 应用窗口的渲染进程 console → 同一 room，clientName 为 renderer。
 * 需在 main.ts 中尽早调用，以捕获后续模块的输出。
 */
export function initProcmConsole(): void {
  if (!isProcmManaged()) return
  try {
    client = createProcmClientSafe('main')
    if (!client) return
    setupLogger({ client, clientName: 'main' })
    rendererLogger = createLogger({ client, clientName: 'renderer', console: stderrSink })
    app.on('web-contents-created', (_e, contents) => {
      if (contents.getType() === 'window') forwardRendererConsole(contents)
    })
  } catch (e) {
    console.warn('[procm] console 转发初始化失败，保持本地输出:', e)
  }
}

function createProcmClientSafe(clientName: string): ProcmClient | undefined {
  try {
    return createProcmClient({ clientName })
  } catch {
    return undefined
  }
}

/** 应用退出前关闭 room 连接 */
export function shutdownProcmConsole(): void {
  client?.close()
  client = undefined
  rendererLogger = undefined
}
