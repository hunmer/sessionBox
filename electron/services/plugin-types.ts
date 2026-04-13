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
}
