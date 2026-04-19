const SUPPORTED_DROP_TYPES = [
  'Files',
  'text/uri-list',
  'text/html',
  'DownloadURL',
] as const

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

function filePathToUrl(filePath: string): string {
  const normalized = normalizeFilePath(filePath)

  if (normalized.startsWith('//')) {
    return encodeURI(`file:${normalized}`)
  }

  if (/^[A-Za-z]:\//.test(normalized)) {
    return encodeURI(`file:///${normalized}`)
  }

  return encodeURI(`file://${normalized.startsWith('/') ? '' : '/'}${normalized}`)
}

function isLikelyFilePath(text: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(text) || text.startsWith('\\\\')
}

function looksLikeUrl(text: string): boolean {
  return /[.:/]/.test(text) && !text.includes(' ')
}

function toNavigableUrl(text: string): string | null {
  const value = text.trim()
  if (!value) return null

  if (/^(https?|file):\/\//i.test(value)) {
    return value
  }

  if (isLikelyFilePath(value)) {
    return filePathToUrl(value)
  }

  if (looksLikeUrl(value)) {
    return `https://${value}`
  }

  return null
}

function extractUrlFromUriList(raw: string): string | null {
  const candidates = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  for (const candidate of candidates) {
    const url = toNavigableUrl(candidate)
    if (url) return url
  }

  return null
}

function extractUrlFromHtml(html: string): string | null {
  if (!html.trim()) return null

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const candidates = [
    doc.querySelector('a[href]')?.getAttribute('href'),
    doc.querySelector('img[src]')?.getAttribute('src'),
    doc.querySelector('source[src]')?.getAttribute('src'),
    doc.querySelector('[src]')?.getAttribute('src'),
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    const url = toNavigableUrl(candidate)
    if (url) return url
  }

  return null
}

function extractUrlFromDownloadUrl(raw: string): string | null {
  if (!raw) return null

  const firstSeparator = raw.indexOf(':')
  if (firstSeparator === -1) return null

  const secondSeparator = raw.indexOf(':', firstSeparator + 1)
  if (secondSeparator === -1) return null

  return toNavigableUrl(raw.slice(secondSeparator + 1))
}

function extractUrlFromFiles(dataTransfer: DataTransfer): string | null {
  const files = Array.from(dataTransfer.files ?? [])

  for (const file of files) {
    const filePath = (file as File & { path?: string }).path
    if (filePath) {
      return filePathToUrl(filePath)
    }
  }

  return null
}

export function hasSupportedExternalDrop(event: DragEvent): boolean {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) return false

  const types = Array.from(dataTransfer.types ?? [])
  return SUPPORTED_DROP_TYPES.some((type) => types.includes(type))
}

export function extractNavigableDropUrl(event: DragEvent): string | null {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) return null

  return (
    extractUrlFromFiles(dataTransfer)
    ?? extractUrlFromDownloadUrl(dataTransfer.getData('DownloadURL'))
    ?? extractUrlFromUriList(dataTransfer.getData('text/uri-list'))
    ?? extractUrlFromHtml(dataTransfer.getData('text/html'))
    ?? toNavigableUrl(dataTransfer.getData('text/plain'))
  )
}
