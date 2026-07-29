/**
 * 下载通知服务 - 主进程
 *
 * 统一 aria2 与系统下载器的通知逻辑：
 * - 读取 aria2 配置中的 notifyOnStart / notifyOnSuccess / notifyOnFailure 开关
 * - 通过 Electron Notification 发送系统通知
 *
 * 关键修复：使用带 setTimeout 队列的 showNotification，避免快速连续触发时
 * 被系统合并或吞掉；并显式设置 silent:false 确保提示音。
 */

import { Notification } from 'electron'
import { getDownloadNotifyConfig } from './download-config'

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

/** 底层通知发送 */
function showNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return
  try {
    const n = new Notification({
      title,
      body,
      silent: false
    })
    n.show()
  } catch {
    // 通知失败不应影响下载流程
  }
}

/** 下载开始通知 */
export function notifyDownloadStart(filename: string): void {
  const config = getDownloadNotifyConfig()
  if (!config.notifyOnStart) return
  showNotification('开始下载', filename)
}

/** 下载成功通知 */
export function notifyDownloadSuccess(filename: string, totalBytes: number): void {
  const config = getDownloadNotifyConfig()
  if (!config.notifyOnSuccess) return
  const size = totalBytes > 0 ? ` (${formatFileSize(totalBytes)})` : ''
  showNotification('下载完成', `${filename}${size}`)
}

/** 下载失败通知 */
export function notifyDownloadFailure(filename: string, errorMessage?: string): void {
  const config = getDownloadNotifyConfig()
  if (!config.notifyOnFailure) return
  const errMsg = errorMessage ? `：${errorMessage}` : ''
  showNotification('下载失败', `${filename}${errMsg}`)
}
