import { BrowserWindow } from 'electron'
import { pluginEventBus } from './plugin-event-bus'
import { PluginStorage } from './plugin-storage'
import type { PluginContext, PluginInfo } from './plugin-types'

export function createPluginContext(
  pluginInfo: PluginInfo,
  storage: PluginStorage,
  eventBus: typeof pluginEventBus,
  getMainWindow: () => BrowserWindow | null
): PluginContext {
  const prefix = `plugin:${pluginInfo.id}:`

  return {
    events: {
      on(event: string, handler: (...args: any[]) => void): void {
        eventBus.on(event, handler)
      },
      once(event: string, handler: (...args: any[]) => void): void {
        eventBus.once(event, handler)
      },
      off(event: string, handler: (...args: any[]) => void): void {
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
        console.log(`[Plugin:${pluginInfo.name}] ${msg}`, ...args)
      },
      warn(msg: string, ...args: any[]): void {
        console.warn(`[Plugin:${pluginInfo.name}] ${msg}`, ...args)
      },
      error(msg: string, ...args: any[]): void {
        console.error(`[Plugin:${pluginInfo.name}] ${msg}`, ...args)
      }
    },

    sendToRenderer(channel: string, ...args: any[]): void {
      const win = getMainWindow()
      if (!win || win.isDestroyed()) return
      win.webContents.send(channel, ...args)
    }
  }
}
