import { app, BrowserWindow } from 'electron'
import { pluginEventBus } from './plugin-event-bus'
import { PluginStorage } from './plugin-storage'
import type { PluginContext, PluginInfo } from './plugin-types'
import { sessionService, startSessionApiServer, stopSessionApiServer } from './session-service'
import { getSessionApiSettings } from './store'
import { writePluginLog } from './plugin-log'
import { pluginGateway } from './plugin-gateway'

export function createPluginContext(
  pluginInfo: PluginInfo,
  storage: PluginStorage,
  eventBus: typeof pluginEventBus,
  getMainWindow: () => BrowserWindow | null
): { context: PluginContext; cleanupEvents: () => void } {
  const prefix = `plugin:${pluginInfo.id}:`

  const log = (level: string, msg: string, args: any[]) => {
    try {
      writePluginLog(app.getPath('userData'), pluginInfo.id, level, msg, ...args)
    } catch (error) {
      console.error(`[Plugin:${pluginInfo.name}] 日志写入失败`, error)
    }
  }

  // 追踪所有通过 context.events 注册的监听器，卸载时逐一移除
  const registeredHandlers: Array<{ event: string; handler: (...args: any[]) => void }> = []

  const context: PluginContext = {
    session: sessionService,
    sessionServer: { start: () => { const config = getSessionApiSettings(); startSessionApiServer(config.port, config.token); return config }, stop: stopSessionApiServer },
    gateway: {
      register: (port: number) => pluginGateway.register(pluginInfo.id, port),
      unregister: () => pluginGateway.unregister(pluginInfo.id)
    },
    events: {
      on(event: string, handler: (...args: any[]) => void): void {
        registeredHandlers.push({ event, handler })
        eventBus.on(event, handler)
      },
      once(event: string, handler: (...args: any[]) => void): void {
        registeredHandlers.push({ event, handler })
        eventBus.once(event, handler)
      },
      off(event: string, handler: (...args: any[]) => void): void {
        const idx = registeredHandlers.findIndex((h) => h.event === event && h.handler === handler)
        if (idx !== -1) registeredHandlers.splice(idx, 1)
        eventBus.off(event, handler)
      },
      emit(event: string, ...args: any[]): void {
        // 插件间通信：其他插件通过 plugin:{pluginId}:{event} 监听
        eventBus.emit(prefix + event, ...args)
      }
    },

    storage: {
      get: (key: string) => storage.get(key),
      set: (key: string, value: any) => storage.set(key, value),
      delete: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      keys: () => storage.keys()
    },

    plugin: pluginInfo,

    logger: {
      info(msg: string, ...args: any[]): void {
        log('INFO', msg, args)
        console.log(`[Plugin:${pluginInfo.name}] ${msg}`, ...args)
      },
      warn(msg: string, ...args: any[]): void {
        log('WARN', msg, args)
        console.warn(`[Plugin:${pluginInfo.name}] ${msg}`, ...args)
      },
      error(msg: string, ...args: any[]): void {
        log('ERROR', msg, args)
        console.error(`[Plugin:${pluginInfo.name}] ${msg}`, ...args)
      }
    },

    sendToRenderer(channel: string, ...args: any[]): void {
      const win = getMainWindow()
      if (!win || win.isDestroyed()) return
      win.webContents.send(channel, ...args)
    }
  }

  const cleanupEvents = () => {
    for (const { event, handler } of registeredHandlers) {
      eventBus.off(event, handler)
    }
    registeredHandlers.length = 0
  }

  return { context, cleanupEvents }
}
