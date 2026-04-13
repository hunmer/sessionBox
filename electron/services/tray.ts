// electron/services/tray.ts
import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { listGroups, listPages } from './store'
import { trayWindowManager } from './tray-window'
import type { Page } from './store'

class TrayManager {
  private tray: Tray | null = null

  init(mainWindow: BrowserWindow): void {
    const iconPath = this.getIconPath()
    let icon = nativeImage.createFromPath(iconPath)

    // 图标加载失败时，回退到应用主图标
    if (icon.isEmpty()) {
      console.warn('[Tray] 图标为空，尝试使用应用主图标作为回退')
      const fallbackName = process.platform === 'darwin' ? 'icon.icns' : 'icon.png'
      const fallbackPath = app.isPackaged
        ? join(process.resourcesPath, fallbackName)
        : join(__dirname, '../../resources', fallbackName)
      icon = nativeImage.createFromPath(fallbackPath)
    }

    // macOS 使用模板图标自动适配主题
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true)
    }

    this.tray = new Tray(icon)
    this.tray.setToolTip('SessionBox')

    // 双击激活主窗口（只显示不隐藏）
    this.tray.on('double-click', () => {
      mainWindow.show()
      mainWindow.focus()
    })

    // 右键显示菜单（每次动态构建，确保任务栏窗口列表实时更新）
    this.tray.on('right-click', () => {
      const menu = this.buildMenu(mainWindow)
      this.tray!.popUpContextMenu(menu)
    })
  }

  private getIconPath(): string {
    const name = process.platform === 'darwin' ? 'trayIconTemplate@2x.png' : 'trayIcon.png'

    const candidates = app.isPackaged
      ? [
          join(process.resourcesPath, name), // extraResources 标准位置
          join(process.resourcesPath, 'resources', name), // 某些打包配置的子目录
          join(__dirname, '..', '..', 'resources', name), // asar 内相对路径
          join(process.resourcesPath, 'app.asar.unpacked', 'resources', name) // asar 外解压路径
        ]
      : [join(__dirname, '../../resources', name)]

    for (const p of candidates) {
      if (existsSync(p)) return p
    }

    console.warn('[Tray] 图标文件未找到，已尝试路径:', candidates)
    // 回退到第一个候选路径，让 nativeImage.createFromPath 尝试加载
    return candidates[0]
  }

  private buildMenu(mainWindow: BrowserWindow): Menu {
    const groups = listGroups()
    const pages = listPages()

    // 构建分组 → 页面子菜单
    const pageSubmenu: Electron.MenuItemConstructorOptions[] = []

    if (pages.length === 0) {
      pageSubmenu.push({
        label: '暂无页面',
        enabled: false
      })
    } else {
      for (const group of groups) {
        const groupPages = pages
          .filter(p => p.groupId === group.id)
          .sort((a, b) => a.order - b.order)

        if (groupPages.length === 0) continue

        pageSubmenu.push({
          label: group.name,
          submenu: groupPages.map(page => ({
            label: page.name,
            submenu: [
              {
                label: '软件内打开',
                click: () => this.openInApp(mainWindow, page)
              },
              {
                label: '新窗口打开',
                click: () => trayWindowManager.openInNewWindow(page)
              },
              {
                label: '任务栏打开（桌面版）',
                click: () => {
                  if (this.tray) trayWindowManager.openAtTaskbar(this.tray, page, 'desktop')
                }
              },
              {
                label: '任务栏打开（手机版）',
                click: () => {
                  if (this.tray) trayWindowManager.openAtTaskbar(this.tray, page, 'mobile')
                }
              }
            ]
          }))
        })
      }

      // 没有分组的页面
      const ungroupedPages = pages
        .filter(p => !groups.some(g => g.id === p.groupId))
        .sort((a, b) => a.order - b.order)

      if (ungroupedPages.length > 0) {
        pageSubmenu.push({ type: 'separator' })
        for (const page of ungroupedPages) {
          pageSubmenu.push({
            label: page.name,
            submenu: [
              {
                label: '软件内打开',
                click: () => this.openInApp(mainWindow, page)
              },
              {
                label: '新窗口打开',
                click: () => trayWindowManager.openInNewWindow(page)
              },
              {
                label: '任务栏打开（桌面版）',
                click: () => {
                  if (this.tray) trayWindowManager.openAtTaskbar(this.tray, page, 'desktop')
                }
              },
              {
                label: '任务栏打开（手机版）',
                click: () => {
                  if (this.tray) trayWindowManager.openAtTaskbar(this.tray, page, 'mobile')
                }
              }
            ]
          })
        }
      }
    }

    // 已打开的任务栏窗口列表
    const taskbarWindows = trayWindowManager.getTaskbarWindows()
    const taskbarItems: Electron.MenuItemConstructorOptions[] = []

    if (taskbarWindows.length === 0) {
      taskbarItems.push({
        label: '暂无窗口',
        enabled: false
      })
    } else {
      for (const entry of taskbarWindows) {
        const modeLabel = entry.mode === 'desktop' ? '桌面' : '手机'
        taskbarItems.push({
          label: `${entry.page.name} (${modeLabel})`,
          submenu: [
            {
              label: '打开',
              click: () => trayWindowManager.showTaskbarWindow(entry.id)
            },
            {
              label: '关闭',
              click: () => trayWindowManager.closeTaskbarWindow(entry.id)
            }
          ]
        })
      }
    }

    return Menu.buildFromTemplate([
      {
        label: '打开页面',
        submenu: pageSubmenu
      },
      {
        label: '已打开的窗口',
        submenu: taskbarItems
      },
      { type: 'separator' },
      {
        label: '打开主窗口',
        click: () => {
          mainWindow.show()
          mainWindow.focus()
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          trayWindowManager.destroyAll()
          app.quit()
        }
      }
    ])
  }

  /** 软件内打开：激活主窗口并通知渲染进程 */
  private openInApp(mainWindow: BrowserWindow, page: Page): void {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('on:tray:openInApp', page.id)
  }

  /** 手动刷新菜单（由 main.ts 在数据变更时调用） */
  refreshMenu(mainWindow: BrowserWindow): void {
    if (!this.tray) return
    this.tray.setContextMenu(this.buildMenu(mainWindow))
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}

export const trayManager = new TrayManager()
