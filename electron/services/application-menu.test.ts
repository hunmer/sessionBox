import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { configureApplicationMenu } from './application-menu.ts'

const require = createRequire(import.meta.url)
const { app, BrowserWindow, Menu } = require('electron') as typeof import('electron')
app.setPath('userData', require('node:path').join(app.getPath('temp'), `sessionbox-menu-test-${process.pid}`))

test('默认隐藏菜单仍绑定关窗快捷键，应用菜单配置应移除此入口', async () => {
  await app.whenReady()
  const win = new BrowserWindow({ show: false, frame: false, autoHideMenuBar: true })
  try {
    const containsClose = (menu: Electron.Menu | null): boolean =>
      menu?.items.some(item => item.role === 'close' || containsClose(item.submenu ?? null)) ?? false
    assert.equal(containsClose(Menu.getApplicationMenu()), true)
    configureApplicationMenu(Menu)
    assert.equal(Menu.getApplicationMenu(), null)
    const nextWindow = new BrowserWindow({ show: false })
    nextWindow.destroy()
    assert.equal(Menu.getApplicationMenu(), null)
  } finally {
    win.destroy()
    app.quit()
  }
})
