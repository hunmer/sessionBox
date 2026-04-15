import { app, net } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'

/** 网站图标本地缓存目录 */
const ICON_DIR = join(app.getPath('userData'), 'site-icons')

/** 支持的图标扩展名（按优先级排列） */
const ICON_EXTENSIONS = ['.png', '.ico', '.svg', '.jpg', '.jpeg']

/** 确保缓存目录存在 */
export function ensureIconDir(): void {
  if (!existsSync(ICON_DIR)) {
    mkdirSync(ICON_DIR, { recursive: true })
  }
}

/** 获取缓存目录路径 */
export function getSiteIconsDir(): string {
  return ICON_DIR
}

/** 根据域名获取可能的缓存文件路径（逐个扩展名探测） */
function findCachedIconPath(domain: string): string | null {
  for (const ext of ICON_EXTENSIONS) {
    const filePath = join(ICON_DIR, `${domain}${ext}`)
    if (existsSync(filePath)) return filePath
  }
  return null
}

/** 已知的图片格式魔术字节签名 */
const IMAGE_SIGNATURES: Array<{ check: (buf: Buffer) => boolean; ext: string }> = [
  { check: (buf) => buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47, ext: '.png' },   // PNG: ‰PNG
  { check: (buf) => buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF, ext: '.jpg' },                      // JPEG: ÿØÿ
  { check: (buf) => buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46, ext: '.gif' },                      // GIF: GIF87a / GIF89a
  { check: (buf) => buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50, ext: '.webp' }, // WEBP: RIFF....WEBP
  { check: (buf) => buf[0] === 0x00 && buf[1] === 0x00 && (buf[2] === 0x01 || buf[2] === 0x02) && buf[3] === 0x00, ext: '.ico' }, // ICO/CRS
]

/** 检测 Buffer 是否为有效图片格式，返回匹配的扩展名，否则返回 null */
function detectImageType(buf: Buffer): string | null {
  for (const sig of IMAGE_SIGNATURES) {
    if (buf.length >= 12 && sig.check(buf)) return sig.ext
  }
  // SVG 是文本格式，通过内容前缀判断
  const head = buf.toString('utf8', 0, Math.min(buf.length, 256)).trimStart()
  if (head.startsWith('<?xml') || head.startsWith('<svg')) return '.svg'
  return null
}

/** 从 content-type 推断扩展名，作为魔术字节的补充 */
function extFromContentType(contentType: string): string {
  if (contentType.includes('png')) return '.png'
  if (contentType.includes('svg')) return '.svg'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg'
  if (contentType.includes('gif')) return '.gif'
  if (contentType.includes('webp')) return '.webp'
  return '.ico'
}

/** 从远程 URL 下载图标并保存到本地缓存 */
async function downloadAndSave(iconUrl: string, domain: string): Promise<string | null> {
  try {
    const response = await net.fetch(iconUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/133.0.0.0' }
    })
    if (!response.ok) return null

    const contentType = response.headers.get('content-type') || ''

    // 拦截 HTML 响应（icon.horse 404 等场景会返回 text/html）
    if (contentType.includes('text/html')) return null

    const buffer = Buffer.from(await response.arrayBuffer())

    // 防止保存空文件
    if (buffer.length < 16) return null

    // 通过魔术字节验证是否为真实图片格式
    const detectedExt = detectImageType(buffer)
    if (!detectedExt) return null

    // 优先使用魔术字节的扩展名，回退到 content-type 推断
    const ext = detectedExt !== '.ico' ? detectedExt : extFromContentType(contentType)

    const filePath = join(ICON_DIR, `${domain}${ext}`)

    // 清除该域名的旧缓存（可能扩展名不同）
    clearDomainCache(domain)

    writeFileSync(filePath, buffer)
    return filePath
  } catch {
    return null
  }
}

/** 清除某个域名的所有缓存图标 */
function clearDomainCache(domain: string): void {
  for (const ext of ICON_EXTENSIONS) {
    const filePath = join(ICON_DIR, `${domain}${ext}`)
    if (existsSync(filePath)) {
      try { unlinkSync(filePath) } catch { /* 忽略删除失败 */ }
    }
  }
}

/**
 * 缓存远程 favicon URL 到本地。
 * 由 webview-manager 在 page-favicon-updated 事件中调用。
 */
export async function cacheFaviconFromUrl(faviconUrl: string, domain: string): Promise<string | null> {
  ensureIconDir()
  return downloadAndSave(faviconUrl, domain)
}

/**
 * 获取已缓存的图标文件路径。
 * 用于 site-icon:// 协议处理器快速查找。
 */
export function getCachedIconPath(domain: string): string | null {
  return findCachedIconPath(domain)
}

/** 获取兜底未知图标的文件路径（兼容开发与生产环境） */
export function getUnknownIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'unknow.ico')
    : join(__dirname, '../../resources/unknow.ico')
}

/**
 * 按策略获取并缓存网站图标：
 * 1. 先检查本地缓存
 * 2. 尝试常见 favicon 路径（/favicon.ico）
 * 3. 回退到 icon.horse 服务
 * 全部失败返回兜底 unknown 图标路径。
 */
export async function fetchAndCacheFavicon(domain: string): Promise<string> {
  ensureIconDir()

  // 1. 已有缓存，直接返回
  const cached = findCachedIconPath(domain)
  if (cached) return cached

  // 2. 尝试网站自身的 /favicon.ico
  const commonUrls = [
    `https://${domain}/favicon.ico`,
    `https://www.${domain}/favicon.ico`
  ]

  for (const url of commonUrls) {
    const result = await downloadAndSave(url, domain)
    if (result) return result
  }

  // 3. 回退到 icon.horse
  const result = await downloadAndSave(`https://icon.horse/icon/${domain}`, domain)
  if (result) return result

  // 4. 全部失败，返回兜底图标
  return getUnknownIconPath()
}
