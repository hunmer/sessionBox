import { BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { getProfileLaunchArgs, IS_PROFILE_SELECTOR, PROFILE_ID } from '../bootstrap'
import { createProfile, getProfile, listProfiles, touchProfile } from '../services/profile-registry'
import { createProfileDesktopShortcut } from '../services/profile-shortcut'

/** 以独立进程启动应用：dev 下 execPath 是 electron.exe，需要附带应用路径 */
function spawnApp(extraArgs: string[]): void {
  const child = spawn(process.execPath, extraArgs, { detached: true, stdio: 'ignore' })
  child.unref()
}

export function registerProfileIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('profile:list', () => listProfiles())

  ipcMain.handle('profile:create', (_event, name: unknown) => createProfile(String(name ?? '')))

  ipcMain.handle('profile:current', () => {
    const profile = getProfile(PROFILE_ID)
    return { id: PROFILE_ID, name: profile?.name ?? PROFILE_ID }
  })

  ipcMain.handle('profile:launch', (_event, profileId: unknown) => {
    const id = String(profileId ?? '')
    const profile = getProfile(id)
    if (!profile) throw new Error(`Profile ${id} 不存在`)
    touchProfile(id)

    // 当前进程即目标 profile：聚焦已有窗口即可，不重复拉起进程
    if (id === PROFILE_ID && !IS_PROFILE_SELECTOR) {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        return { launched: false }
      }
    }

    spawnApp(getProfileLaunchArgs(id))
    return { launched: true }
  })

  ipcMain.handle('profile:open-selector', () => {
    spawnApp(['--profile-selector'])
    return true
  })

  // 桌面快捷方式直启 profile，跳过选择页
  ipcMain.handle('profile:create-desktop-shortcut', (_event, profileId: unknown) => {
    const id = String(profileId ?? '')
    const profile = getProfile(id)
    if (!profile) throw new Error(`Profile ${id} 不存在`)
    return createProfileDesktopShortcut(profile)
  })
}
