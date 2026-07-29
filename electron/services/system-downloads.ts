/**
 * 系统下载跟踪服务 - 主进程
 *
 * 为 Electron 的 DownloadItem（系统下载器兜底路径，aria2 未启用或无法获取 URL 时使用）
 * 提供内存级任务管理，让 blob:/data:/空 URL 等 aria2 下不了的文件也能在下载列表里
 * 查看进度、速度、状态，与 aria2 任务统一展示。
 *
 * 不持久化：与 Electron DownloadItem 生命周期一致，重启后清空。
 */

import { BrowserWindow } from 'electron'
import type { DownloadItem } from 'electron'

/** 系统下载任务，字段对齐 store 侧的 DownloadTask（仅渲染需要的子集） */
export interface SystemDownloadTask {
  /** sys_ 前缀 + 自增 id，与 aria2 的 gid 区分 */
  gid: string
  url: string
  filename: string
  status: 'active' | 'paused' | 'error' | 'complete'
  totalLength: number
  completedLength: number
  downloadSpeed: number
  progress: number
  connections: number
  dir: string
  errorMessage?: string
}

/** 进度事件广播的事件名（遵循现有 `on:` 前缀约定） */
export const SYSTEM_DOWNLOAD_PROGRESS_EVENT = 'on:system-download:progress'

// ====== 任务存储 ======

let seq = 0
const tasks = new Map<string, SystemDownloadTask>()
/** 持有 DownloadItem 引用，用于取消等操作（不参与序列化） */
const items = new Map<string, DownloadItem>()
/** 任务结束时间，用于过期清理 */
const finishedAt = new Map<string, number>()

/** 广播节流：300ms 一次，避免 updated 事件高频触发淹没渲染进程 */
let broadcastScheduled = false
const BROADCAST_INTERVAL = 300

/** 把任务列表序列化为可发送给渲染进程的纯数据数组 */
function serializeTasks(): SystemDownloadTask[] {
  return Array.from(tasks.values()).map((t) => ({ ...t }))
}

/** 广播当前所有任务进度到渲染进程（节流） */
function scheduleBroadcast(): void {
  if (broadcastScheduled) return
  broadcastScheduled = true
  setTimeout(() => {
    broadcastScheduled = false
    const payload = serializeTasks()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(SYSTEM_DOWNLOAD_PROGRESS_EVENT, payload)
      }
    }
  }, BROADCAST_INTERVAL)
}

/** 立即广播（任务创建/结束等关键节点，不等节流） */
function broadcastNow(): void {
  const payload = serializeTasks()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(SYSTEM_DOWNLOAD_PROGRESS_EVENT, payload)
    }
  }
}

// ====== 跟踪入口 ======

/**
 * 跟踪一个 Electron DownloadItem，注册其 updated/done 事件。
 * 在 will-download 事件中 setSavePath 之后调用。
 */
export function trackDownload(item: DownloadItem): string {
  const gid = `sys_${++seq}`
  const filename = item.getFilename()
  const savePath = item.getSavePath()

  const task: SystemDownloadTask = {
    gid,
    url: item.getURL(),
    filename,
    status: 'active',
    totalLength: item.getTotalBytes(),
    completedLength: item.getReceivedBytes(),
    downloadSpeed: 0,
    progress: 0,
    connections: 1,
    dir: savePath ? savePath.replace(/[\\/][^\\/]+$/, '') : ''
  }

  // 计算初始进度
  updateProgress(task)
  tasks.set(gid, task)
  items.set(gid, item)

  let lastReceived = item.getReceivedBytes()
  let lastTime = Date.now()

  // 进度更新（节流广播）
  item.on('updated', (_event, state) => {
    const t = tasks.get(gid)
    if (!t) return

    const now = Date.now()
    const received = item.getReceivedBytes()
    // 基于时间差估算瞬时速度（平滑处理，避免跳变）
    const dt = now - lastTime
    if (dt > 0) {
      const rawSpeed = ((received - lastReceived) / dt) * 1000
      // EMA 平滑：新值权重 0.5，避免抖动过大
      t.downloadSpeed = t.downloadSpeed === 0
        ? rawSpeed
        : t.downloadSpeed * 0.5 + rawSpeed * 0.5
    }

    t.totalLength = item.getTotalBytes()
    t.completedLength = received
    updateProgress(t)
    lastReceived = received
    lastTime = now

    // 映射 Electron state → 任务状态
    if (state === 'progressing') {
      t.status = 'active'
    } else if (state === 'interrupted') {
      t.status = 'error'
      t.errorMessage = '下载中断'
      t.downloadSpeed = 0
    }

    scheduleBroadcast()
  })

  // 下载结束（成功或失败）
  item.once('done', (_event, state) => {
    const t = tasks.get(gid)
    if (!t) return

    if (state === 'completed') {
      t.status = 'complete'
      t.completedLength = t.totalLength || t.completedLength
      t.progress = 100
    } else {
      t.status = 'error'
      t.errorMessage = state === 'interrupted' ? '下载中断' : `下载失败（${state}）`
    }
    t.downloadSpeed = 0

    finishedAt.set(gid, Date.now())
    items.delete(gid) // 释放 item 引用，允许 GC
    broadcastNow()
  })

  broadcastNow()
  return gid
}

/** 根据已完成/总字节数计算进度百分比 */
function updateProgress(task: SystemDownloadTask): void {
  task.progress = task.totalLength > 0
    ? Math.min(100, (task.completedLength / task.totalLength) * 100)
    : 0
}

// ====== 查询与清理 ======

/** 获取所有系统下载任务（按创建时间倒序，新的在前） */
export function getTasks(): SystemDownloadTask[] {
  return serializeTasks().sort((a, b) => {
    const ai = parseInt(a.gid.replace('sys_', ''), 10)
    const bi = parseInt(b.gid.replace('sys_', ''), 10)
    return bi - ai
  })
}

/** 移除单个任务记录（不取消进行中的下载，仅清理列表显示） */
export function removeTask(gid: string): void {
  tasks.delete(gid)
  items.delete(gid)
  finishedAt.delete(gid)
  broadcastNow()
}

/** 清空所有已结束的任务（进行中的保留） */
export function clearFinished(): void {
  for (const [gid, t] of tasks) {
    if (t.status === 'complete' || t.status === 'error') {
      tasks.delete(gid)
      items.delete(gid)
      finishedAt.delete(gid)
    }
  }
  broadcastNow()
}

/** 清空全部任务记录 */
export function clearAll(): void {
  tasks.clear()
  items.clear()
  finishedAt.clear()
  broadcastNow()
}
