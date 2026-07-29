/**
 * 下载通知服务 - 主进程
 *
 * 统一 aria2 与系统下载器的通知逻辑：
 * - 读取 aria2 配置中的 notifyOnStart / notifyOnSuccess / notifyOnFailure 开关
 * - 通过 Electron Notification 发送系统通知
 *
 * 注意：与 aria2.ts 存在循环引用（aria2.ts 引入本模块，本模块引入 getAria2Config）。
 * 这是安全的：getAria2Config 仅在 notify 函数体内被调用（运行时），而非模块顶层，
 * ESM 循环依赖在函数调用时能正确解析（aria2 模块此时已完全初始化）。
 * 绝不能用运行时 require('./aria2') —— electron-vite 打包后模块合并为单个 bundle，
 * require 路径 './aria2' 无法解析会导致 "Cannot find module './aria2'" 崩溃。
 */

import { Notification } from 'electron'
import { getAria2Config } from './aria2'

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
  if (!getAria2Config().notifyOnStart) return
  showNotification('开始下载', filename)
}

/** 下载成功通知 */
export function notifyDownloadSuccess(filename: string, totalBytes: number): void {
  if (!getAria2Config().notifyOnSuccess) return
  const size = totalBytes > 0 ? ` (${formatFileSize(totalBytes)})` : ''
  showNotification('下载完成', `${filename}${size}`)
}

/** 下载失败通知 */
export function notifyDownloadFailure(filename: string, errorMessage?: string): void {
  if (!getAria2Config().notifyOnFailure) return
  const errMsg = errorMessage ? `：${errorMessage}` : ''
  showNotification('下载失败', `${filename}${errMsg}`)
}
