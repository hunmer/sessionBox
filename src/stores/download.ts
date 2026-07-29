import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'

const api = window.api

export interface DownloadTask {
  gid: string
  url: string
  filename: string
  status: 'waiting' | 'active' | 'paused' | 'error' | 'complete' | 'removed'
  totalLength: number
  completedLength: number
  downloadSpeed: number
  progress: number
  connections: number
  dir: string
  errorMessage?: string
}

export interface DownloadGlobalStat {
  downloadSpeed: number
  uploadSpeed: number
  numActive: number
  numWaiting: number
  numStopped: number
}

export interface Aria2Config {
  host: string
  port: number
  secret: string
  aria2Path: string
  downloadDir: string
  maxConcurrentDownloads: number
  maxConnections: number
  splitConnections: number
  checkCertificate: boolean
  userAgent: string
  autoStart: boolean
  alwaysAsk: boolean
  defaultCategory: string
  notifyOnStart: boolean
  notifyOnSuccess: boolean
  notifyOnFailure: boolean
}

export const useDownloadStore = defineStore('download', () => {
  const connected = ref(false)
  const config = ref<Aria2Config | null>(null)
  const activeTasks = ref<DownloadTask[]>([])
  const waitingTasks = ref<DownloadTask[]>([])
  const stoppedTasks = ref<DownloadTask[]>([])
  /** 系统下载器任务（Electron DownloadItem 兜底路径），与 aria2 任务统一展示 */
  const systemTasks = ref<DownloadTask[]>([])
  const globalStat = ref<DownloadGlobalStat | null>(null)
  const loading = ref(false)

  const allTasks = computed(() => [
    ...activeTasks.value,
    ...waitingTasks.value,
    ...stoppedTasks.value,
    ...systemTasks.value
  ])

  /** 刷新所有任务列表 */
  async function refreshTasks() {
    loading.value = true
    try {
      const [active, waiting, stopped] = await Promise.all([
        api.download.listActive(),
        api.download.listWaiting(),
        api.download.listStopped()
      ])
      activeTasks.value = active
      waitingTasks.value = waiting
      stoppedTasks.value = stopped
    } catch {
      // aria2 不可用
    } finally {
      loading.value = false
    }
  }

  /** 刷新全局统计 */
  async function refreshStat() {
    try {
      globalStat.value = await api.download.globalStat()
    } catch {
      // ignore
    }
  }

  /** 刷新系统下载器任务（Electron DownloadItem 兜底路径） */
  async function refreshSystemTasks() {
    try {
      systemTasks.value = await api.download.listSystem()
    } catch {
      // 主进程未就绪
    }
  }

  /** 判断 gid 是否为系统下载任务（sys_ 前缀） */
  function isSystemTask(gid: string): boolean {
    return gid.startsWith('sys_')
  }

  /** 检查连接状态 */
  async function checkConnection() {
    connected.value = await api.download.checkConnection()
    return connected.value
  }

  /** 加载配置 */
  async function loadConfig() {
    config.value = await api.download.getConfig()
  }

  /** 保存配置 */
  async function saveConfig(data: Partial<Aria2Config>) {
    config.value = await api.download.updateConfig(toRaw(data) as Partial<Aria2Config>)
  }

  /** 启动 aria2 */
  async function start() {
    const ok = await api.download.start()
    if (ok) connected.value = true
    return ok
  }

  /** 停止 aria2 */
  async function stop() {
    await api.download.stop()
    connected.value = false
    globalStat.value = null
  }

  /** 暂停任务 */
  async function pause(gid: string) {
    await api.download.pause(gid)
    await refreshTasks()
  }

  /** 恢复任务 */
  async function resume(gid: string) {
    await api.download.resume(gid)
    await refreshTasks()
  }

  /** 移除任务（自动路由 aria2 / 系统下载器） */
  async function remove(gid: string) {
    if (isSystemTask(gid)) {
      await api.download.removeSystem(gid)
      await refreshSystemTasks()
      return
    }
    await api.download.remove(gid)
    await refreshTasks()
  }

  /** 清除已完成/出错的记录（aria2 与系统下载器一并清理） */
  async function purge() {
    await api.download.purge()
    await api.download.clearSystemFinished()
    await Promise.all([refreshTasks(), refreshSystemTasks()])
  }

  /** 重试失败的任务：仅 aria2 任务可重试（系统下载器为 Electron DownloadItem，无法重放） */
  async function retry(task: DownloadTask) {
    if (isSystemTask(task.gid)) return
    await remove(task.gid)
    await api.download.add(task.url, {
      filename: task.filename || undefined,
      dir: task.dir || undefined
    })
    await refreshTasks()
  }

  /** 取消系统下载进度订阅（重新初始化或 store 卸载时调用，避免重复订阅） */
  let unsubscribeSystemProgress: (() => void) | null = null

  /** 初始化：加载配置、检查连接、拉取任务列表、订阅系统下载进度推送 */
  async function init() {
    // 避免重复 init 导致多次订阅进度推送
    if (unsubscribeSystemProgress) {
      unsubscribeSystemProgress()
      unsubscribeSystemProgress = null
    }

    await loadConfig()
    await checkConnection()

    // 订阅系统下载进度推送（主进程节流 300ms），实时同步 systemTasks
    unsubscribeSystemProgress = api.download.onDownloadProgress((tasks) => {
      systemTasks.value = tasks
    })

    // 系统下载任务不依赖 aria2 连接，始终拉取
    await refreshSystemTasks()

    if (connected.value) {
      await Promise.all([refreshTasks(), refreshStat()])
    }
  }

  /** 取消系统下载进度订阅（store 卸载或重新初始化时调用） */
  function dispose() {
    if (unsubscribeSystemProgress) {
      unsubscribeSystemProgress()
      unsubscribeSystemProgress = null
    }
  }

  /**
   * 下载状态摘要：聚合 aria2 + 系统下载器的活跃/待下载/失败数量、
   * 当前总传输速度、总体下载百分比。供侧边栏等紧凑 UI 使用。
   */
  const downloadSummary = computed(() => {
    const tasks = allTasks.value
    let active = 0
    let waiting = 0
    let error = 0
    let totalCompleted = 0
    let totalLength = 0
    let totalSpeed = 0

    for (const t of tasks) {
      if (t.status === 'active') {
        active++
        totalSpeed += t.downloadSpeed || 0
      } else if (t.status === 'waiting' || t.status === 'paused') {
        waiting++
      } else if (t.status === 'error') {
        error++
      }

      // 进度统计：包含 active/waiting/paused（有进度信息），complete 算 100%
      if (t.status === 'active' || t.status === 'waiting' || t.status === 'paused' || t.status === 'complete') {
        totalCompleted += t.completedLength || 0
        totalLength += t.totalLength || 0
      }
    }

    // 总体百分比：基于所有有进度信息的任务的字节加权
    const progress = totalLength > 0
      ? Math.min(100, (totalCompleted / totalLength) * 100)
      : (active + waiting > 0 ? 0 : 0)

    return { active, waiting, error, totalSpeed, progress }
  })

  return {
    connected,
    config,
    activeTasks,
    waitingTasks,
    stoppedTasks,
    systemTasks,
    globalStat,
    loading,
    allTasks,
    downloadSummary,
    isSystemTask,
    refreshTasks,
    refreshStat,
    refreshSystemTasks,
    checkConnection,
    loadConfig,
    saveConfig,
    start,
    stop,
    pause,
    resume,
    remove,
    purge,
    retry,
    init,
    dispose
  }
})
