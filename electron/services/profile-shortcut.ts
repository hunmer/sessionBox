import { app } from 'electron'
import { existsSync, writeFileSync } from 'node:fs'
import { execSync, execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { getProfileLaunchArgs } from '../bootstrap'
import type { Profile } from './profile-registry'

/** 快捷方式文件名不允许的字符直接剔除 */
function sanitizeShortcutName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim()
}

function getUniqueShortcutPath(dir: string, baseName: string, ext: string): string {
  let candidate = join(dir, `${baseName}${ext}`)
  let index = 2
  while (existsSync(candidate)) {
    candidate = join(dir, `${baseName} (${index})${ext}`)
    index += 1
  }
  return candidate
}

/** 参数含空格时加双引号，拼成 .lnk/.desktop 可用的单行命令 */
function quoteArgs(args: string[]): string {
  return args.map((arg) => (/\s/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)).join(' ')
}

/** PowerShell 单引号字面量转义（单引号翻倍） */
function toPsSingleQuoted(value: string): string {
  return value.replace(/'/g, "''")
}

/** shell 单引号包裹，内部单引号转义为 '\'' */
function toShellQuoted(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

/** AppleScript 字符串转义 */
function toAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * 为 profile 创建桌面快捷方式，目标为当前可执行文件 + --profile 参数，
 * 双击后直接进入对应 profile，不经过 Profiles 选择页。
 */
export function createProfileDesktopShortcut(profile: Profile): string {
  const desktopPath = app.getPath('desktop')
  const baseName = sanitizeShortcutName(profile.name) || profile.id
  const launchArgs = quoteArgs(getProfileLaunchArgs(profile.id))

  if (process.platform === 'win32') {
    // 真正的 .lnk 快捷方式：目标/参数/图标都指向本应用，直接拉起 profile 进程
    const shortcutPath = getUniqueShortcutPath(desktopPath, baseName, '.lnk')
    const psScript = `
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut('${toPsSingleQuoted(shortcutPath)}')
$shortcut.TargetPath = '${toPsSingleQuoted(process.execPath)}'
$shortcut.Arguments = '${toPsSingleQuoted(launchArgs)}'
$shortcut.WorkingDirectory = '${toPsSingleQuoted(app.getAppPath())}'
$shortcut.IconLocation = '${toPsSingleQuoted(process.execPath)},0'
$shortcut.Save()`
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
    execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { windowsHide: true, timeout: 10000 })
    return shortcutPath
  }

  if (process.platform === 'darwin') {
    const shortcutPath = getUniqueShortcutPath(desktopPath, baseName, '.app')
    const shellCommand = `${toShellQuoted(process.execPath)} ${launchArgs} >/dev/null 2>&1 &`
    execFileSync(
      'osacompile',
      ['-o', shortcutPath, '-e', `do shell script "${toAppleScriptString(shellCommand)}"`],
      { timeout: 10000, stdio: 'ignore' }
    )
    return shortcutPath
  }

  // Linux：标准 .desktop 文件
  const shortcutPath = getUniqueShortcutPath(desktopPath, baseName, '.desktop')
  const content = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${profile.name}`,
    `Exec=${process.execPath} ${launchArgs}`,
    'Terminal=false',
    ''
  ].join('\n')
  writeFileSync(shortcutPath, content, 'utf-8')
  return shortcutPath
}
