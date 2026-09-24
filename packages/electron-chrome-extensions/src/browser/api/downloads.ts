import { app, shell } from 'electron'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { ExtensionContext } from '../context'
import { ExtensionEvent } from '../router'

interface PendingDownload {
  id: number
  extensionId: string
  url: string
  filename?: string
  resolve: (id: number) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface DownloadRecord extends PendingDownload {
  item: Electron.DownloadItem
  state: chrome.downloads.DownloadState
  endTime?: string
  error?: chrome.downloads.DownloadInterruptReason
}

function normalizeFilename(filename: unknown): string | undefined {
  if (filename === undefined) return undefined
  if (typeof filename !== 'string' || !filename.trim()) throw new Error('Invalid download filename')
  const normalized = filename.replaceAll('\\', '/')
  if (path.posix.isAbsolute(normalized) || /^[a-z]:\//i.test(normalized) || normalized.split('/').includes('..')) {
    throw new Error('Download filename must be relative to the Downloads directory')
  }
  return normalized
}

/** Bridges Chrome downloads APIs to Electron Session.downloadURL and DownloadItem. */
export class DownloadsAPI {
  private nextId = 1
  private pending = new Map<string, PendingDownload[]>()
  private records = new Map<number, DownloadRecord>()

  constructor(private ctx: ExtensionContext) {
    const handle = this.ctx.router.apiHandler()
    handle('downloads.download', this.download, { permission: 'downloads' })
    handle('downloads.cancel', this.cancel, { permission: 'downloads' })
    handle('downloads.pause', this.pause, { permission: 'downloads' })
    handle('downloads.resume', this.resume, { permission: 'downloads' })
    handle('downloads.erase', this.erase, { permission: 'downloads' })
    handle('downloads.removeFile', this.removeFile, { permission: 'downloads' })
    handle('downloads.open', this.open, { permission: 'downloads' })
    handle('downloads.show', this.show, { permission: 'downloads' })
    handle('downloads.showDefaultFolder', this.showDefaultFolder, { permission: 'downloads' })
    handle('downloads.search', this.search, { permission: 'downloads' })
    handle('downloads.acceptDanger', this.acceptDanger, { permission: 'downloads' })
    handle('downloads.getFileIcon', this.getFileIcon, { permission: 'downloads' })
    this.ctx.session.on('will-download', this.onWillDownload)
    const sessionExtensions = ctx.session.extensions || ctx.session
    sessionExtensions.on('extension-unloaded', (_event, extension) => {
      for (const [url, requests] of this.pending) {
        for (const request of requests) {
          if (request.extensionId === extension.id) {
            clearTimeout(request.timer)
            request.reject(new Error('Extension unloaded before download started'))
          }
        }
        const remaining = requests.filter((request) => request.extensionId !== extension.id)
        if (remaining.length === 0) this.pending.delete(url)
        else this.pending.set(url, remaining)
      }
      for (const [id, record] of this.records) {
        if (record.extensionId === extension.id) this.records.delete(id)
      }
    })
  }

  private download = ({ extension }: ExtensionEvent, options: chrome.downloads.DownloadOptions) => {
    if (!options || typeof options.url !== 'string' || !options.url) {
      throw new Error('downloads.download requires a URL')
    }
    if (options.saveAs) throw new Error('downloads.download saveAs is not supported')
    if (options.method === 'POST' || options.body) {
      throw new Error('downloads.download POST requests are not supported')
    }

    const headers = options.headers?.reduce<Record<string, string>>((result, header) => {
      result[header.name] = header.value
      return result
    }, {})
    return new Promise<number>((resolve, reject) => {
      const id = this.nextId++
      const timer = setTimeout(() => {
        const queue = this.pending.get(options.url) || []
        const remaining = queue.filter((item) => item.id !== id)
        if (remaining.length) this.pending.set(options.url, remaining)
        else this.pending.delete(options.url)
        reject(new Error('Timed out waiting for download to start'))
      }, 10_000)
      const request: PendingDownload = {
        id,
        extensionId: extension.id,
        url: options.url,
        filename: normalizeFilename(options.filename),
        resolve,
        reject,
        timer,
      }
      const queue = this.pending.get(request.url) || []
      queue.push(request)
      this.pending.set(request.url, queue)

      try {
        this.ctx.session.downloadURL(request.url, headers ? { headers } : undefined)
      } catch (error) {
        clearTimeout(timer)
        this.pending.set(request.url, queue.filter((item) => item !== request))
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private onWillDownload = (_event: Electron.Event, item: Electron.DownloadItem) => {
    const url = item.getURL()
    const queue = this.pending.get(url)
    const request = queue?.shift()
    if (!request) return
    if (queue?.length) this.pending.set(url, queue)
    else this.pending.delete(url)

    if (request.filename) {
      item.setSavePath(path.join(app.getPath('downloads'), request.filename))
    }

    clearTimeout(request.timer)
    const record: DownloadRecord = { ...request, item, state: 'in_progress' }
    this.records.set(request.id, record)
    request.resolve(request.id)

    try {
      this.ctx.router.sendEvent(request.extensionId, 'downloads.onCreated', this.toChromeItem(record))
    } catch (error) {
      console.warn('[electron-chrome-extensions] downloads.onCreated dispatch failed', {
        id: request.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    item.on('updated', (_event, state) => {
      record.state = state === 'progressing' ? 'in_progress' : 'interrupted'
      if (state === 'progressing') {
        record.error = undefined
        record.endTime = undefined
      }
      try {
        this.ctx.router.sendEvent(request.extensionId, 'downloads.onChanged', {
          id: request.id,
          state: { current: this.toChromeItem(record).state },
          bytesReceived: { current: item.getReceivedBytes() },
          paused: { current: item.isPaused() },
        })
      } catch (error) {
        console.warn('[electron-chrome-extensions] downloads.onChanged dispatch failed', {
          id: request.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })
    item.once('done', (_event, state) => {
      record.state = state === 'completed' ? 'complete' : 'interrupted'
      record.endTime = new Date().toISOString()
      if (state === 'cancelled') record.error = 'USER_CANCELED'
      else if (state === 'interrupted') record.error = 'NETWORK_FAILED'
      this.ctx.router.sendEvent(request.extensionId, 'downloads.onChanged', {
        id: request.id,
        state: { current: record.state },
        filename: { current: this.getFilename(item) },
        ...(record.error ? { error: { current: record.error } } : {}),
      })
    })
  }

  private getFilename(item: Electron.DownloadItem): string {
    try {
      return item.getSavePath() || path.join(app.getPath('downloads'), item.getFilename())
    } catch {
      return path.join(app.getPath('downloads'), 'download')
    }
  }

  private toChromeItem(record: DownloadRecord): chrome.downloads.DownloadItem {
    const { item } = record
    const safe = <T>(read: () => T, fallback: T): T => {
      try {
        return read()
      } catch {
        return fallback
      }
    }
    const filename = this.getFilename(item)
    const urlChain = safe(() => item.getURLChain(), [])
    const startTime = safe(() => item.getStartTime(), Date.now() / 1000)
    return {
      id: record.id,
      url: record.url,
      finalUrl: urlChain[urlChain.length - 1] || record.url,
      filename,
      state: record.state,
      bytesReceived: safe(() => item.getReceivedBytes(), 0),
      totalBytes: safe(() => item.getTotalBytes(), 0),
      paused: safe(() => item.isPaused(), false),
      danger: 'safe',
      mime: safe(() => item.getMimeType(), ''),
      fileSize: safe(() => item.getTotalBytes(), 0),
      startTime: new Date(startTime * 1000).toISOString(),
      endTime: record.endTime,
      error: record.error,
      incognito: !this.ctx.session.isPersistent(),
      referrer: '',
      canResume: safe(() => item.canResume(), false),
      exists: existsSync(filename),
      byExtensionId: record.extensionId,
    }
  }

  private getRecord(extensionId: string, id: number): DownloadRecord {
    const record = this.records.get(id)
    if (!record || record.extensionId !== extensionId) throw new Error(`Unknown download id: ${id}`)
    return record
  }

  private cancel = ({ extension }: ExtensionEvent, id: number) => {
    this.getRecord(extension.id, id).item.cancel()
  }

  private pause = ({ extension }: ExtensionEvent, id: number) => {
    const item = this.getRecord(extension.id, id).item
    if (!item.isPaused()) item.pause()
  }

  private resume = ({ extension }: ExtensionEvent, id: number) => {
    const item = this.getRecord(extension.id, id).item
    if (item.canResume()) item.resume()
  }

  private removeFile = async ({ extension }: ExtensionEvent, id: number) => {
    const record = this.getRecord(extension.id, id)
    if (record.state !== 'complete') throw new Error('Download is not complete')
    const filename = this.getFilename(record.item)
    if (!existsSync(filename)) return
    await rm(filename, { force: true })
  }

  private open = async ({ extension }: ExtensionEvent, id: number) => {
    const permissions = extension.manifest.permissions as string[] | undefined
    if (!permissions?.includes('downloads.open')) {
      throw new Error('downloads.open requires the downloads.open permission')
    }
    const filename = this.getFilename(this.getRecord(extension.id, id).item)
    if (!existsSync(filename)) throw new Error('Downloaded file does not exist')
    const error = await shell.openPath(filename)
    if (error) throw new Error(error)
  }

  private show = ({ extension }: ExtensionEvent, id: number) => {
    const filename = this.getFilename(this.getRecord(extension.id, id).item)
    shell.showItemInFolder(filename)
  }

  private showDefaultFolder = () => {
    return shell.openPath(app.getPath('downloads')).then((error) => {
      if (error) throw new Error(error)
    })
  }

  private acceptDanger = ({ extension }: ExtensionEvent, id: number) => {
    this.getRecord(extension.id, id)
  }

  private getFileIcon = async (
    { extension }: ExtensionEvent,
    id: number,
    options: chrome.downloads.GetFileIconOptions = {},
  ) => {
    const filename = this.getFilename(this.getRecord(extension.id, id).item)
    const icon = await app.getFileIcon(filename, { size: options.size === 16 ? 'small' : 'normal' })
    return icon.toDataURL()
  }

  private search = ({ extension }: ExtensionEvent, query: chrome.downloads.DownloadQuery = {}) => {
    const records = [...this.records.values()].filter((record) => record.extensionId === extension.id)
    const urlPattern = query.urlRegex ? new RegExp(query.urlRegex) : undefined
    const filenamePattern = query.filenameRegex ? new RegExp(query.filenameRegex) : undefined
    const terms = query.query || []
    const filtered = records.filter((record) => {
      const item = this.toChromeItem(record)
      if (query.id !== undefined && item.id !== query.id) return false
      if (query.url !== undefined && item.url !== query.url) return false
      if (query.filename !== undefined && item.filename !== query.filename) return false
      if (query.state !== undefined && item.state !== query.state) return false
      if (query.paused !== undefined && item.paused !== query.paused) return false
      if (query.exists !== undefined && item.exists !== query.exists) return false
      if (query.totalBytes !== undefined && item.totalBytes !== query.totalBytes) return false
      if (query.bytesReceived !== undefined && item.bytesReceived !== query.bytesReceived) return false
      if (query.totalBytesGreater !== undefined && item.totalBytes <= query.totalBytesGreater) return false
      if (query.totalBytesLess !== undefined && item.totalBytes >= query.totalBytesLess) return false
      if (query.mime !== undefined && item.mime !== query.mime) return false
      if (query.danger !== undefined && item.danger !== query.danger) return false
      if (query.startedAfter !== undefined && item.startTime <= query.startedAfter) return false
      if (query.startedBefore !== undefined && item.startTime >= query.startedBefore) return false
      if (query.endedAfter !== undefined && (!item.endTime || item.endTime <= query.endedAfter)) return false
      if (query.endedBefore !== undefined && (!item.endTime || item.endTime >= query.endedBefore)) return false
      if (urlPattern && !urlPattern.test(item.url)) return false
      if (filenamePattern && !filenamePattern.test(item.filename)) return false
      return terms.every((term) => term.startsWith('-')
        ? !`${item.url} ${item.filename}`.includes(term.slice(1))
        : `${item.url} ${item.filename}`.includes(term))
    })
    const orderBy = query.orderBy || ['-startTime']
    filtered.sort((a, b) => {
      const left = this.toChromeItem(a)
      const right = this.toChromeItem(b)
      for (const field of orderBy) {
        const descending = field.startsWith('-')
        const key = descending ? field.slice(1) : field
        const leftValue = (left as any)[key] ?? ''
        const rightValue = (right as any)[key] ?? ''
        if (leftValue === rightValue) continue
        const result = leftValue > rightValue ? 1 : -1
        return descending ? -result : result
      }
      return 0
    })
    const limit = query.limit === 0 ? filtered.length : Math.max(0, query.limit ?? 1000)
    return filtered.slice(0, limit).map((record) => this.toChromeItem(record))
  }

  private erase = ({ extension }: ExtensionEvent, query: chrome.downloads.DownloadQuery = {}) => {
    const matches = this.search({ extension } as ExtensionEvent, query) as chrome.downloads.DownloadItem[]
    for (const item of matches) {
      this.records.delete(item.id)
      this.ctx.router.sendEvent(extension.id, 'downloads.onErased', item.id)
    }
    return matches.map((item) => item.id)
  }
}
