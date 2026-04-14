/**
 * 插件类型定义（主进程使用）
 * 与 src/types/plugin.ts 保持同步
 */

/** 插件元信息（info.json 内容） */
export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  author: {
    name: string
    email?: string
    url?: string
  }
  tags?: string[]
  minAppVersion?: string
  hasView?: boolean
}

/** 插件运行时实例 */
export interface PluginInstance {
  id: string
  dir: string
  info: PluginInfo
  enabled: boolean
  module: any
  context: PluginContext
  storage: import('./plugin-storage').PluginStorage
  /** 清理该插件注册的所有事件监听器 */
  cleanupEvents: () => void
}

/** 插件列表展示用的元信息 */
export interface PluginMeta {
  id: string
  name: string
  version: string
  description: string
  author: PluginInfo['author']
  tags: string[]
  hasView: boolean
  enabled: boolean
  iconPath: string
}

/** 插件上下文 API */
export interface PluginContext {
  events: {
    on(event: string, handler: (...args: any[]) => void): void
    once(event: string, handler: (...args: any[]) => void): void
    off(event: string, handler: (...args: any[]) => void): void
    emit(event: string, ...args: any[]): void
  }
  storage: {
    get(key: string): Promise<any>
    set(key: string, value: any): Promise<void>
    delete(key: string): Promise<void>
    clear(): Promise<void>
    keys(): Promise<string[]>
  }
  plugin: PluginInfo
  logger: {
    info(msg: string, ...args: any[]): void
    warn(msg: string, ...args: any[]): void
    error(msg: string, ...args: any[]): void
  }
  /** 向渲染进程发送消息（通过 mainWindow.webContents.send） */
  sendToRenderer(channel: string, ...args: any[]): void
}
