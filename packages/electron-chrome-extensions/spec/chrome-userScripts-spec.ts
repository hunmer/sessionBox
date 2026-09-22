import { expect } from 'chai'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { useExtensionBrowser, useServer } from './hooks'

describe('chrome.userScripts', () => {
  const server = useServer()
  const browser = useExtensionBrowser({
    url: server.getUrl,
    extensionName: 'chrome-userScripts-mv3'
  })

  it('registers an MV3 user script and executes it in a document', async () => {
    // The MV3 service worker registers asynchronously after the extension is
    // loaded. Retry a navigation until the registration is observable.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await browser.webContents.loadURL(`${server.getUrl()}?attempt=${attempt}`)
      const executed = await browser.webContents.executeJavaScript(
        "document.documentElement.dataset.chromeUserScriptsMv3Probe"
      )
      if (executed === 'executed') return
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    expect.fail('The MV3 user script did not execute after registration')
  })

  it('persists registered MV3 user scripts in the session storage', async () => {
    const storagePath = browser.session.getStoragePath()
    expect(storagePath).to.be.a('string')

    const filePath = join(storagePath!, 'electron-chrome-extensions', 'user-scripts.json')
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (existsSync(filePath)) {
        const persisted = JSON.parse(readFileSync(filePath, 'utf8'))
        const scripts = persisted.extensions[browser.extension.id]?.scripts ?? []
        if (scripts.some((script: { id?: string }) => script.id === 'mv3-user-script-probe')) return
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    expect.fail('The MV3 user script registration was not persisted')
  })
})
