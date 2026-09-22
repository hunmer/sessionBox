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

function executeBatch(scripts: DocumentUserScript[]): void {
  const batches = new Map<string, DocumentUserScript[]>()
  for (const script of scripts) {
    const key = `${script.world}:${script.extensionId}:${script.worldId}`
    const batch = batches.get(key) ?? []
    batch.push(script)
    batches.set(key, batch)
  }

  for (const scriptsInWorld of batches.values()) {
    const first = scriptsInWorld[0]
    const reportExecution = (script: DocumentUserScript, execution: Promise<unknown>) => {
      let timedOut = false
      const timeout = setTimeout(() => {
        timedOut = true
        report(script, 'failed', new Error(`User script execution did not settle within ${executionTimeoutMs}ms`))
      }, executionTimeoutMs)

      void execution.then(
        () => {
          clearTimeout(timeout)
          if (!timedOut) report(script, 'completed')
        },
        (error) => {
          clearTimeout(timeout)
          if (!timedOut) report(script, 'failed', error)
        }
      )
    }

    if (first.world === 'MAIN') {
      for (const script of scriptsInWorld) {
        report(script, 'started')
        reportExecution(script, webFrame.executeJavaScript(script.code))
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
        reportExecution(
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
      executeBatch(scripts)
    } else {
      addEventListener('load', () => executeBatch(scripts), { once: true })
    }
  } else if (runAt === 'document_end') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => executeBatch(scripts), { once: true })
    } else {
      executeBatch(scripts)
    }
  } else if (document.readyState === 'complete') {
    executeBatch(scripts)
  } else {
    addEventListener('load', () => executeBatch(scripts), { once: true })
  }
}

/** Runs before page JavaScript through the session frame preload. */
export function injectUserScriptsAtDocumentStart(): void {
  if (process.type !== 'renderer' || !canInjectHere()) return

  const scripts = ipcRenderer.sendSync(documentStartChannel, {
    url: location.href,
    topFrame: window.top === window
  }) as DocumentUserScript[]
  const byRunAt = new Map<DocumentUserScript['runAt'], DocumentUserScript[]>()
  for (const script of scripts) {
    const group = byRunAt.get(script.runAt) ?? []
    group.push(script)
    byRunAt.set(script.runAt, group)
  }
  for (const [runAt, scriptsAtRunAt] of byRunAt) schedule(runAt, scriptsAtRunAt)
}
