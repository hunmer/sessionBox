import { app, shell } from 'electron'
import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'

const WEB_PROTOCOLS = ['http', 'https'] as const
const HTML_EXTENSIONS = ['.htm', '.html', '.shtml', '.xht', '.xhtml'] as const

export interface DefaultBrowserResult {
  isDefault: boolean
  requiresSystemSelection: boolean
  openedSystemSettings: boolean
}

function isPackagedWindows(): boolean {
  return process.platform === 'win32' && app.isPackaged
}

function getBrowserAppName(): string {
  return app.getName() || 'SessionBox'
}

function getExecutableFileName(): string {
  const executableName = basename(process.execPath)
  return executableName.toLowerCase().endsWith('.exe') ? executableName : `${executableName}.exe`
}

function getProductFileName(): string {
  return getExecutableFileName().replace(/\.exe$/i, '')
}

function getHtmlProgId(): string {
  return `${getProductFileName()}HTML`
}

function getUrlProgId(): string {
  return `${getProductFileName()}URL`
}

function getStartMenuInternetKey(): string {
  return `Software\\Clients\\StartMenuInternet\\${getExecutableFileName()}`
}

function getCapabilitiesKey(): string {
  return `${getStartMenuInternetKey()}\\Capabilities`
}

function getDefaultIconValue(): string {
  return `"${process.execPath}",0`
}

function getOpenCommandValue(): string {
  return `"${process.execPath}" "%1"`
}

function regAdd(
  rootKey: 'HKCU' | 'HKLM',
  subKey: string,
  valueName: string | null,
  valueData: string,
  valueType = 'REG_SZ'
): void {
  const args = ['add', `${rootKey}\\${subKey}`, '/f']
  if (valueName == null) {
    args.push('/ve')
  } else {
    args.push('/v', valueName)
  }
  args.push('/t', valueType, '/d', valueData)
  execFileSync('reg', args, { windowsHide: true })
}

function regQuery(rootKey: 'HKCU' | 'HKLM', subKey: string, valueName: string): string | null {
  try {
    const output = execFileSync(
      'reg',
      ['query', `${rootKey}\\${subKey}`, '/v', valueName],
      { encoding: 'utf8', windowsHide: true }
    )

    const match = output.match(new RegExp(`^\\s*${valueName}\\s+REG_\\w+\\s+(.+)$`, 'mi'))
    return match?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

function writeBrowserRegistration(rootKey: 'HKCU' | 'HKLM'): void {
  const appName = getBrowserAppName()
  const iconValue = getDefaultIconValue()
  const openCommandValue = getOpenCommandValue()
  const capabilitiesKey = getCapabilitiesKey()
  const htmlProgId = getHtmlProgId()
  const urlProgId = getUrlProgId()

  regAdd(rootKey, getStartMenuInternetKey(), null, appName)
  regAdd(rootKey, `${getStartMenuInternetKey()}\\DefaultIcon`, null, iconValue)
  regAdd(rootKey, `${getStartMenuInternetKey()}\\shell\\open\\command`, null, openCommandValue)

  regAdd(rootKey, capabilitiesKey, 'ApplicationName', appName)
  regAdd(rootKey, capabilitiesKey, 'ApplicationDescription', `${appName} Browser`)
  regAdd(rootKey, capabilitiesKey, 'ApplicationIcon', iconValue)
  regAdd(rootKey, `${capabilitiesKey}\\Startmenu`, 'StartMenuInternet', getExecutableFileName())

  for (const extension of HTML_EXTENSIONS) {
    regAdd(rootKey, `${capabilitiesKey}\\FileAssociations`, extension, htmlProgId)
  }

  for (const protocol of WEB_PROTOCOLS) {
    regAdd(rootKey, `${capabilitiesKey}\\URLAssociations`, protocol, urlProgId)
  }

  regAdd(rootKey, 'Software\\RegisteredApplications', appName, capabilitiesKey)

  regAdd(rootKey, `Software\\Classes\\${htmlProgId}`, null, `${appName} HTML Document`)
  regAdd(rootKey, `Software\\Classes\\${htmlProgId}`, 'FriendlyTypeName', `${appName} HTML Document`)
  regAdd(rootKey, `Software\\Classes\\${htmlProgId}\\DefaultIcon`, null, iconValue)
  regAdd(rootKey, `Software\\Classes\\${htmlProgId}\\shell\\open\\command`, null, openCommandValue)

  regAdd(rootKey, `Software\\Classes\\${urlProgId}`, null, `${appName} URL`)
  regAdd(rootKey, `Software\\Classes\\${urlProgId}`, 'FriendlyTypeName', `${appName} URL`)
  regAdd(rootKey, `Software\\Classes\\${urlProgId}`, 'URL Protocol', '')
  regAdd(rootKey, `Software\\Classes\\${urlProgId}\\DefaultIcon`, null, iconValue)
  regAdd(rootKey, `Software\\Classes\\${urlProgId}\\shell\\open\\command`, null, openCommandValue)
}

function getWindowsUserChoiceProgId(protocol: (typeof WEB_PROTOCOLS)[number]): string | null {
  return regQuery(
    'HKCU',
    `Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\${protocol}\\UserChoice`,
    'ProgId'
  )
}

export function ensureWindowsBrowserRegistration(): void {
  if (!isPackagedWindows()) return

  try {
    writeBrowserRegistration('HKCU')
    console.log('[DefaultBrowser] ensured Windows browser registration in HKCU')
  } catch (error) {
    console.error('[DefaultBrowser] failed to register Windows browser capabilities', error)
  }
}

export function isDefaultBrowser(): boolean {
  if (process.platform === 'win32') {
    if (!isPackagedWindows()) return false
    const expectedProgId = getUrlProgId()
    return WEB_PROTOCOLS.every((protocol) => getWindowsUserChoiceProgId(protocol) === expectedProgId)
  }

  return WEB_PROTOCOLS.every((protocol) => app.isDefaultProtocolClient(protocol))
}

export async function setDefaultBrowser(enabled: boolean): Promise<DefaultBrowserResult> {
  if (process.platform === 'win32') {
    ensureWindowsBrowserRegistration()

    let openedSystemSettings = false
    try {
      await shell.openExternal('ms-settings:defaultapps')
      openedSystemSettings = true
    } catch (error) {
      console.error('[DefaultBrowser] failed to open Windows default apps settings', error)
    }

    return {
      isDefault: isDefaultBrowser(),
      requiresSystemSelection: true,
      openedSystemSettings
    }
  }

  for (const protocol of WEB_PROTOCOLS) {
    if (enabled) {
      app.setAsDefaultProtocolClient(protocol)
    } else {
      app.removeAsDefaultProtocolClient(protocol)
    }
  }

  return {
    isDefault: isDefaultBrowser(),
    requiresSystemSelection: false,
    openedSystemSettings: false
  }
}
