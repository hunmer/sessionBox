/**
 * 数据同步的 cookie 纯函数（不依赖 electron，便于单元测试）
 */

/** 可被同步的 Cookie 字段（与 Electron cookies.get 返回 / cookies.set 参数对齐） */
export interface SyncCookie {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  hostOnly?: boolean
  session?: boolean
  /** Unix 秒；缺省为会话 cookie */
  expirationDate?: number
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
}

/** 容器 id → session partition（与 webview-manager 保持一致） */
export function containerPartition(containerId: string): string {
  return containerId && containerId !== 'default' ? `persist:container-${containerId}` : ''
}

/** 从导出的 cookie 构造 set 时所需的 url */
export function cookieUrl(cookie: Pick<SyncCookie, 'domain' | 'path' | 'secure'>): string {
  const host = cookie.domain.replace(/^\./, '')
  const scheme = cookie.secure ? 'https' : 'http'
  return `${scheme}://${host}${cookie.path || '/'}`
}

/** cookie 去重键：同 domain+path+name 视为同一条 */
export function cookieKey(cookie: Pick<SyncCookie, 'domain' | 'path' | 'name'>): string {
  return `${cookie.domain}|${cookie.path}|${cookie.name}`
}

/** cookies.set 的参数结构（字段子集，Electron 兼容） */
export interface CookieSetDetails {
  url: string
  name: string
  value: string
  path: string
  secure: boolean
  httpOnly: boolean
  domain?: string
  expirationDate?: number
  sameSite?: 'no_restriction' | 'lax' | 'strict'
}

/** 把导出的 cookie 转换为 cookies.set 参数 */
export function cookieToSetDetails(cookie: SyncCookie): CookieSetDetails {
  const details: CookieSetDetails = {
    url: cookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    path: cookie.path || '/',
    secure: !!cookie.secure,
    httpOnly: !!cookie.httpOnly,
  }
  // hostOnly cookie 不能指定 domain（domain 会隐式取 url 的 host）；
  // 域 cookie 需要保留带点前缀的 domain
  if (!cookie.hostOnly && cookie.domain) {
    details.domain = cookie.domain
  }
  if (typeof cookie.expirationDate === 'number' && cookie.expirationDate > 0) {
    details.expirationDate = cookie.expirationDate
  }
  if (cookie.sameSite === 'no_restriction' || cookie.sameSite === 'lax' || cookie.sameSite === 'strict') {
    details.sameSite = cookie.sameSite
  }
  return details
}

/** 序列化 Electron cookies.get 的结果为可同步子集（剔除 set 不支持的派生字段） */
export function serializeCookie(raw: {
  name: string
  value: string
  domain?: string | undefined
  path?: string | undefined
  secure?: boolean | undefined
  httpOnly?: boolean | undefined
  hostOnly?: boolean | undefined
  session?: boolean | undefined
  expirationDate?: number | undefined
  sameSite?: string | null | undefined
}): SyncCookie {
  const cookie: SyncCookie = {
    name: raw.name,
    value: raw.value,
    domain: raw.domain ?? '',
    path: raw.path || '/',
    secure: !!raw.secure,
    httpOnly: !!raw.httpOnly,
  }
  if (raw.hostOnly) cookie.hostOnly = true
  if (raw.session) cookie.session = true
  if (typeof raw.expirationDate === 'number') cookie.expirationDate = raw.expirationDate
  if (
    raw.sameSite === 'no_restriction' ||
    raw.sameSite === 'lax' ||
    raw.sameSite === 'strict' ||
    raw.sameSite === 'unspecified'
  ) {
    cookie.sameSite = raw.sameSite
  }
  return cookie
}
