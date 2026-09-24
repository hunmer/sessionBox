import { readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ExtensionContext } from '../context'
import type { ExtensionEvent } from '../router'

type ExecuteScriptDetails = Record<string, any> & {
  target: chrome.scripting.InjectionTarget
  files?: string[]
  world?: 'ISOLATED' | 'MAIN'
  injectImmediately?: boolean
  args?: any[]
}

const readExtensionFiles = (extension: Electron.Extension, files: string[] = []): string => {
  const extensionRoot = resolve(extension.path)
  return files.map((file) => {
    const path = resolve(extensionRoot, file)
    const relativePath = relative(extensionRoot, path)
    if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      throw new Error(`Invalid scripting file path: ${file}`)
    }
    return readFileSync(path, 'utf8')
  }).join('\n')
}

export class ScriptingAPI {
  constructor(private ctx: ExtensionContext) {
    ctx.router.apiHandler()('scripting.executeScript', this.executeScript.bind(this), {
      permission: 'scripting',
    })
  }

  private async executeScript(event: ExtensionEvent, details: ExecuteScriptDetails): Promise<any[]> {
    const target = details?.target || {}
    const tabId = typeof target.tabId === 'number'
      ? target.tabId
      : this.ctx.store.getActiveTabOfCurrentWindow()?.id
    if (typeof tabId !== 'number') return []

    const tab = this.ctx.store.getTabById(tabId)
    if (!tab || tab.isDestroyed()) return []

    console.info('[electron-chrome-extensions] scripting.executeScript request', {
      extensionId: event.extension.id,
      tabId,
      files: details.files ?? [],
      allFrames: Boolean(target.allFrames),
      world: details.world ?? 'ISOLATED',
    })

    let code = readExtensionFiles(event.extension, details.files)
    if (typeof details.func === 'function') {
      code += `\n;(${details.func.toString()})(...${JSON.stringify(details.args || [])})`
    }
    if (typeof (details as any).code === 'string') code += `\n${(details as any).code}`
    if (!code) return []

    const frames: any[] = target.allFrames && 'mainFrame' in tab
      ? (tab.mainFrame as any).framesInSubtree
      : [tab.mainFrame]
    const results: any[] = []
    for (const frame of frames) {
      try {
        const result = await frame.executeJavaScript(code, true)
        results.push({ frameId: frame === frame.top ? 0 : frame.frameTreeNodeId, result })
      } catch (error) {
        results.push({
          frameId: frame === frame.top ? 0 : frame.frameTreeNodeId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    console.info('[electron-chrome-extensions] scripting.executeScript completed', {
      extensionId: event.extension.id,
      tabId,
      resultCount: results.length,
      errors: results.filter((item) => item?.error).map((item) => ({ frameId: item.frameId, error: item.error })),
    })
    return results
  }
}
