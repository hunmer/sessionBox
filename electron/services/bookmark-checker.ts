import { BrowserWindow } from 'electron'
import { net } from 'electron'
import { randomUUID } from 'node:crypto'
import Queue from 'queue'

// ====== 类型定义 ======

export interface CheckConfig {
  bookmarks: Array<{ id: string; url: string; title?: string }>
  maxRetries: number
  concurrency: number
  useProxy: boolean
  timeout: number
}

interface CheckResult {
  taskId: string
  bookmarkId: string
  status: 'valid' | 'invalid'
  statusCode?: number
  error?: string
  retries: number
  title?: string
  url?: string
}

interface DoneEvent {
  taskId: string
  total: number
  valid: number
  invalid: number
}

// ====== 活跃任务管理 ======

const activeTasks = new Map<string, { abortController: AbortController; queue: Queue }>()

// ====== 核心逻辑 ======

/**
 * 检查单个 URL 可达性
 * - HEAD 请求优先，失败降级 GET
 * - 2xx/3xx/4xx 视为有效（URL 可达）
 * - 超时/网络错误/DNS 失败 → 失效
 */
async function checkUrl(
  url: string,
  timeout: number,
  signal: AbortSignal,
  maxRetries: number
): Promise<Pick<CheckResult, 'status' | 'statusCode' | 'error' | 'retries'>> {
  let lastError = ''

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal.aborted) {
      return { status: 'invalid', error: '已取消', retries: attempt }
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      // 监听外部取消信号
      const onExternalAbort = (): void => controller.abort()
      signal.addEventListener('abort', onExternalAbort, { once: true })

      try {
        // 先尝试 HEAD
        let response: Electron.FetchResponse
        try {
          response = await net.fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            redirect: 'follow'
          })
        } catch {
          // HEAD 失败，降级 GET（某些服务器不支持 HEAD）
          if (signal.aborted) throw new Error('已取消')
          response = await net.fetch(url, {
            method: 'GET',
            signal: controller.signal,
            redirect: 'follow'
          })
        }

        const code = response.status

        if (code >= 200 && code < 500) {
          // 2xx/3xx → 有效，4xx → 有效（服务端可达，只是拒绝访问）
          return {
            status: 'valid',
            statusCode: code,
            retries: attempt
          }
        }

        // 5xx → 服务端错误，视为失效
        lastError = `HTTP ${code}`
      } finally {
        signal.removeEventListener('abort', onExternalAbort)
        clearTimeout(timeoutId)
      }
    } catch (err) {
      if (signal.aborted) {
        return { status: 'invalid', error: '已取消', retries: attempt }
      }
      lastError = err instanceof Error ? err.message : String(err)
    }

    // 重试前等待 1s（最后一次不等待）
    if (attempt < maxRetries) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1000)
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          resolve()
        }, { once: true })
      })
    }
  }

  return { status: 'invalid', error: lastError, retries: maxRetries }
}

/**
 * 启动书签健康检查任务
 */
export function startCheck(sender: Electron.WebContents, config: CheckConfig): string {
  const taskId = randomUUID()
  const abortController = new AbortController()

  const q = new Queue({ concurrency: config.concurrency, autostart: false })

  let valid = 0
  let invalid = 0
  let completed = 0
  const total = config.bookmarks.length

  for (const bookmark of config.bookmarks) {
    q.push(async (): Promise<void> => {
      if (abortController.signal.aborted) return

      const result = await checkUrl(
        bookmark.url,
        config.timeout,
        abortController.signal,
        config.maxRetries
      )

      if (abortController.signal.aborted) return

      if (result.status === 'valid') {
        valid++
      } else {
        invalid++
      }
      completed++

      const progressEvent: CheckResult = {
        taskId,
        bookmarkId: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        ...result
      }

      try {
        sender.send('on:bookmark-check:progress', progressEvent)
      } catch {
        // 窗口可能已关闭
      }
    })
  }

  q.addEventListener('end', () => {
    activeTasks.delete(taskId)

    const doneEvent: DoneEvent = { taskId, total, valid, invalid }
    try {
      sender.send('on:bookmark-check:done', doneEvent)
    } catch {
      // 窗口可能已关闭
    }
  })

  q.addEventListener('error', (event: any) => {
    console.error('[BookmarkChecker] queue error:', event.detail ?? event)
  })

  activeTasks.set(taskId, { abortController, queue: q })
  q.start()

  return taskId
}

/**
 * 取消检查任务
 */
export function cancelCheck(taskId: string): void {
  const task = activeTasks.get(taskId)
  if (!task) return

  task.abortController.abort()
  task.queue.stop()
  activeTasks.delete(taskId)
}
