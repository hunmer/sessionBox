import { app, BrowserWindow, dialog, ipcMain, net } from 'electron'
import AdmZip from 'adm-zip'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, normalize, relative } from 'node:path'
import {
  createExtension,
  deleteExtension,
  listExtensions,
  type Extension,
  updateExtension
} from '../services/store'
import {
  completeRendererTabCreate,
  getLoadedExtensionIds,
  loadExtensionForAllContainers,
  openExtensionBrowserActionPopup,
  unloadExtensionFromAllContainers
} from '../services/extensions'
import { url } from 'node:inspector'

/**
 * 从扩展目录的 manifest.json 读取图标路径，返回绝对路径。
 * 优先选择 48px 图标，回退到最大可用尺寸。
 */
function readExtensionIcon(extensionPath: string): string | undefined {
  const manifestPath = join(extensionPath, 'manifest.json')
  if (!existsSync(manifestPath)) return undefined

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
      icons?: Record<string, string>
    }
    const icons = manifest.icons
    if (!icons) return undefined

    // 优先 48，然后 128、32、16
    for (const size of [48, 128, 32, 16]) {
      const iconPath = icons[String(size)]
      if (iconPath && existsSync(join(extensionPath, iconPath))) {
        return join(extensionPath, iconPath)
      }
    }

    // 回退：取最大的图标
    const sizes = Object.keys(icons)
      .map(Number)
      .sort((a, b) => b - a)
    if (sizes.length > 0) {
      const iconPath = icons[String(sizes[0])]
      if (iconPath && existsSync(join(extensionPath, iconPath))) {
        return join(extensionPath, iconPath)
      }
    }
    return undefined
  } catch {
    return undefined
  }
}

function resolveExtensionMessage(extensionPath: string, value: string): string {
  const match = /^__MSG_(.+)__$/i.exec(value)
  if (!match) return value

  const locales = ['zh_CN', 'zh', 'en_US', 'en']
  for (const locale of locales) {
    const messagesPath = join(extensionPath, '_locales', locale, 'messages.json')
    if (!existsSync(messagesPath)) continue
    try {
      const messages = JSON.parse(readFileSync(messagesPath, 'utf8')) as Record<string, { message?: string }>
      const message = messages[match[1]]?.message
      if (message) return message
    } catch {
      // Ignore malformed optional locale files and try the next locale.
    }
  }
  return value
}

function readExtensionName(extensionPath: string, fallback = 'Unknown Extension'): string {
  const manifestPath = join(extensionPath, 'manifest.json')
  if (!existsSync(manifestPath)) return fallback
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name?: string
      short_name?: string
    }
    const rawName = manifest.name || manifest.short_name || fallback
    return resolveExtensionMessage(extensionPath, rawName)
  } catch {
    return fallback
  }
}

function getCompatibilityWarnings(manifest: { permissions?: string[] }): string[] {
  const unsupportedPermissions = new Set([
    'webRequestBlocking',
    'notifications',
    'webNavigation',
    'contextMenus',
    'chrome://favicon/',
    'cookies',
    'downloads'
  ])
  return (manifest.permissions ?? []).filter((permission) => unsupportedPermissions.has(permission))
}

/**
 * 注册扩展相关 IPC 处理器。
 */
export function registerExtensionHandlers(): void {
  ipcMain.handle(
    'extension:complete-tab-create',
    (_event, requestId: string, result: { tabId?: string; error?: string }) =>
      completeRendererTabCreate(requestId, result)
  )

  ipcMain.handle('extension:list', async (): Promise<Extension[]> => {
    const extensions = listExtensions()
    // 为缺少图标的扩展自动填充（兼容已有数据）
    for (const ext of extensions) {
      const name = readExtensionName(ext.path, ext.name)
      if (name !== ext.name) {
        ext.name = name
        updateExtension(ext.id, { name })
      }
      if (!ext.icon) {
        const icon = readExtensionIcon(ext.path)
        if (icon) {
          ext.icon = icon
          updateExtension(ext.id, { icon })
        }
      }
    }
    return extensions
  })

  ipcMain.handle('extension:select', async (event): Promise<Extension | null> => {
    console.log('[Extension IPC] extension:select called')

    const ownerWindow = BrowserWindow.fromWebContents(event.sender)
    const dialogOptions: Electron.OpenDialogOptions = {
      title: '选择 Chrome 扩展目录',
      properties: ['openDirectory', 'dontAddToRecent']
    }

    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    console.log('[Extension IPC] dialog result:', result)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const extensionPath = result.filePaths[0]
    const manifestPath = join(extensionPath, 'manifest.json')
    if (!existsSync(manifestPath)) {
      throw new Error('所选目录不是有效的 Chrome 扩展，缺少 manifest.json')
    }

    const extensionName = readExtensionName(extensionPath)

    const existedExtension = listExtensions().find((extension) => extension.path === extensionPath)
    if (existedExtension) {
      // 补充图标（兼容旧数据）
      if (!existedExtension.icon) {
        const icon = readExtensionIcon(extensionPath)
        if (icon) {
          existedExtension.icon = icon
          updateExtension(existedExtension.id, { icon })
        }
      }
      return existedExtension
    }

    return createExtension({
      name: extensionName,
      path: extensionPath,
      enabled: true,
      icon: readExtensionIcon(extensionPath)
    })
  })

  ipcMain.handle('extension:installFromWebStore', async (_event, storeUrl: string): Promise<Extension> => {
    const extensionId = parseChromeWebStoreExtensionId(storeUrl)
    const downloadUrl =
      `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=120.0.0.0&acceptformat=crx2,crx3&x=id%3D${extensionId}%26installsource%3Dondemand%26uc`
    let response: Awaited<ReturnType<typeof net.fetch>>
    try {
      response = await net.fetch(downloadUrl)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`下载扩展网络请求失败：${reason}, url: ${url}`)
    }
    if (!response.ok) {
      throw new Error(`下载扩展失败（HTTP ${response.status}）`)
    }

    const extensionRoot = join(app.getPath('userData'), 'extensions', 'webstore', extensionId)
    const archive = Buffer.from(await response.arrayBuffer())
    const zipData = extractCrxZip(archive)
    const zip = new AdmZip(zipData)
    const entries = zip.getEntries()
    if (!entries.some((entry) => entry.entryName === 'manifest.json')) {
      throw new Error('下载的文件不是有效的 Chrome 扩展')
    }

    const existing = listExtensions().find((extension) => extension.path === extensionRoot)
    if (existing) {
      await unloadExtensionFromAllContainers(existing.id)
    }

    rmSync(extensionRoot, { recursive: true, force: true })
    mkdirSync(extensionRoot, { recursive: true })
    for (const entry of entries) {
      const target = normalize(join(extensionRoot, entry.entryName))
      if (relative(extensionRoot, target).startsWith('..')) {
        throw new Error('扩展压缩包包含非法路径')
      }
      if (entry.isDirectory) {
        mkdirSync(target, { recursive: true })
      } else {
        mkdirSync(join(target, '..'), { recursive: true })
        writeFileSync(target, entry.getData())
      }
    }

    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8')) as {
      name?: string
      short_name?: string
      permissions?: string[]
    }
    const extensionName = resolveExtensionMessage(extensionRoot, manifest.name || manifest.short_name || extensionId)
    const userScriptsEnabled = (manifest.permissions ?? []).includes('userScripts')
    const extension = existing || createExtension({
      name: extensionName,
      path: extensionRoot,
      enabled: true,
      icon: readExtensionIcon(extensionRoot),
      userScriptsEnabled
    })
    if (existing) {
      const icon = readExtensionIcon(extensionRoot)
      updateExtension(existing.id, { name: extensionName, enabled: true, icon, userScriptsEnabled })
      extension.name = extensionName
      extension.enabled = true
      extension.icon = icon
      extension.userScriptsEnabled = userScriptsEnabled
    }
    await loadExtensionForAllContainers(extension)
    return {
      ...extension,
      name: extensionName,
      enabled: true,
      icon: readExtensionIcon(extensionRoot),
      userScriptsEnabled,
      compatibilityWarnings: getCompatibilityWarnings(manifest)
    }
  })

  ipcMain.handle('extension:restartForUserScripts', async (): Promise<void> => {
    app.relaunch()
    app.exit(0)
  })

  ipcMain.handle('extension:load', async (_event, extensionId: string): Promise<void> => {
    const extension = listExtensions().find((item) => item.id === extensionId)
    if (!extension) {
      console.error('[Extension:load] Extension not found:', extensionId)
      throw new Error(`扩展 ${extensionId} 不存在`)
    }

    await loadExtensionForAllContainers(extension)
  })

  ipcMain.handle('extension:unload', async (_event, extensionId: string): Promise<void> => {
    await unloadExtensionFromAllContainers(extensionId)
  })

  ipcMain.handle('extension:delete', async (_event, extensionId: string): Promise<void> => {
    await unloadExtensionFromAllContainers(extensionId)
    deleteExtension(extensionId)
  })

  ipcMain.handle(
    'extension:update',
    async (_event, id: string, data: Partial<Omit<Extension, 'id'>>): Promise<void> => {
      const extension = listExtensions().find((item) => item.id === id)
      if (!extension) {
        throw new Error(`扩展 ${id} 不存在`)
      }

      // 如果 `enabled` 状态发生变化，需要同步加载或卸载扩展
      if ('enabled' in data && data.enabled !== extension.enabled) {
        if (data.enabled) {
          // 启用：加载扩展
          await loadExtensionForAllContainers(extension)
        } else {
          // 禁用：卸载扩展
          await unloadExtensionFromAllContainers(id)
        }
      }

      updateExtension(id, data)
    }
  )

  ipcMain.handle('extension:getLoaded', async (): Promise<string[]> => {
    return getLoadedExtensionIds()
  })

  ipcMain.handle(
    'extension:openBrowserActionPopup',
    async (
      _event,
      extensionId: string,
      anchorRect: { x: number; y: number; width: number; height: number; alignment?: string }
    ): Promise<void> => {
      openExtensionBrowserActionPopup(extensionId, anchorRect)
    }
  )
}

function parseChromeWebStoreExtensionId(storeUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(storeUrl)
  } catch {
    throw new Error('无效的 Chrome Web Store 地址')
  }

  if (parsed.hostname.toLowerCase() !== 'chromewebstore.google.com') {
    throw new Error('只支持 Chrome Web Store 扩展页面')
  }

  const pathParts = parsed.pathname.split('/').filter(Boolean)
  const id = pathParts[0] === 'detail' ? pathParts[2] : parsed.searchParams.get('id')
  if (!id || !/^[a-z]{32}$/.test(id)) {
    throw new Error('无法从页面地址识别扩展 ID')
  }
  return id
}

function extractCrxZip(buffer: Buffer): Buffer {
  if (buffer.subarray(0, 4).toString('ascii') !== 'Cr24') {
    throw new Error('下载的文件不是有效的 CRX 扩展包')
  }

  const version = buffer.readUInt32LE(4)
  if (version === 2) {
    const publicKeyLength = buffer.readUInt32LE(8)
    const signatureLength = buffer.readUInt32LE(12)
    return buffer.subarray(16 + publicKeyLength + signatureLength)
  }
  if (version === 3) {
    const headerLength = buffer.readUInt32LE(8)
    return buffer.subarray(12 + headerLength)
  }
  throw new Error(`不支持的 CRX 版本：${version}`)
}
