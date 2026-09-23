import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
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
  return files.map((file) => {
    const path = resolve(extension.path, file)
    if (!path.startsWith(`${extension.path}${sep}`)) {
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
    return results
  }
}
