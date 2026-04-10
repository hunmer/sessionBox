import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

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
}

export const useDownloadStore = defineStore('download', () => {
  const connected = ref(false)
  const config = ref<Aria2Config | null>(null)
  const activeTasks = ref<DownloadTask[]>([])
  const waitingTasks = ref<DownloadTask[]>([])
  const stoppedTasks = ref<DownloadTask[]>([])
  const globalStat = ref<DownloadGlobalStat | null>(null)
  const loading = ref(false)

  const allTasks = computed(() => [
    ...activeTasks.value,
    ...waitingTasks.value,
    ...stoppedTasks.value
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
    config.value = await api.download.updateConfig(data)
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

  /** 移除任务 */
  async function remove(gid: string) {
    await api.download.remove(gid)
    await refreshTasks()
  }

  /** 清除已完成/出错的记录 */
  async function purge() {
    await api.download.purge()
    await refreshTasks()
  }

  /** 初始化：加载配置、检查连接、拉取任务列表 */
  async function init() {
    await loadConfig()
    await checkConnection()
    if (connected.value) {
      await Promise.all([refreshTasks(), refreshStat()])
    }
  }

  return {
    connected,
    config,
    activeTasks,
    waitingTasks,
    stoppedTasks,
    globalStat,
    loading,
    allTasks,
    refreshTasks,
    refreshStat,
    checkConnection,
    loadConfig,
    saveConfig,
    start,
    stop,
    pause,
    resume,
    remove,
    purge,
    init
  }
})
