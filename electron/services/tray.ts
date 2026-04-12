// electron/services/tray.ts
import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'
import { listGroups, listPages } from './store'
import { trayWindowManager } from './tray-window'
import type { Page } from './store'

class TrayManager {
  private tray: Tray | null = null

  init(mainWindow: BrowserWindow): void {
    const iconPath = this.getIconPath()
    const icon = nativeImage.createFromPath(iconPath)

    // macOS 使用模板图标自动适配主题
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true)
    }

    this.tray = new Tray(icon)
    this.tray.setToolTip('SessionBox')

    // 左键点击显示/隐藏主窗口
    this.tray.on('click', () => {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    })

    // 右键显示菜单
    this.tray.on('right-click', () => {
      const menu = this.buildMenu(mainWindow)
      this.tray!.popUpContextMenu(menu)
    })

    // 初始化菜单（Windows 上使用 setContextMenu）
    this.tray.setContextMenu(this.buildMenu(mainWindow))
  }

  private getIconPath(): string {
    if (app.isPackaged) {
      const name = process.platform === 'darwin' ? 'trayIconTemplate@2x.png' : 'trayIcon.png'
      return join(process.resourcesPath, name)
    }
    const name = process.platform === 'darwin' ? 'trayIconTemplate@2x.png' : 'trayIcon.png'
    return join(__dirname, '../../resources', name)
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

    return Menu.buildFromTemplate([
      {
        label: '打开页面',
        submenu: pageSubmenu
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
