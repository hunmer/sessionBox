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
  getLoadedExtensionIds,
  loadExtensionForAllContainers,
  openExtensionBrowserActionPopup,
  unloadExtensionFromAllContainers
} from '../services/extensions'

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

/**
 * 注册扩展相关 IPC 处理器。
 */
export function registerExtensionHandlers(): void {
  ipcMain.handle('extension:list', async (): Promise<Extension[]> => {
    const extensions = listExtensions()
    // 为缺少图标的扩展自动填充（兼容已有数据）
    for (const ext of extensions) {
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

    let extensionName = 'Unknown Extension'
    try {
      const manifestContent = readFileSync(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestContent) as {
        name?: string
        short_name?: string
      }
      extensionName = manifest.name || manifest.short_name || extensionName
    } catch (error) {
      console.error('[Extension IPC] Failed to read manifest:', error)
    }

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
      throw new Error(`下载扩展网络请求失败：${reason}`)
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
    }
    const extensionName = manifest.name || manifest.short_name || extensionId
    const extension = existing || createExtension({
      name: extensionName,
      path: extensionRoot,
      enabled: true,
      icon: readExtensionIcon(extensionRoot)
    })
    if (existing) {
      const icon = readExtensionIcon(extensionRoot)
      updateExtension(existing.id, { name: extensionName, enabled: true, icon })
      extension.name = extensionName
      extension.enabled = true
      extension.icon = icon
    }
    await loadExtensionForAllContainers(extension)
    return { ...extension, name: extensionName, enabled: true, icon: readExtensionIcon(extensionRoot) }
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
      containerId: string | null,
      extensionId: string,
      anchorRect: { x: number; y: number; width: number; height: number }
    ): Promise<void> => {
      openExtensionBrowserActionPopup(containerId, extensionId, anchorRect)
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
