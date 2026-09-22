import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { app, type CookiesSetDetails, type Session } from 'electron'
import { isGoogleLoginHost } from './external-auth-domains'
import { parseWindowsProcessIds, windowsProcessTreeKillArgs } from './external-auth-process'

export type ExternalAuthBrowser = 'chrome' | 'edge'

export interface ExternalAuthResult {
  ok: boolean
  pending?: boolean
  cookieCount?: number
  finalUrl?: string
  error?: string
}

interface DevToolsVersion {
  Browser?: string
  'User-Agent'?: string
  webSocketDebuggerUrl?: string
}

interface DevToolsTarget {
  id: string
  url: string
  webSocketDebuggerUrl: string
}

interface CdpCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

interface CdpCookieParam {
  name: string
  value: string
  url?: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expires?: number
  sameSite?: 'Strict' | 'Lax' | 'None'
}

const visibleBrowserProcesses = new Map<string, ChildProcess>()

function writeExternalAuthLog(event: string, context: Record<string, unknown>): void {
  try {
    appendFileSync(
      join(app.getPath('userData'), 'external-auth.log'),
      `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...context })}\n`,
      'utf8'
    )
  } catch {
    // 登录同步不能因诊断日志写入失败而中断。
  }
}

function describeAuthUrl(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}${url.search ? `?${[...url.searchParams.keys()].join(',')}` : ''}`
  } catch {
    return 'invalid-url'
  }
}

function summarizeCookieDomains(cookies: CdpCookie[]): Array<{ domain: string; count: number }> {
  const counts = new Map<string, number>()
  for (const cookie of cookies) {
    const domain = cookie.domain.replace(/^\./, '').toLowerCase()
    counts.set(domain, (counts.get(domain) || 0) + 1)
  }
  return [...counts.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count)
}

function isCompletionUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !isGoogleLoginHost(parsed.hostname)
  } catch {
    return false
  }
}

function getProfileDir(browser: ExternalAuthBrowser, containerId: string): string {
  const safeContainerId = (containerId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(app.getPath('userData'), 'external-auth-profiles', browser, safeContainerId)
}

export function getExternalAuthProfileDirs(containerId: string): string[] {
  return (['chrome', 'edge'] as const).map((browser) => getProfileDir(browser, containerId))
}

function executableCandidates(browser: ExternalAuthBrowser): string[] {
  if (process.platform === 'darwin') {
    return browser === 'chrome'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
  }
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter((value): value is string => !!value)
    const suffix = browser === 'chrome'
      ? 'Google/Chrome/Application/chrome.exe'
      : 'Microsoft/Edge/Application/msedge.exe'
    return roots.map((root) => join(root, suffix))
  }
  return browser === 'chrome' ? ['google-chrome', 'google-chrome-stable'] : ['microsoft-edge', 'microsoft-edge-stable']
}

function endpointFromProfile(profileDir: string): string | null {
  const activePortPath = join(profileDir, 'DevToolsActivePort')
  if (!existsSync(activePortPath)) return null
  try {
    const [port] = readFileSync(activePortPath, 'utf8').split(/\r?\n/)
    if (/^\d+$/.test(port)) return `http://127.0.0.1:${port}`
  } catch {
    // 文件可能正被浏览器更新。
  }
  return null
}

async function fetchJson<T>(url: string, options?: RequestInit, timeoutMs = 1200): Promise<T | null> {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) return null
    return await response.json() as T
  } catch {
    return null
  }
}

function matchesBrowser(version: DevToolsVersion, browser: ExternalAuthBrowser): boolean {
  const signature = `${version.Browser || ''} ${version['User-Agent'] || ''}`.toLowerCase()
  return browser === 'edge'
    ? signature.includes('edg/') || signature.includes('edge')
    : signature.includes('chrome/') && !signature.includes('edg/')
}

async function findEndpoint(browser: ExternalAuthBrowser, profileDir: string): Promise<string | null> {
  const endpoint = endpointFromProfile(profileDir)
  if (!endpoint) return null
  const version = await fetchJson<DevToolsVersion>(`${endpoint}/json/version`)
  if (version?.webSocketDebuggerUrl && matchesBrowser(version, browser)) return endpoint
  return null
}

function launchDedicatedBrowser(
  browser: ExternalAuthBrowser,
  profileDir: string,
  url: string,
  enableCdp: boolean
): boolean {
  const executable = executableCandidates(browser).find((candidate) =>
    process.platform === 'linux' ? true : existsSync(candidate)
  )
  if (!executable) return false

  try {
    mkdirSync(profileDir, { recursive: true })
    const args = [
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-mode',
      '--new-window'
    ]
    if (enableCdp) args.push('--headless=new', '--remote-debugging-port=0')
    args.push(url)
    const child = spawn(executable, args, { detached: true, stdio: 'ignore' })
    child.once('error', () => {})
    if (!enableCdp) {
      visibleBrowserProcesses.set(profileDir, child)
      child.once('exit', () => {
        if (visibleBrowserProcesses.get(profileDir) === child) {
          visibleBrowserProcesses.delete(profileDir)
        }
      })
    }
    child.unref()
    return true
  } catch {
    return false
  }
}

async function stopVisibleBrowser(profileDir: string): Promise<void> {
  const child = visibleBrowserProcesses.get(profileDir)
  if (child && child.exitCode === null && !child.killed) {
    if (process.platform === 'win32' && child.pid) {
      try {
        execFileSync('taskkill.exe', windowsProcessTreeKillArgs(child.pid), {
          stdio: 'ignore',
          timeout: 5000,
          windowsHide: true
        })
        writeExternalAuthLog('browser-process-tree-stopped', { profileDir, pid: child.pid })
      } catch (error) {
        writeExternalAuthLog('browser-process-tree-stop-failed', {
          profileDir,
          pid: child.pid,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    } else {
      child.kill('SIGTERM')
    }
  }

  if (process.platform === 'win32') {
    try {
      const output = execFileSync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$needle="--user-data-dir=$env:SESSIONBOX_PROFILE"; Get-CimInstance Win32_Process | Where-Object { $_.Name -match "^(chrome|msedge)[.]exe$" -and $_.CommandLine -like "*$needle*" } | Select-Object -ExpandProperty ProcessId'
      ], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
        windowsHide: true,
        env: { ...process.env, SESSIONBOX_PROFILE: profileDir }
      })
      for (const pid of parseWindowsProcessIds(output)) {
        if (pid === process.pid || pid === child?.pid) continue
        try {
          execFileSync('taskkill.exe', windowsProcessTreeKillArgs(pid), {
            stdio: 'ignore',
            timeout: 5000,
            windowsHide: true
          })
          writeExternalAuthLog('orphan-browser-process-tree-stopped', { profileDir, pid })
        } catch {
          // 进程可能在枚举后刚好退出。
        }
      }
    } catch (error) {
      writeExternalAuthLog('orphan-browser-process-scan-failed', {
        profileDir,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  if (process.platform !== 'win32') {
    try {
      const output = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
      const profileArg = `--user-data-dir=${profileDir}`
      for (const line of output.split(/\r?\n/)) {
        if (!line.includes(profileArg) || !/(chrome|edge)/i.test(line)) continue
        const pid = Number(line.trim().match(/^(\d+)/)?.[1])
        if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
          try { process.kill(pid, 'SIGTERM') } catch { /* 进程可能刚好退出 */ }
        }
      }
    } catch { /* 无法枚举时仍等待已跟踪的进程退出 */ }
  }

  const deadline = Date.now() + 5000
  while (child?.exitCode === null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  // Windows 终止进程树后，Chromium 还可能短暂持有 Profile 锁；给 Cookies/Preferences 一个落盘窗口。
  if (process.platform === 'win32') await new Promise((resolve) => setTimeout(resolve, 800))
  visibleBrowserProcesses.delete(profileDir)
}

async function waitForEndpoint(
  browser: ExternalAuthBrowser,
  profileDir: string,
  timeoutMs = 10_000
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const endpoint = await findEndpoint(browser, profileDir)
    if (endpoint) return endpoint
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  return null
}

async function openCdpEndpoint(browser: ExternalAuthBrowser, profileDir: string): Promise<string | null> {
  const existing = await findEndpoint(browser, profileDir)
  if (existing) {
    writeExternalAuthLog('cdp-endpoint-existing', { browser, profileDir, endpoint: existing })
    return existing
  }

  const activePortPath = join(profileDir, 'DevToolsActivePort')
  try {
    if (existsSync(activePortPath)) unlinkSync(activePortPath)
  } catch { /* 启动时会再次覆盖 */ }

  if (!launchDedicatedBrowser(browser, profileDir, 'about:blank', true)) {
    writeExternalAuthLog('cdp-launch-failed', { browser, profileDir })
    return null
  }
  const endpoint = await waitForEndpoint(browser, profileDir)
  writeExternalAuthLog(endpoint ? 'cdp-endpoint-ready' : 'cdp-endpoint-timeout', {
    browser,
    profileDir,
    endpoint: endpoint || undefined
  })
  return endpoint
}

class CdpClient {
  private socket: WebSocket | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()
  private listeners = new Set<(message: any) => void>()

  constructor(private readonly context: Record<string, unknown> = {}) {}

  async connect(url: string): Promise<void> {
    writeExternalAuthLog('cdp-connect-start', this.context)
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url)
      this.socket = socket
      const timer = setTimeout(() => {
        socket.close()
        writeExternalAuthLog('cdp-connect-timeout', this.context)
        reject(new Error('连接浏览器调试通道超时'))
      }, 5000)
      socket.addEventListener('open', () => {
        clearTimeout(timer)
        writeExternalAuthLog('cdp-connect-open', this.context)
        resolve()
      }, { once: true })
      socket.addEventListener('error', () => {
        clearTimeout(timer)
        writeExternalAuthLog('cdp-connect-error', this.context)
        reject(new Error('无法连接浏览器调试通道'))
      }, { once: true })
      socket.addEventListener('message', (event) => this.handleMessage(event.data))
      socket.addEventListener('close', () => {
        writeExternalAuthLog('cdp-closed', this.context)
        this.rejectAll(new Error('浏览器调试通道已关闭'))
        for (const listener of this.listeners) listener({ method: 'Session.closed' })
      })
    })
  }

  send<T = any>(method: string, params: Record<string, unknown> = {}, timeoutMs = 5000): Promise<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('浏览器调试通道未连接'))
    }
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const startedAt = Date.now()
      writeExternalAuthLog('cdp-command-start', { ...this.context, id, method, timeoutMs, parameterNames: Object.keys(params) })
      const timer = setTimeout(() => {
        this.pending.delete(id)
        writeExternalAuthLog('cdp-command-timeout', { ...this.context, id, method, elapsedMs: Date.now() - startedAt })
        reject(new Error(`浏览器调试命令超时: ${method}`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          writeExternalAuthLog('cdp-command-success', { ...this.context, id, method, elapsedMs: Date.now() - startedAt })
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          writeExternalAuthLog('cdp-command-failed', { ...this.context, id, method, elapsedMs: Date.now() - startedAt, error: error.message })
          reject(error)
        }
      })
      this.socket!.send(JSON.stringify({ id, method, params }))
    })
  }

  onMessage(listener: (message: any) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close(): void {
    this.socket?.close()
    this.socket = null
  }

  private handleMessage(raw: string | ArrayBuffer | Blob): void {
    if (typeof raw !== 'string') return
    const message = JSON.parse(raw)
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message || 'CDP 调用失败'))
      else pending.resolve(message.result)
      return
    }
    for (const listener of this.listeners) listener(message)
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}

async function openAuthTarget(endpoint: string): Promise<DevToolsTarget | null> {
  const targets = await fetchJson<DevToolsTarget[]>(`${endpoint}/json/list`)
  const reusable = targets?.find((target) =>
    !!target.webSocketDebuggerUrl
    && (target.url === 'about:blank' || target.url.startsWith('chrome://newtab'))
  )
  if (reusable) return reusable
  return fetchJson<DevToolsTarget>(`${endpoint}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' }, 3000)
}

async function closeCdpBrowser(endpoint: string, context: Record<string, unknown> = {}): Promise<void> {
  const version = await fetchJson<DevToolsVersion>(`${endpoint}/json/version`)
  if (!version?.webSocketDebuggerUrl) return
  const client = new CdpClient(context)
  try {
    await client.connect(version.webSocketDebuggerUrl)
    await client.send('Browser.close')
  } catch {
    // Browser.close 会主动断开调试连接。
  } finally {
    client.close()
  }
}

function cookieMatchesHost(cookieDomain: string, hostname: string): boolean {
  const domain = cookieDomain.replace(/^\./, '').toLowerCase()
  const host = hostname.toLowerCase()
  return host === domain || host.endsWith(`.${domain}`)
}

function toElectronCookie(cookie: CdpCookie): CookiesSetDetails {
  const host = cookie.domain.replace(/^\./, '')
  const details: CookiesSetDetails = {
    url: `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path || '/'}`,
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || '/',
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite === 'Strict'
      ? 'strict'
      : cookie.sameSite === 'None'
        ? 'no_restriction'
        : cookie.sameSite === 'Lax'
          ? 'lax'
          : 'unspecified'
  }
  if (cookie.expires > 0) details.expirationDate = cookie.expires
  return details
}

async function importCookies(
  targetSession: Session,
  cookies: CdpCookie[],
  hostnames: Set<string>,
  context: Record<string, unknown>
): Promise<number> {
  const selected = cookies.filter((cookie) =>
    !isGoogleLoginHost(cookie.domain.replace(/^\./, ''))
    && [...hostnames].some((hostname) => cookieMatchesHost(cookie.domain, hostname))
  )
  let imported = 0
  writeExternalAuthLog('cookies-selected', { ...context, selected: selected.length, hostnames: [...hostnames] })
  for (const cookie of selected) {
    try {
      await targetSession.cookies.set(toElectronCookie(cookie))
      imported++
    } catch (error) {
      console.warn('[ExternalAuthCDP] cookie import skipped', {
        name: cookie.name,
        domain: cookie.domain,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
  if (imported > 0) await targetSession.cookies.flushStore()
  writeExternalAuthLog('cookies-imported', { ...context, imported })
  return imported
}

function resolveSeedUrl(authUrl: string, originalSiteUrl?: string): string | null {
  const queue = [authUrl]
  const visited = new Set<string>()
  while (queue.length > 0 && visited.size < 8) {
    const value = queue.shift()!
    if (visited.has(value)) continue
    visited.add(value)
    try {
      const parsed = new URL(value)
      for (const key of ['redirect_uri', 'continue', 'redirect', 'next']) {
        const nested = parsed.searchParams.get(key)
        if (!nested) continue
        const nestedUrl = new URL(nested)
        if (isCompletionUrl(nestedUrl.href)) return nestedUrl.href
        queue.push(nestedUrl.href)
      }
    } catch { /* 忽略无法解析的嵌套参数 */ }
  }
  if (originalSiteUrl) {
    try {
      const parsed = new URL(originalSiteUrl)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href
    } catch { /* 忽略无效页面地址 */ }
  }
  return null
}

function resolveTargetHostnames(authUrl: string, originalSiteUrl?: string): Set<string> {
  const hostnames = new Set<string>()
  const queue = [authUrl, originalSiteUrl].filter((value): value is string => !!value)
  const visited = new Set<string>()
  while (queue.length > 0 && visited.size < 12) {
    const value = queue.shift()!
    if (visited.has(value)) continue
    visited.add(value)
    try {
      const parsed = new URL(value)
      if (isCompletionUrl(parsed.href)) hostnames.add(parsed.hostname)
      for (const key of ['redirect_uri', 'continue', 'redirect', 'next']) {
        const nested = parsed.searchParams.get(key)
        if (nested) queue.push(nested)
      }
    } catch { /* 忽略无法解析的地址 */ }
  }
  return hostnames
}

async function seedTargetCookies(client: CdpClient, targetSession: Session, seedUrl: string | null): Promise<void> {
  if (!seedUrl) return
  const parsed = new URL(seedUrl)
  if (isGoogleLoginHost(parsed.hostname)) return
  const cookies = (await targetSession.cookies.get({})).filter((cookie) =>
    cookieMatchesHost(cookie.domain || parsed.hostname, parsed.hostname)
  )
  if (cookies.length === 0) return

  const params: CdpCookieParam[] = cookies.map((cookie) => {
    const item: CdpCookieParam = {
      name: cookie.name,
      value: cookie.value,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly
    }
    if (cookie.hostOnly) item.url = `${cookie.secure ? 'https' : 'http'}://${parsed.hostname}${cookie.path || '/'}`
    else item.domain = cookie.domain
    if (cookie.expirationDate) item.expires = cookie.expirationDate
    if (cookie.sameSite === 'strict') item.sameSite = 'Strict'
    else if (cookie.sameSite === 'lax') item.sameSite = 'Lax'
    else if (cookie.sameSite === 'no_restriction') item.sameSite = 'None'
    return item
  })
  await client.send('Network.setCookies', { cookies: params })
}

export async function startExternalBrowserAuth(
  browser: ExternalAuthBrowser,
  authUrl: string,
  targetSession: Session,
  containerId: string,
  originalSiteUrl?: string,
  operationId?: string
): Promise<ExternalAuthResult> {
  const profileDir = getProfileDir(browser, containerId)
  const context = { operationId, phase: 'start', browser, profileDir }
  writeExternalAuthLog('start', { ...context, authUrl: describeAuthUrl(authUrl), originalSiteUrl: describeAuthUrl(originalSiteUrl) })
  await stopVisibleBrowser(profileDir)
  writeExternalAuthLog('visible-browser-stopped', context)
  const endpoint = await openCdpEndpoint(browser, profileDir)
  if (!endpoint) {
    writeExternalAuthLog('failed', { ...context, error: 'cdp-endpoint-unavailable' })
    return {
      ok: false,
      error: '无法准备外部登录 Profile，请关闭该容器已打开的外部浏览器后重试。'
    }
  }

  const target = await openAuthTarget(endpoint)
  writeExternalAuthLog('auth-target', { ...context, endpoint, targetId: target?.id, targetUrl: describeAuthUrl(target?.url) })
  if (!target?.webSocketDebuggerUrl) return { ok: false, error: '无法准备外部登录页面' }

  const client = new CdpClient(context)
  try {
    await client.connect(target.webSocketDebuggerUrl)
    writeExternalAuthLog('cdp-connected', context)
    await Promise.all([client.send('Page.enable'), client.send('Network.enable')])
    const seedUrl = resolveSeedUrl(authUrl, originalSiteUrl)
    writeExternalAuthLog('seed-resolved', { ...context, seedUrl: describeAuthUrl(seedUrl) })
    await seedTargetCookies(client, targetSession, seedUrl)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    client.close()
    await closeCdpBrowser(endpoint, context)
  }

  await new Promise((resolve) => setTimeout(resolve, 500))
  if (!launchDedicatedBrowser(browser, profileDir, authUrl, false)) {
    writeExternalAuthLog('failed', { ...context, error: 'visible-browser-launch-failed' })
    return { ok: false, error: `未找到${browser === 'chrome' ? ' Chrome' : ' Edge'}浏览器` }
  }
  writeExternalAuthLog('pending', context)
  return { ok: true, pending: true }
}

export async function completeExternalBrowserAuth(
  browser: ExternalAuthBrowser,
  authUrl: string,
  targetSession: Session,
  containerId: string,
  originalSiteUrl?: string,
  operationId?: string
): Promise<ExternalAuthResult> {
  const profileDir = getProfileDir(browser, containerId)
  const context = { operationId, phase: 'complete', browser, profileDir }
  writeExternalAuthLog('start', { ...context, authUrl: describeAuthUrl(authUrl), originalSiteUrl: describeAuthUrl(originalSiteUrl) })
  await stopVisibleBrowser(profileDir)
  writeExternalAuthLog('visible-browser-stopped', context)
  const endpoint = await openCdpEndpoint(browser, profileDir)
  if (!endpoint) {
    writeExternalAuthLog('failed', { ...context, error: 'cdp-endpoint-unavailable' })
    return { ok: false, error: '无法读取登录结果，请先关闭外部登录浏览器后重试。' }
  }

  const target = await openAuthTarget(endpoint)
  if (!target?.webSocketDebuggerUrl) {
    writeExternalAuthLog('failed', { ...context, error: 'auth-target-unavailable' })
    return { ok: false, error: '无法读取外部登录 Profile' }
  }

  const client = new CdpClient(context)
  try {
    await client.connect(target.webSocketDebuggerUrl)
    writeExternalAuthLog('cdp-connected', context)
    await client.send('Network.enable')
    const result = await client.send<{ cookies: CdpCookie[] }>('Network.getAllCookies')
    writeExternalAuthLog('cookies-read', { ...context, count: result.cookies?.length || 0, domains: summarizeCookieDomains(result.cookies || []) })
    const seedUrl = resolveSeedUrl(authUrl, originalSiteUrl)
    const hostnames = resolveTargetHostnames(authUrl, originalSiteUrl)
    writeExternalAuthLog('target-hostnames', { ...context, seedUrl: describeAuthUrl(seedUrl), hostnames: [...hostnames] })
    const cookieCount = await importCookies(targetSession, result.cookies || [], hostnames, context)
    if (cookieCount === 0) {
      return { ok: false, error: '没有找到目标网站的登录 Cookie，请确认登录已完成并关闭外部浏览器。' }
    }
    writeExternalAuthLog('complete', { ...context, cookieCount, finalUrl: describeAuthUrl(seedUrl) })
    return { ok: true, cookieCount, finalUrl: seedUrl || undefined }
  } catch (error) {
    writeExternalAuthLog('failed', {
      ...context,
      error: error instanceof Error ? error.message : String(error)
    })
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    client.close()
    await closeCdpBrowser(endpoint, context)
    writeExternalAuthLog('complete-cleanup', context)
  }
}
