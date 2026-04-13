import { join } from 'path'
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { app } from 'electron'
import { pluginEventBus } from './plugin-event-bus'
import { PluginStorage } from './plugin-storage'
import { createPluginContext } from './plugin-context'
import type { PluginInfo, PluginMeta, PluginInstance } from './plugin-types'

class PluginManager {
  private plugins: Map<string, PluginInstance> = new Map()
  private disabledIds: Set<string> = new Set()
  private userDataPath: string
  private pluginsDir: string

  constructor() {
    this.userDataPath = app.getPath('userData')
    this.pluginsDir = join(this.userDataPath, 'plugins')
    this.loadDisabledList()
  }

  private loadDisabledList(): void {
    const filePath = join(this.userDataPath, 'plugin-data', 'disabled.json')
    try {
      if (existsSync(filePath)) {
        const ids: string[] = JSON.parse(readFileSync(filePath, 'utf-8'))
        this.disabledIds = new Set(ids)
      }
    } catch {
      this.disabledIds = new Set()
    }
  }

  private saveDisabledList(): void {
    const dir = join(this.userDataPath, 'plugin-data')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const filePath = join(dir, 'disabled.json')
    writeFileSync(filePath, JSON.stringify([...this.disabledIds], null, 2), 'utf-8')
  }

  /** 扫描并加载所有插件 */
  loadAll(): void {
    if (!existsSync(this.pluginsDir)) return
    const entries = readdirSync(this.pluginsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const pluginDir = join(this.pluginsDir, entry.name)
      try {
        this.load(pluginDir)
      } catch (err) {
        console.error(`[PluginManager] 加载插件失败: ${pluginDir}`, err)
      }
    }
  }

  /** 加载单个插件目录 */
  load(pluginDir: string): void {
    const infoPath = join(pluginDir, 'info.json')
    const mainPath = join(pluginDir, 'main.js')
    if (!existsSync(infoPath) || !existsSync(mainPath)) return

    const raw = readFileSync(infoPath, 'utf-8')
    const info: PluginInfo = JSON.parse(raw)

    if (!info.id || !info.name || !info.version || !info.description || !info.author?.name) {
      throw new Error(`插件 ${pluginDir} 的 info.json 缺少必需字段`)
    }

    if (this.plugins.has(info.id)) {
      console.warn(`[PluginManager] 插件 ${info.id} 已加载，跳过`)
      return
    }

    // 检查版本兼容性
    if (info.minAppVersion) {
      const appVersion = app.getVersion()
      if (appVersion < info.minAppVersion) {
        console.warn(
          `[PluginManager] 插件 ${info.name} 要求最低版本 ${info.minAppVersion}，当前 ${appVersion}`
        )
        return
      }
    }

    const storage = new PluginStorage(info.id, this.userDataPath)
    const context = createPluginContext(info, storage, pluginEventBus)
    const isDisabled = this.disabledIds.has(info.id)
    const pluginModule = require(mainPath)

    const instance: PluginInstance = {
      id: info.id,
      dir: pluginDir,
      info,
      enabled: !isDisabled,
      module: pluginModule,
      context,
      storage
    }

    this.plugins.set(info.id, instance)

    if (!isDisabled && typeof pluginModule.activate === 'function') {
      try {
        pluginModule.activate(context)
        console.log(`[PluginManager] 插件已激活: ${info.name} v${info.version}`)
      } catch (err) {
        console.error(`[PluginManager] 插件激活失败: ${info.name}`, err)
      }
    }
  }

  /** 卸载插件 */
  unload(pluginId: string): void {
    const instance = this.plugins.get(pluginId)
    if (!instance) return
    if (instance.enabled && typeof instance.module.deactivate === 'function') {
      try {
        instance.module.deactivate()
      } catch (err) {
        console.error(`[PluginManager] 插件停用失败: ${instance.info.name}`, err)
      }
    }
    pluginEventBus.removeAllListeners(`plugin:${pluginId}:**`)
    this.plugins.delete(pluginId)
    console.log(`[PluginManager] 插件已卸载: ${instance.info.name}`)
  }

  /** 启用插件 */
  enable(pluginId: string): void {
    const instance = this.plugins.get(pluginId)
    if (!instance || instance.enabled) return
    if (typeof instance.module.activate === 'function') {
      try {
        instance.module.activate(instance.context)
      } catch (err) {
        console.error(`[PluginManager] 插件激活失败: ${instance.info.name}`, err)
        return
      }
    }
    instance.enabled = true
    this.disabledIds.delete(pluginId)
    this.saveDisabledList()
  }

  /** 禁用插件 */
  disable(pluginId: string): void {
    const instance = this.plugins.get(pluginId)
    if (!instance || !instance.enabled) return
    if (typeof instance.module.deactivate === 'function') {
      try {
        instance.module.deactivate()
      } catch (err) {
        console.error(`[PluginManager] 插件停用失败: ${instance.info.name}`, err)
      }
    }
    pluginEventBus.removeAllListeners(`plugin:${pluginId}:**`)
    instance.enabled = false
    this.disabledIds.add(pluginId)
    this.saveDisabledList()
  }

  /** 获取所有插件元信息 */
  list(): PluginMeta[] {
    return Array.from(this.plugins.values()).map((instance) => ({
      id: instance.info.id,
      name: instance.info.name,
      version: instance.info.version,
      description: instance.info.description,
      author: instance.info.author,
      tags: instance.info.tags || [],
      hasView: instance.info.hasView || false,
      enabled: instance.enabled,
      iconPath: this.getIconPath(instance)
    }))
  }

  private getIconPath(instance: PluginInstance): string {
    const iconPath = join(instance.dir, 'icon.png')
    return existsSync(iconPath) ? iconPath : ''
  }

  getViewContent(pluginId: string): string | null {
    const instance = this.plugins.get(pluginId)
    if (!instance || !instance.info.hasView) return null
    const viewPath = join(instance.dir, 'view.js')
    if (!existsSync(viewPath)) return null
    try {
      return readFileSync(viewPath, 'utf-8')
    } catch {
      return null
    }
  }

  getIconBase64(pluginId: string): string | null {
    const instance = this.plugins.get(pluginId)
    if (!instance) return null
    const iconPath = join(instance.dir, 'icon.png')
    if (!existsSync(iconPath)) return null
    try {
      const buffer = readFileSync(iconPath)
      return `data:image/png;base64,${buffer.toString('base64')}`
    } catch {
      return null
    }
  }

  shutdown(): void {
    for (const [id] of this.plugins) {
      this.unload(id)
    }
  }
}

export const pluginManager = new PluginManager()
