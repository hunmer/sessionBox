/**
 * 下载路径工具 - 主进程
 *
 * 职责：
 * 1. 无冲突文件名：目标路径已存在时自动追加序号（file.zip → file (1).zip）
 * 2. 分组目录：支持模板拼接（{host}/{type}/{date} 等变量），自动创建不存在的文件夹
 */

import { join, dirname, basename, extname } from 'path'
import { existsSync, mkdirSync } from 'fs'

/** 文件类型分类映射（与 DownloadsPage 的 FILE_EXTENSIONS 保持一致） */
const FILE_TYPE_MAP: Record<string, string[]> = {
  视频: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts'],
  音频: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus'],
  压缩包: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso', '.dmg'],
  图片: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff'],
  文档: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.md', '.rtf']
}

/** 从文件名提取扩展名（小写，含点号，如 ".zip"） */
export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot === -1) return ''
  return filename.slice(dot).toLowerCase()
}

/** 根据文件名推断文件类型分类名（视频/音频/...），未知返回 "其他" */
export function getFileType(filename: string): string {
  const ext = getFileExtension(filename)
  if (!ext) return '其他'
  for (const [type, exts] of Object.entries(FILE_TYPE_MAP)) {
    if (exts.includes(ext)) return type
  }
  return '其他'
}

/** 从 URL 提取站点 host */
export function getHost(url: string): string {
  try {
    return new URL(url).hostname || '未知站点'
  } catch {
    return '未知站点'
  }
}

/** 格式化当前日期为 YYYY-MM-DD */
function formatDate(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 解析分组模板为相对子目录路径。
 *
 * 模板变量（大小写不敏感）：
 *   {host}  - 站点域名，如 example.com
 *   {type}  - 文件类型分类，如 视频/音频/压缩包/图片/文档/其他
 *   {date}  - 当前日期 YYYY-MM-DD
 *
 * 支持多层级（用 / 或 \ 分隔），如 "{host}/{date}" → "example.com/2024-01-01"
 * 不分组（空字符串）时返回空字符串。
 *
 * @param template 分组模板字符串
 * @param context  变量上下文（url / filename）
 * @returns 相对子目录路径（不含首尾分隔符），不分组时为 ''
 */
export function resolveCategoryDir(
  template: string,
  context: { url: string; filename: string }
): string {
  const tpl = (template || '').trim()
  if (!tpl) return ''

  let host = ''
  let resolved = tpl
    // 先提取变量值（懒计算避免无用开销），再替换
    .replace(/\{host\}/gi, () => {
      host = getHost(context.url)
      return host
    })
    .replace(/\{type\}/gi, () => getFileType(context.filename))
    .replace(/\{date\}/gi, () => formatDate())

  // 规范化：统一分隔符为 /，去掉首尾分隔符，合并连续分隔符，移除非法字符
  resolved = resolved
    .replace(/[\\/]+/g, '/') // 统一分隔符
    .replace(/[<>:"|?*]/g, '_') // 替换 Windows 非法字符
    .replace(/^\/+|\/+$/g, '') // 去首尾
    .replace(/\/{2,}/g, '/') // 合并连续

  return resolved
}

/**
 * 解析最终的下载目录：基础目录 + 分组子目录，并自动创建不存在的目录。
 *
 * @param baseDir     基础下载目录（已解析的 downloadDir）
 * @param categoryDir 分组模板解析出的相对子目录（可为空）
 * @returns 最终绝对目录路径；baseDir 为空时返回空字符串
 */
export function ensureDownloadDir(baseDir: string, categoryDir: string): string {
  if (!baseDir) return ''
  const finalDir = categoryDir ? join(baseDir, categoryDir) : baseDir
  try {
    if (!existsSync(finalDir)) {
      mkdirSync(finalDir, { recursive: true })
    }
  } catch {
    // 目录创建失败不阻断下载（下载器自身会处理），仅记录
  }
  return finalDir
}

/**
 * 在指定目录下生成不冲突的文件名。
 * 若 dir/filename 已存在，追加序号：file.zip → file (1).zip → file (2).zip ...
 *
 * @param dir      目录绝对路径
 * @param filename 原始文件名
 * @returns 不冲突的文件名（仅文件名，不含目录）
 */
export function getUniqueFilename(dir: string, filename: string): string {
  if (!filename) return filename
  const target = join(dir, filename)
  if (!existsSync(target)) return filename

  const ext = extname(filename)
  const stem = ext ? basename(filename, ext) : filename
  let seq = 1
  // 上限保护，避免极端情况下死循环
  while (seq < 10000) {
    const candidate = `${stem} (${seq})${ext}`
    if (!existsSync(join(dir, candidate))) return candidate
    seq++
  }
  return filename
}

/**
 * 一次性解析下载保存信息：分组目录 + 无冲突文件名。
 * 供 aria2 与系统下载器共用，保证两条路径行为一致。
 *
 * @param baseDir    基础下载目录
 * @param filename   原始文件名
 * @param url        下载 URL（用于 host 变量）
 * @param category   分组模板（{host}/{type}/{date} 等）
 * @returns { dir: 最终目录, filename: 无冲突文件名 }
 */
export function resolveDownloadPath(
  baseDir: string,
  filename: string,
  url: string,
  category?: string
): { dir: string; filename: string } {
  if (!baseDir) return { dir: '', filename }
  const categoryDir = resolveCategoryDir(category || '', { url, filename })
  const dir = ensureDownloadDir(baseDir, categoryDir)
  const uniqueName = getUniqueFilename(dir, filename)
  return { dir, filename: uniqueName }
}
