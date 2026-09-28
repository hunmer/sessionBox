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
  defaultBehavior?: { type: 'browserWindow'; url: string }
}

/** 插件展示信息（传递给渲染进程） */
export interface PluginMeta {
  id: string
  name: string
  version: string
  description: string
  author: { name: string; email?: string; url?: string }
  tags: string[]
  hasView: boolean
  enabled: boolean
  iconPath: string
  defaultBehavior?: PluginInfo['defaultBehavior']
}

/** 在线插件商店条目 */
export interface RemotePlugin {
  id: string
  name: string
  version: string
  description: string
  author: { name: string; email?: string; url?: string }
  tags: string[]
  hasView: boolean
  downloadUrl: string
  iconUrl?: string
  defaultBehavior?: PluginInfo['defaultBehavior']
}

/** 插件运行时实例 */
export interface PluginInstance {
  id: string
  dir: string
  info: PluginInfo
  enabled: boolean
  module: any
  context: PluginContext
  storage: any
}

/** 插件上下文 API */
export interface PluginContext {
  session: {
    getCookies(pageId: string, url?: string): Promise<any[]>
    openPage(pageId: string, url: string): Promise<{ pageId: string; url: string }>
    execute(pageId: string, code: string): Promise<unknown>
  }
  sessionServer: { start(): { port: number; token: string }; stop(): void }
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
