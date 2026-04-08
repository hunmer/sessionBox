import { app } from 'electron'

// 最新稳定版 Chrome UA（Windows 平台）
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'

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
