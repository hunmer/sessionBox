/**
 * 下载配置访问 - 共享给 aria2 与通知模块，避免循环依赖
 *
 * 通知开关（notifyOnStart / notifyOnSuccess / notifyOnFailure）只读访问器。
 */

// 仅复用 aria2 的 Aria2Config 类型，不引入运行时依赖
import type { Aria2Config } from './aria2'

/**
 * 读取当前下载通知配置。
 * 通过动态 require 避免 aria2 ↔ download-notify 的循环依赖：
 * aria2.ts 的 getConfig 在模块初始化后才可用，这里延迟到调用时解析。
 */
export function getDownloadNotifyConfig(): Pick<
  Aria2Config,
  'notifyOnStart' | 'notifyOnSuccess' | 'notifyOnFailure'
> {
  // 延迟 require：函数调用时 aria2 模块已完全初始化
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const aria2 = require('./aria2') as typeof import('./aria2')
  return aria2.getAria2Config()
}
