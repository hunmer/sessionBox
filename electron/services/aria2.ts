/**
 * Aria2 下载服务 - 主进程
 * 管理 aria2c 进程、RPC 通信、下载任务
 */

import { spawn, ChildProcess } from 'child_process'
import Store from 'electron-store'
import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

// ====== 类型定义 ======

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
  notifyOnStart: boolean
  notifyOnSuccess: boolean
  notifyOnFailure: boolean
}

export interface Aria2TaskInfo {
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

// ====== 内置 aria2c 路径 ======

/** 获取内置 aria2c 可执行文件路径 */
function getBundledAria2Path(): string {
  const isMac = process.platform === 'darwin'
  // macOS 上使用系统安装的 aria2c
  if (isMac) return 'aria2c'

  const devPath = join(app.getAppPath(), 'win_packages', 'aria2', 'aria2c.exe')
  const prodPath = join(process.resourcesPath, 'win_packages', 'aria2', 'aria2c.exe')
  return existsSync(devPath) ? devPath : prodPath
}

/** 获取默认下载目录 */
function getDefaultDownloadDir(): string {
  return app.getPath('downloads')
}

// ====== 默认配置 ======

const DEFAULT_CONFIG: Aria2Config = {
  host: 'localhost',
  port: 6800,
  secret: 'sessionbox_aria2',
  aria2Path: 'aria2c',
  downloadDir: '',
  maxConcurrentDownloads: 5,
  maxConnections: 16,
  splitConnections: 5,
  checkCertificate: false,
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  autoStart: false,
  alwaysAsk: false,
  notifyOnStart: false,
  notifyOnSuccess: false,
  notifyOnFailure: false
}

// ====== 配置持久化 ======

const configStore = new Store<{ aria2Config: Aria2Config }>({
  defaults: { aria2Config: DEFAULT_CONFIG }
})

function getConfig(): Aria2Config {
  const saved = configStore.get('aria2Config')
  const config = { ...DEFAULT_CONFIG, ...saved }

  // 自动设置内置 aria2c 路径（仅在用户未自定义时）
  if (!saved?.aria2Path || saved.aria2Path === 'aria2c') {
    config.aria2Path = getBundledAria2Path()
  }

  // 默认下载目录
  if (!config.downloadDir) {
    config.downloadDir = getDefaultDownloadDir()
  }

  return config
}

function saveConfig(config: Partial<Aria2Config>): void {
  const current = getConfig()
  configStore.set('aria2Config', { ...current, ...config })
}

// ====== RPC 通信 ======

let rpcId = 0

async function sendRPC(method: string, params: unknown[] = []): Promise<any> {
  const config = getConfig()
  const url = `http://${config.host}:${config.port}/jsonrpc`
  const id = ++rpcId

  const body = {
    jsonrpc: '2.0',
    id,
    method,
    params: config.secret ? [`token:${config.secret}`, ...params] : params
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  const data = await resp.json()
  if (data.error) throw new Error(`RPC Error: ${data.error.message}`)
  return data.result
}

// ====== 任务状态解析 ======

function parseTaskInfo(raw: any): Aria2TaskInfo {
  const totalLength = parseInt(raw.totalLength) || 0
  const completedLength = parseInt(raw.completedLength) || 0
  const downloadSpeed = parseInt(raw.downloadSpeed) || 0
  const progress = totalLength > 0 ? (completedLength / totalLength) * 100 : 0

  // 从 bittorrent 或 files 中提取文件名
  let filename = ''
  if (raw.bittorrent?.info?.name) {
    filename = raw.bittorrent.info.name
  } else if (raw.files?.length > 0) {
    const path = raw.files[0].path
    if (path) {
      filename = path.split(/[\\/]/).pop() || path
    } else {
      // 从 URI 中提取
      const uri = raw.files[0].uris?.[0]?.uri || ''
      try {
        filename = decodeURIComponent(new URL(uri).pathname.split('/').pop() || '')
      } catch {
        filename = uri.split('/').pop() || ''
      }
    }
  }

  return {
    gid: raw.gid,
    url: raw.files?.[0]?.uris?.[0]?.uri || '',
    filename,
    status: raw.status,
    totalLength,
    completedLength,
    downloadSpeed,
    progress: Math.round(progress * 100) / 100,
    connections: parseInt(raw.connections) || 0,
    dir: raw.dir || '',
    errorMessage: raw.errorMessage
  }
}

// ====== 进程管理 ======

let aria2Process: ChildProcess | null = null

/** 构建 aria2c 启动参数 */
function buildArgs(config: Aria2Config): string[] {
  const downloadDir = config.downloadDir || app.getPath('downloads')
  return [
    '--enable-rpc',
    '--rpc-listen-all=false',
    `--rpc-listen-port=${config.port}`,
    `--rpc-secret=${config.secret}`,
    `--dir=${downloadDir}`,
    `--max-concurrent-downloads=${config.maxConcurrentDownloads}`,
    `--max-connection-per-server=${config.maxConnections}`,
    `--min-split-size=1M`,
    `--split=${config.splitConnections}`,
    '--continue=true',
    '--max-tries=3',
    '--retry-wait=30',
    '--timeout=60',
    '--connect-timeout=30',
    `--user-agent=${config.userAgent}`,
    `--check-certificate=${config.checkCertificate}`,
    '--auto-file-renaming=true',
    '--allow-overwrite=false',
    '--disk-cache=32M',
    '--file-allocation=prealloc',
    '--log-level=warn',
    '--daemon=true'
  ]
}

/** 启动 aria2 进程 */
async function startProcess(): Promise<boolean> {
  const config = getConfig()

  // 先检查是否已在运行
  if (await checkConnection()) return true

  return new Promise((resolve) => {
    try {
      const args = buildArgs(config)
      aria2Process = spawn(config.aria2Path, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })
      aria2Process.unref()

      // 等待 aria2 启动
      setTimeout(async () => {
        const connected = await checkConnection()
        resolve(connected)
      }, 2000)
    } catch (e) {
      console.error('[Aria2] 启动失败:', e)
      resolve(false)
    }
  })
}

/** 停止 aria2 进程 */
async function stopProcess(): Promise<void> {
  try {
    if (await checkConnection()) {
      await sendRPC('aria2.shutdown')
    }
  } catch {
    // 忽略
  }
  aria2Process = null
}

// ====== 对外 API ======

/** 检查 aria2 连接状态 */
export async function checkConnection(): Promise<boolean> {
  try {
    await sendRPC('aria2.getVersion')
    return true
  } catch {
    return false
  }
}

/** 获取当前配置 */
export function getAria2Config(): Aria2Config {
  return getConfig()
}

/** 更新配置 */
export function updateAria2Config(config: Partial<Aria2Config>): Aria2Config {
  saveConfig(config)
  return getConfig()
}

/** 启动 aria2 服务 */
export async function startAria2(): Promise<boolean> {
  return startProcess()
}

/** 停止 aria2 服务 */
export async function stopAria2(): Promise<void> {
  await stopProcess()
}

/** 添加下载任务（从 webview 下载拦截调用） */
export async function addDownload(
  url: string,
  options: {
    filename?: string
    dir?: string
    headers?: string[]
    cookies?: string
    referer?: string
  } = {}
): Promise<string> {
  const downloadOpts: Record<string, unknown> = {}
  if (options.dir) downloadOpts.dir = options.dir
  if (options.filename) downloadOpts.out = options.filename
  if (options.headers?.length) downloadOpts.header = options.headers
  if (options.cookies) downloadOpts.cookie = options.cookies
  if (options.referer) downloadOpts.referer = options.referer

  const gid = await sendRPC('aria2.addUri', [[url], downloadOpts])
  return gid
}

/** 暂停下载 */
export async function pauseDownload(gid: string): Promise<void> {
  await sendRPC('aria2.pause', [gid])
}

/** 恢复下载 */
export async function resumeDownload(gid: string): Promise<void> {
  await sendRPC('aria2.unpause', [gid])
}

/** 移除下载任务 */
export async function removeDownload(gid: string): Promise<void> {
  try {
    await sendRPC('aria2.remove', [gid])
  } catch {
    // 可能已完成，尝试移除结果
    await sendRPC('aria2.removeDownloadResult', [gid])
  }
}

/** 获取所有活跃任务 */
export async function getActiveTasks(): Promise<Aria2TaskInfo[]> {
  const results = await sendRPC('aria2.tellActive', [
    ['gid', 'status', 'totalLength', 'completedLength', 'downloadSpeed', 'connections', 'dir', 'errorMessage', 'files', 'bittorrent']
  ])
  return (results || []).map(parseTaskInfo)
}

/** 获取等待中的任务 */
export async function getWaitingTasks(): Promise<Aria2TaskInfo[]> {
  const results = await sendRPC('aria2.tellWaiting', [0, 100, ['gid', 'status', 'totalLength', 'completedLength', 'downloadSpeed', 'connections', 'dir', 'errorMessage', 'files', 'bittorrent']])
  return (results || []).map(parseTaskInfo)
}

/** 获取已停止的任务 */
export async function getStoppedTasks(): Promise<Aria2TaskInfo[]> {
  const results = await sendRPC('aria2.tellStopped', [0, 100, ['gid', 'status', 'totalLength', 'completedLength', 'downloadSpeed', 'connections', 'dir', 'errorMessage', 'files', 'bittorrent']])
  return (results || []).map(parseTaskInfo)
}

/** 获取全局统计 */
export async function getGlobalStat(): Promise<{
  downloadSpeed: number
  uploadSpeed: number
  numActive: number
  numWaiting: number
  numStopped: number
}> {
  const stat = await sendRPC('aria2.getGlobalStat')
  return {
    downloadSpeed: parseInt(stat.downloadSpeed) || 0,
    uploadSpeed: parseInt(stat.uploadSpeed) || 0,
    numActive: parseInt(stat.numActive) || 0,
    numWaiting: parseInt(stat.numWaiting) || 0,
    numStopped: parseInt(stat.numStopped) || 0
  }
}

/** 清除已完成/出错的任务记录 */
export async function purgeDownloadResult(): Promise<void> {
  await sendRPC('aria2.purgeDownloadResult')
}
