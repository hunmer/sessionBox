import { ipcRenderer, webFrame } from 'electron'
import type { DocumentUserScript } from '../browser/api/user-scripts'

const documentStartChannel = 'crx-user-scripts:document-start'
const executionChannel = 'crx-user-scripts:execution'
const executionTimeoutMs = 5_000

function canInjectHere(): boolean {
  try {
    return ['http:', 'https:', 'file:'].includes(new URL(location.href).protocol)
  } catch {
    return false
  }
}

function report(script: DocumentUserScript, status: 'started' | 'completed' | 'failed', error?: unknown): void {
  ipcRenderer.send(executionChannel, {
    extensionId: script.extensionId,
    scriptId: script.scriptId,
    runAt: script.runAt,
    status,
    url: location.href,
    ...(error ? { error: error instanceof Error ? error.message : String(error) } : {})
  })
}

async function executeBatch(scripts: DocumentUserScript[]): Promise<void> {
  const batches = new Map<string, DocumentUserScript[]>()
  for (const script of scripts) {
    const key = `${script.world}:${script.extensionId}:${script.worldId}`
    const batch = batches.get(key) ?? []
    batch.push(script)
    batches.set(key, batch)
  }

  for (const scriptsInWorld of batches.values()) {
    const first = scriptsInWorld[0]
    const reportExecution = async (script: DocumentUserScript, execution: Promise<unknown>) => {
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          execution,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error(`User script execution did not settle within ${executionTimeoutMs}ms`)),
              executionTimeoutMs
            )
          })
        ])
        report(script, 'completed')
      } catch (error) {
        report(script, 'failed', error)
      } finally {
        if (timeout) clearTimeout(timeout)
      }
    }

    if (first.world === 'MAIN') {
      for (const script of scriptsInWorld) {
        report(script, 'started')
        await reportExecution(script, webFrame.executeJavaScript(script.code))
      }
      continue
    }

    try {
      // Chromium supplies a working default isolated world. Overriding its
      // security origin for every script causes otherwise valid MV3 scripts
      // to fail in Electron. Only configure a world when the extension has
      // explicitly supplied a CSP through chrome.userScripts.configureWorld.
      if (first.worldCsp) {
        webFrame.setIsolatedWorldInfo(first.worldId, {
          securityOrigin: first.worldOrigin,
          csp: first.worldCsp,
          name: first.worldName
        })
      }
      for (const script of scriptsInWorld) {
        report(script, 'started')
        await reportExecution(
          script,
          webFrame.executeJavaScriptInIsolatedWorld(first.worldId, [{ code: script.code }])
        )
      }
    } catch (error) {
      scriptsInWorld.forEach((script) => report(script, 'failed', error))
    }
  }
}

function schedule(runAt: DocumentUserScript['runAt'], scripts: DocumentUserScript[]): void {
  if (runAt === 'document_start') {
    // Electron does not expose Chromium's native userScripts injection hook.
    // Running arbitrary extension code from the frame preload can stall the
    // navigation, so use the first stable page lifecycle point instead.
    if (document.readyState === 'complete') {
      void executeBatch(scripts)
    } else {
      addEventListener('load', () => void executeBatch(scripts), { once: true })
    }
  } else if (runAt === 'document_end') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => void executeBatch(scripts), { once: true })
    } else {
      void executeBatch(scripts)
    }
  } else if (document.readyState === 'complete') {
    void executeBatch(scripts)
  } else {
    addEventListener('load', () => void executeBatch(scripts), { once: true })
  }
}

/** Runs before page JavaScript through the session frame preload. */
export function injectUserScriptsAtDocumentStart(): void {
  if (process.type !== 'renderer' || !canInjectHere()) return

  const resolveAndSchedule = () => {
    void ipcRenderer
      .invoke(documentStartChannel, {
        url: location.href,
        topFrame: window.top === window
      })
      .then((scripts: DocumentUserScript[]) => {
        const byRunAt = new Map<DocumentUserScript['runAt'], DocumentUserScript[]>()
        for (const script of scripts) {
          const group = byRunAt.get(script.runAt) ?? []
          group.push(script)
          byRunAt.set(script.runAt, group)
        }
        for (const [runAt, scriptsAtRunAt] of byRunAt) schedule(runAt, scriptsAtRunAt)
      })
      .catch((error) => {
        console.error('[electron-chrome-extensions] unable to resolve document user scripts', error)
      })
  }

  if (document.readyState === 'complete') resolveAndSchedule()
  else addEventListener('load', resolveAndSchedule, { once: true })
}
