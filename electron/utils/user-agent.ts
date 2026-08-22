import { app, type Session } from 'electron'

// 跟随实际内核版本，升级 Electron 后 UA 自动保持最新
// （Google 登录风控会拦截版本过旧的浏览器，不能写死版本号）
const CHROME_VERSION = process.versions.chrome

const PLATFORM_UA =
  process.platform === 'darwin'
    ? 'Macintosh; Intel Mac OS X 10_15_7'
    : process.platform === 'win32'
      ? 'Windows NT 10.0; Win64; x64'
      : 'X11; Linux x86_64'

// 标准 Chrome UA（不含 Electron/应用名标识）
const CHROME_UA = `Mozilla/5.0 (${PLATFORM_UA}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`

// 移动端 Chrome UA
const MOBILE_CHROME_UA = `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Mobile Safari/537.36`

/**
 * 设置全局 UA 回退值，在 app ready 之前调用
 */
export function setupUserAgent(): void {
  app.userAgentFallback = CHROME_UA
}

/**
 * 获取指定账号的 User-Agent
 * 优先级：账号自定义 UA > 全局默认 Chrome UA
 */
export function getUserAgent(accountUserAgent?: string): string {
  return accountUserAgent || CHROME_UA
}

/** 移动端 UA（托盘小窗手机模式） */
export function getMobileUserAgent(): string {
  return MOBILE_CHROME_UA
}

// ===== Client Hints 改写 =====
// Chromium 发出的 Sec-CH-UA* 请求头只含 "Chromium" 品牌且版本为真实内核版本，
// 与伪装后的 Chrome UA 不一致，Google 登录风控据此识别并拦截嵌入式浏览器
// （报"此浏览器或应用可能不安全"）。这里按每个请求的 User-Agent
// 生成匹配的 Client Hints，只改写请求里已存在的头，不新增。
interface HintIdentity {
  brands: string
  fullVersionList: string
  fullVersion: string
  mobile: string
  platform: string
  platformVersion?: string
  model?: string
}

function buildHintIdentity(userAgent: string): HintIdentity | null {
  const match = userAgent.match(/Chrome\/([\d.]+)/)
  if (!match) return null

  const parts = match[1].split('.')
  while (parts.length < 4) parts.push('0')
  const fullVersion = parts.join('.')
  const major = parts[0]

  let platform = '"Windows"'
  let platformVersion: string | undefined
  let model: string | undefined
  if (/Android/.test(userAgent)) {
    platform = '"Android"'
    platformVersion = '"13.0.0"'
    model = '"Pixel 7"'
  } else if (/Macintosh|Mac OS X/.test(userAgent)) {
    platform = '"macOS"'
  } else if (/X11|Linux/.test(userAgent)) {
    platform = '"Linux"'
  }

  return {
    brands: `"Chromium";v="${major}", "Google Chrome";v="${major}", "Not_A Brand";v="8"`,
    fullVersionList: `"Chromium";v="${fullVersion}", "Google Chrome";v="${fullVersion}", "Not_A Brand";v="8.0.0.0"`,
    fullVersion,
    mobile: /Android|iPhone|iPad|Mobile/.test(userAgent) ? '?1' : '?0',
    platform,
    platformVersion,
    model
  }
}

function rewriteClientHints(
  headers: Record<string, string>,
  identity: HintIdentity
): Record<string, string> {
  const rewritten = { ...headers }
  for (const name of Object.keys(rewritten)) {
    switch (name.toLowerCase()) {
      case 'sec-ch-ua':
        rewritten[name] = identity.brands
        break
      case 'sec-ch-ua-mobile':
        rewritten[name] = identity.mobile
        break
      case 'sec-ch-ua-platform':
        rewritten[name] = identity.platform
        break
      case 'sec-ch-ua-platform-version':
        if (identity.platformVersion) rewritten[name] = identity.platformVersion
        break
      case 'sec-ch-ua-model':
        if (identity.model) rewritten[name] = identity.model
        break
      case 'sec-ch-ua-full-version-list':
        rewritten[name] = identity.fullVersionList
        break
      case 'sec-ch-ua-full-version':
        rewritten[name] = identity.fullVersion
        break
    }
  }
  return rewritten
}

const hintsInstalled = new WeakSet<Session>()

/**
 * 在 session 上安装 Client Hints 改写，同一 session 重复调用无副作用。
 * 注意：Electron 每个 session 只允许一个 onBeforeSendHeaders 监听，
 * 后注册的会整体覆盖，勿在其他模块对同一 session 再注册
 */
export function installClientHintsRewrite(ses: Session): void {
  if (hintsInstalled.has(ses)) return
  hintsInstalled.add(ses)

  ses.webRequest.onBeforeSendHeaders({ urls: ['https://*/*'] }, (details, callback) => {
    const headers = details.requestHeaders
    const ua = headers['User-Agent'] ?? headers['user-agent']
    const identity = ua ? buildHintIdentity(ua) : null
    callback({
      requestHeaders: identity ? rewriteClientHints(headers, identity) : headers
    })
  })
}
