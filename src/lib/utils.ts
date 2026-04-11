import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 从 URL 提取域名，解析失败时返回原字符串 */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** 根据 URL 获取网站 favicon 图标地址 */
export function getFaviconUrl(url: string): string {
  const domain = getDomain(url)
  return `https://icon.horse/icon/${domain}`
}
