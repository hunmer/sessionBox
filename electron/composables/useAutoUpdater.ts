import { autoUpdater } from 'electron-updater'
import { BrowserWindow, app } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import {
  getActiveUpdateSource,
  type UpdateSource
} from '../services/store'

let mainWindow: BrowserWindow | null = null

/**
 * 自动更新模块
 * 提供应用自动检查、下载和安装更新的功能
 */
export function useAutoUpdater() {
  // 配置自动更新服务器地址
  autoUpdater.autoDownload = false // 不自动下载，由用户确认
  autoUpdater.autoInstallOnAppQuit = true // 退出时自动安装

  /**
   * 设置主窗口引用，用于发送更新事件到渲染进程
   */
  const setMainWindow = (win: BrowserWindow) => {
    mainWindow = win
  }

  /**
   * 发送更新事件到渲染进程
   */
  const sendToRenderer = (channel: string, data?: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data)
    }
  }

  /**
   * 根据更新源配置设置 autoUpdater 的 feed URL
   */
  const applyUpdateSource = (source: UpdateSource): void => {
    if (source.type === 'github' && source.owner && source.repo) {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: source.owner,
        repo: source.repo
      })
      console.log(`[AutoUpdater] 更新源设为 GitHub: ${source.owner}/${source.repo}`)
    } else if (source.type === 'generic' && source.url) {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: source.url
      })
      console.log(`[AutoUpdater] 更新源设为 Generic: ${source.url}`)
    } else {
      console.warn('[AutoUpdater] 无效的更新源配置:', source)
    }
  }

  /**
   * 初始化更新源（启动时调用）
   */
  const initUpdateSource = (): void => {
    const source = getActiveUpdateSource()
    if (source) {
      applyUpdateSource(source)
    }
  }

  // 检查更新失败
  autoUpdater.on('error', (error) => {
    console.error('[AutoUpdater] 更新错误:', error)
    sendToRenderer('update:error', {
      message: error.message || '检查更新失败'
    })
  })

  // 检查更新中
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] 正在检查更新...')
    sendToRenderer('update:checking')
  })

  // 发现新版本
  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] 发现新版本:', info.version)
    sendToRenderer('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    })
  })

  // 当前已是最新版本
  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] 当前已是最新版本')
    sendToRenderer('update:not-available', {
      version: info.version
    })
  })

  // 下载进度
  autoUpdater.on('download-progress', (progressInfo) => {
    const progress = {
      percent: progressInfo.percent,
      transferred: progressInfo.transferred,
      total: progressInfo.total,
      bytesPerSecond: progressInfo.bytesPerSecond
    }
    console.log(`[AutoUpdater] 下载进度: ${progress.percent.toFixed(1)}%`)
    sendToRenderer('update:download-progress', progress)
  })

  // 下载完成
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] 更新下载完成:', info.version)
    sendToRenderer('update:downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    })
  })

  /**
   * 检查更新（先应用当前激活的更新源）
   */
  const checkForUpdates = async () => {
    try {
      // 每次检查前刷新更新源配置
      const source = getActiveUpdateSource()
      if (source) {
        applyUpdateSource(source)
      }

      const result = await autoUpdater.checkForUpdates()
      return {
        success: true,
        updateInfo: result?.updateInfo ? {
          version: result.updateInfo.version,
          releaseDate: result.updateInfo.releaseDate,
          releaseNotes: result.updateInfo.releaseNotes
        } : null
      }
    } catch (error: unknown) {
      console.error('[AutoUpdater] 检查更新失败:', error)
      return {
        success: false,
        error: (error as Error).message || '检查更新失败'
      }
    }
  }

  /**
   * 下载更新
   */
  const downloadUpdate = async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error: unknown) {
      console.error('[AutoUpdater] 下载更新失败:', error)
      return {
        success: false,
        error: (error as Error).message || '下载更新失败'
      }
    }
  }

  /**
   * 安装更新并重启
   * @param isSilent 是否静默安装（不提示用户）
   */
  const quitAndInstall = (isSilent = false) => {
    autoUpdater.quitAndInstall(isSilent, true)
  }

  /**
   * 获取当前版本
   */
  const getCurrentVersion = () => {
    return app.getVersion()
  }

  /**
   * 获取更新信息（从本地 latest.yml 读取，如果存在）
   */
  const getUpdateInfo = () => {
    try {
      const latestYmlPath = join(app.getAppPath(), 'latest.yml')
      const content = readFileSync(latestYmlPath, 'utf-8')
      // 简单解析 YAML 获取版本
      const versionMatch = content.match(/version:\s*(.+)/)
      return {
        success: true,
        version: versionMatch ? versionMatch[1].trim() : null
      }
    } catch {
      return {
        success: false,
        version: null
      }
    }
  }

  return {
    setMainWindow,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    getCurrentVersion,
    getUpdateInfo,
    initUpdateSource,
    applyUpdateSource
  }
}

// 导出单例实例的函数
let autoUpdaterInstance: ReturnType<typeof useAutoUpdater> | null = null

export function getAutoUpdater() {
  if (!autoUpdaterInstance) {
    autoUpdaterInstance = useAutoUpdater()
  }
  return autoUpdaterInstance
}
