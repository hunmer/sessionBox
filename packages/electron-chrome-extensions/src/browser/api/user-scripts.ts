import type { ExtensionEvent } from '../router'
import { matchesPattern } from './common'

type UserScript = chrome.userScripts.RegisteredUserScript & {
  matches?: string[]
  excludeMatches?: string[]
  includeGlobs?: string[]
  excludeGlobs?: string[]
}

function matchesScript(script: UserScript, url: string): boolean {
  const matches = script.matches ?? ['<all_urls>']
  if (!matches.some((pattern) => matchesPattern(pattern, url))) return false
  if (script.excludeMatches?.some((pattern) => matchesPattern(pattern, url))) return false
  return true
}

export class UserScriptsAPI {
  private scripts = new Map<string, Map<string, UserScript>>()
  private nextWorldId = 1000

  constructor(private ctx: { store: any }) {
    const handle = (ctx as any).router.apiHandler()
    handle('userScripts.register', this.register)
    handle('userScripts.unregister', this.unregister)
    handle('userScripts.update', this.update)
    handle('userScripts.getScripts', this.getScripts)
    handle('userScripts.configureWorld', this.configureWorld)
    this.ctx.store.on('tab-added', (tab: Electron.WebContents) => {
      this.attachTab(tab)
    })
  }

  private attachTab(tab: Electron.WebContents): void {
    const run = () => {
      if (tab.isDestroyed()) return
      const url = tab.getURL()
      for (const scripts of this.scripts.values()) {
        for (const script of scripts.values()) {
          if (!matchesScript(script, url)) continue
          const code = (script.js ?? []).map((item: any) => item.code).filter(Boolean).join('\n')
          if (!code) continue
          console.info('[electron-chrome-extensions] injecting user script', {
            extensionId: [...this.scripts.entries()].find(([, scripts]) => scripts.has(script.id!))?.[0],
            scriptId: script.id,
            url
          })
          void tab.executeJavaScriptInIsolatedWorld(this.nextWorldId++, [{ code }], false).catch((error) => {
            console.warn('[electron-chrome-extensions] user script injection failed', {
              scriptId: script.id,
              message: error instanceof Error ? error.message : String(error)
            })
          })
        }
      }
    }
    tab.on('did-finish-load', run)
    run()
  }

  private getExtensionScripts(extensionId: string): Map<string, UserScript> {
    let scripts = this.scripts.get(extensionId)
    if (!scripts) {
      scripts = new Map()
      this.scripts.set(extensionId, scripts)
    }
    return scripts
  }

  register = async (event: ExtensionEvent, scripts: UserScript[]): Promise<UserScript[]> => {
    const extensionId = event.extension.id
    const target = this.getExtensionScripts(extensionId)
    const registered = scripts.map((script) => ({
      ...script,
      id: script.id || `${extensionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    }))
    registered.forEach((script) => target.set(script.id!, script))
    console.info('[electron-chrome-extensions] user scripts registered', {
      extensionId,
      scriptIds: registered.map((script) => script.id)
    })
    for (const tab of this.ctx.store.tabs) this.attachTab(tab)
    return registered
  }

  unregister = async (event: ExtensionEvent, details: { ids: string[] }): Promise<void> => {
    const target = this.getExtensionScripts(event.extension.id)
    for (const id of details.ids) target.delete(id)
  }

  update = async (event: ExtensionEvent, scripts: UserScript[]): Promise<UserScript[]> => {
    const target = this.getExtensionScripts(event.extension.id)
    const updated = scripts.map((script) => ({ ...target.get(script.id!)!, ...script }))
    updated.forEach((script) => target.set(script.id!, script))
    return updated
  }

  getScripts = async (event: ExtensionEvent): Promise<UserScript[]> => {
    return [...this.getExtensionScripts(event.extension.id).values()]
  }

  configureWorld = async (): Promise<void> => {}
}
