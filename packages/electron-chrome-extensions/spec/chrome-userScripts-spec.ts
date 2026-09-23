import { expect } from 'chai'
import { BrowserWindow, ipcMain, session } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ElectronChromeExtensions } from '../'
import { useExtensionBrowser, useServer } from './hooks'

describe('chrome.userScripts', () => {
  const server = useServer()
  const browser = useExtensionBrowser({
    url: server.getUrl,
    extensionName: 'chrome-userScripts-mv3',
  })

  it('registers an MV3 user script and executes it in a document', async () => {
    // The MV3 service worker registers asynchronously after the extension is
    // loaded. Retry a navigation until the registration is observable.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await browser.webContents.loadURL(`${server.getUrl()}?attempt=${attempt}`)
      for (let responseAttempt = 0; responseAttempt < 20; responseAttempt += 1) {
        const executed = await browser.webContents.executeJavaScript(
          "document.documentElement.dataset.chromeUserScriptsMv3Probe === 'executed' && document.documentElement.dataset.chromeUserScriptsMv3RuntimeId === 'executed' && document.documentElement.dataset.chromeUserScriptsMv3RuntimeConnect === 'executed' && document.documentElement.dataset.chromeUserScriptsMv3RuntimePortSender === 'executed' && document.documentElement.dataset.chromeUserScriptsMv3RuntimeMessage === 'executed'"
        )
        if (executed === true) {
          const tabId = await browser.webContents.executeJavaScript(
            'document.documentElement.dataset.chromeUserScriptsMv3RuntimePortTabId'
          )
          expect(tabId).to.equal(String(browser.webContents.id))
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    expect.fail('The MV3 user script did not execute after registration')
  })

  it('sets and reads sidePanel behavior from an extension page', async () => {
    const extensionPage = new BrowserWindow({
      show: false,
      webPreferences: {
        session: browser.session,
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    try {
      await extensionPage.loadURL(`${browser.extension.url}extension-page.html`)
      const result = await extensionPage.webContents.executeJavaScript(`
        (async () => {
          await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
          return chrome.sidePanel.getPanelBehavior()
        })()
      `)
      expect(result).to.deep.equal({ openPanelOnActionClick: true })
    } finally {
      extensionPage.destroy()
    }
  })

  it('routes legacy extension.sendMessage from an MV3 extension page', async () => {
    const extensionPage = new BrowserWindow({
      show: false,
      webPreferences: {
        session: browser.session,
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    try {
      await extensionPage.loadURL(`${browser.extension.url}extension-page.html`)
      const result = await extensionPage.webContents.executeJavaScript(`
        new Promise((resolve) => {
          chrome.extension.sendMessage(
            { type: 'extension-page-message-probe', value: 'round-trip' },
            (response) => resolve({
              response,
              lastError: chrome.runtime.lastError?.message
            })
          )
        })
      `)

      expect(result.lastError).to.equal(undefined)
      expect(result.response).to.deep.equal({
        type: 'extension-page-message-response',
        value: 'round-trip',
      })
    } finally {
      extensionPage.destroy()
    }
  })

  it('does not route incoming port messages back to the service worker', async () => {
    await browser.extensions.whenUserScriptsReady(browser.extension.id)
    let missingExtensionId = 0
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
      if (args[0] === '[electron-chrome-extensions] unknown extension context' &&
          (args[1] as any)?.handlerName === 'runtime.portPostMessage' &&
          (args[1] as any)?.sessionStoragePath === browser.session.getStoragePath()) {
        missingExtensionId += 1
      }
      originalWarn(...args)
    }
    try {
      await browser.webContents.loadURL(`${server.getUrl()}?port-direction=1`)
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const received = await browser.webContents.executeJavaScript(
          "document.documentElement.dataset.chromeUserScriptsMv3RuntimePortSender === 'executed'"
        )
        if (received) break
        if (attempt === 39) expect.fail('The worker did not reply to the user script port')
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(missingExtensionId).to.equal(0)
    } finally {
      console.warn = originalWarn
    }
  })

  it('keeps tabs.sendMessage open for asynchronous user script responses', async () => {
    await browser.extensions.whenUserScriptsReady(browser.extension.id)
    await browser.webContents.loadURL(`${server.getUrl()}?tabs-message=1`)

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const ready = await browser.webContents.executeJavaScript(
        "document.documentElement.dataset.chromeUserScriptsMv3Probe === 'executed'"
      )
      if (ready) break
      if (attempt === 19) expect.fail('The MV3 user script message listener was not installed')
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    const extensionPage = new BrowserWindow({
      show: false,
      webPreferences: {
        session: browser.session,
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    try {
      await extensionPage.loadURL(`${browser.extension.url}extension-page.html`)
      const responses = await extensionPage.webContents.executeJavaScript(`
        (async () => {
          const send = (message) => new Promise((resolve) => {
            chrome.tabs.sendMessage(${browser.webContents.id}, message, (response) => {
              resolve({ response, lastError: chrome.runtime.lastError?.message })
            })
          })
          return {
            callback: await send({ type: 'tabs-message-async-callback-probe', value: 'callback' }),
            promise: await send({ type: 'tabs-message-promise-probe', value: 'promise' })
          }
        })()
      `)

      expect(responses.callback.lastError).to.equal(undefined)
      expect(responses.callback.response).to.deep.equal({
        type: 'tabs-message-async-callback-response',
        value: 'callback',
      })
      expect(responses.promise.lastError).to.equal(undefined)
      expect(responses.promise.response).to.deep.equal({
        type: 'tabs-message-promise-response',
        value: 'promise',
      })
    } finally {
      extensionPage.destroy()
    }
  })

  it('waits for MV3 user script initialization before the first navigation', async () => {
    const initialization = await browser.extensions.whenUserScriptsReady(browser.extension.id)
    expect(initialization.state).to.be.oneOf(['registered', 'restored'])
    expect(initialization.scriptCount).to.equal(4)

    await browser.webContents.loadURL(`${server.getUrl()}?barrier=1`)
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const probes = await browser.webContents.executeJavaScript(`[
        document.documentElement.dataset.chromeUserScriptsMv3Probe,
        document.documentElement.dataset.chromeUserScriptsMv3RuntimeConnect,
        document.documentElement.dataset.chromeUserScriptsMv3RuntimePortSender,
        document.documentElement.dataset.chromeUserScriptsMv3RuntimeMessage,
        document.documentElement.dataset.chromeUserScriptsMv3ProbeSecond,
        document.documentElement.dataset.chromeUserScriptsMv3PendingProbe,
        document.documentElement.dataset.chromeUserScriptsMv3WorldLimitProbe
      ]`)
      if (probes.every((probe: string | undefined) => probe === 'executed')) {
        const tabId = await browser.webContents.executeJavaScript(
          'document.documentElement.dataset.chromeUserScriptsMv3RuntimePortTabId'
        )
        expect(tabId).to.equal(String(browser.webContents.id))
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    expect.fail('The MV3 user scripts did not execute after the initialization barrier')
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

  it('installs one tabs response dispatcher across Session instances', async () => {
    expect(ipcMain.listenerCount('crx-tabs-message-response')).to.equal(1)

    const otherSession = session.fromPartition(`persist:tabs-dispatcher-${randomUUID()}`)
    const otherExtensions = new ElectronChromeExtensions({
      license: 'internal-license-do-not-use' as any,
      session: otherSession,
      async createTab() {
        throw new Error('createTab is not used by this test')
      },
    })
    await otherExtensions.whenReady()

    expect(ipcMain.listenerCount('crx-tabs-message-response')).to.equal(1)
  })

  it('releases runtime ports when their source tab is destroyed', async () => {
    await browser.extensions.whenUserScriptsReady(browser.extension.id)
    await browser.webContents.loadURL(`${server.getUrl()}?port-lifecycle=1`)
    const ports = (browser.extensions as any).api.runtime.ports as Map<string, unknown>

    for (let attempt = 0; attempt < 40 && ports.size === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(ports.size).to.be.greaterThan(0)

    const destroyed = new Promise<void>((resolve) => browser.webContents.once('destroyed', () => resolve()))
    browser.window.destroy()
    await destroyed
    expect(ports.size).to.equal(0)
  })
})
