import { ipcMain, dialog } from 'electron'
import { pluginManager } from '../services/plugin-manager'

export function registerPluginIpcHandlers(): void {
  ipcMain.handle('plugin:list', () => {
    return pluginManager.list()
  })

  ipcMain.handle('plugin:get-dir', () => {
    return {
      current: pluginManager.getPluginsDir(),
      default: pluginManager.getDefaultPluginsDir(),
      isCustom: pluginManager.isCustomPluginsDir()
    }
  })

  ipcMain.handle('plugin:set-dir', (_e, dir: string) => {
    return pluginManager.setPluginsDir(dir || '')
  })

  ipcMain.handle('plugin:pick-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择插件目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('plugin:enable', (_e, pluginId: string) => {
    pluginManager.enable(pluginId)
  })

  ipcMain.handle('plugin:disable', (_e, pluginId: string) => {
    pluginManager.disable(pluginId)
  })

  ipcMain.handle('plugin:get-view', (_e, pluginId: string) => {
    return pluginManager.getViewContent(pluginId)
  })

  ipcMain.handle('plugin:get-icon', (_e, pluginId: string) => {
    return pluginManager.getIconBase64(pluginId)
  })

  ipcMain.handle('plugin:import-zip', async () => {
    return pluginManager.importFromZip()
  })

  ipcMain.handle('plugin:open-folder', () => {
    pluginManager.openPluginsFolder()
  })

  ipcMain.handle('plugin:install', async (_e, url: string) => {
    return pluginManager.installFromUrl(url)
  })

  ipcMain.handle('plugin:uninstall', async (_e, pluginId: string) => {
    return pluginManager.uninstallPlugin(pluginId)
  })
  ipcMain.handle('plugin:open-default', (_e, pluginId: string) => pluginManager.openDefault(pluginId))
  ipcMain.handle('plugin:open-log', (_e, pluginId: string) => pluginManager.openPluginLog(pluginId))
}
