import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { getAria2Config } from './aria2'

/** 外部下载程序变量替换的可用变量 */
export interface ExternalDownloadVars {
  url: string
  filename?: string
  referer?: string
}

/** 外部下载器是否已启用且配置了可执行文件路径 */
export function isExternalDownloaderReady(): boolean {
  const config = getAria2Config()
  return !!(config.externalDownloaderEnabled && config.externalDownloaderPath?.trim())
}

/**
 * shell 风格拆分参数字符串（支持双/单引号包裹含空格的片段）。
 * 不支持反斜杠转义，Windows 路径原样保留。
 */
export function tokenizeArgs(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let hasToken = false
  for (const ch of input) {
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch
      hasToken = true
    } else if (ch === ' ' || ch === '\t') {
      if (current || hasToken) tokens.push(current)
      current = ''
      hasToken = false
    } else {
      current += ch
      hasToken = true
    }
  }
  if (current || hasToken) tokens.push(current)
  return tokens
}

/** 把参数模板按变量展开为 argv；模板不含 {url} 时把下载地址追加到末尾 */
export function buildExternalArgv(argsTemplate: string, vars: ExternalDownloadVars): string[] {
  const template = argsTemplate.trim()
  if (!template) return [vars.url]

  const replace = (s: string) =>
    s
      .replace(/\{url\}/gi, vars.url)
      .replace(/\{filename\}/gi, vars.filename || '')
      .replace(/\{referer\}/gi, vars.referer || '')

  const argv = tokenizeArgs(template).map(replace).filter((a) => a.length > 0)
  if (!/\{url\}/i.test(template)) argv.push(vars.url)
  return argv
}

/**
 * 启动外部下载程序接管下载。
 * 同步返回是否成功启动（含路径存在性预检），失败时调用方可回退到系统下载器。
 */
export function launchExternalDownload(vars: ExternalDownloadVars): boolean {
  const config = getAria2Config()
  const exePath = config.externalDownloaderPath?.trim()
  if (!config.externalDownloaderEnabled || !exePath) return false

  // 带路径分隔符的按文件存在性预检；裸命令名（依赖 PATH）交给 spawn 报错
  if (/[\\/]/.test(exePath) && !existsSync(exePath)) {
    console.error('[ExternalDownloader] 可执行文件不存在:', exePath)
    return false
  }

  const argv = buildExternalArgv(config.externalDownloaderArgs ?? '', vars)
  try {
    const child = spawn(exePath, argv, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    child.unref()
    child.once('error', (e) => console.error('[ExternalDownloader] 启动失败:', e))
    console.log('[ExternalDownloader] 已转交外部程序:', exePath, argv.join(' '))
    return true
  } catch (e) {
    console.error('[ExternalDownloader] 启动异常:', e)
    return false
  }
}
