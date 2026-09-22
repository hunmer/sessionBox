import { expect } from 'chai'
import { WebContentsView } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { useExtensionBrowser, useServer } from './hooks'

describe('chrome.userScripts alert', () => {
  const server = useServer()
  // Leave the initial window blank so observation starts before the first injection.
  const browser = useExtensionBrowser({ extensionName: 'chrome-userScripts-alert-mv3' })

  it('keeps the alert fixture identical to the manually loaded demo', () => {
    for (const file of ['background.js', 'userscript.js']) {
      expect(readFileSync(join(__dirname, 'fixtures/chrome-userScripts-alert-mv3', file), 'utf8'))
        .to.equal(readFileSync(join(__dirname, '../../../test-assets/chrome-popup-demo', file), 'utf8'))
    }
  })

  for (const host of ['BrowserWindow', 'WebContentsView']) {
    it(`opens alert(1) from a registered MV3 user script in ${host}`, async () => {
      const initialization = await browser.extensions.whenUserScriptsReady(browser.extension.id)
      expect(initialization.state).to.be.oneOf(['registered', 'restored'])
      expect(initialization.scriptCount).to.equal(1)

      const view = host === 'WebContentsView'
        ? new WebContentsView({ webPreferences: { session: browser.session } })
        : undefined
      if (view) {
        browser.window.contentView.addChildView(view)
        view.setBounds({ x: 0, y: 0, width: 640, height: 480 })
        browser.extensions.addTab(view.webContents, browser.window)
      }
      const wc = view?.webContents ?? browser.webContents
      let timer: ReturnType<typeof setTimeout> | undefined
      let dialogOpen = false
      const events: Array<{ method: string; params: any }> = []
      let resolveClosed: () => void
      let rejectClosed: (error: Error) => void
      const closed = new Promise<void>((resolve, reject) => {
        resolveClosed = resolve
        rejectClosed = reject
        timer = setTimeout(() => reject(new Error('No MV3 userScript alert(1) dialog within 4 seconds')), 4000)
      })
      const onMessage = (_event: Electron.Event, method: string, params: any) => {
        if (!method.startsWith('Page.javascriptDialog')) return
        events.push({ method, params })
        console.info('[MV3 alert test]', JSON.stringify({ time: new Date().toISOString(), host, method, params }))
        if (method === 'Page.javascriptDialogOpening') {
          dialogOpen = true
          void wc.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: true })
            .catch(rejectClosed)
        } else if (method === 'Page.javascriptDialogClosed') {
          dialogOpen = false
          resolveClosed()
        }
      }
      try {
        await wc.loadURL('about:blank')
        wc.debugger.attach('1.3')
        wc.debugger.on('message', onMessage)
        await wc.debugger.sendCommand('Page.enable')
        // Navigation and dialog handling must run concurrently: alert is modal.
        await Promise.all([closed, wc.loadURL(server.getUrl())])
        expect(events.map(({ method }) => method)).to.deep.equal([
          'Page.javascriptDialogOpening', 'Page.javascriptDialogClosed'
        ])
        expect(events[0].params.type).to.equal('alert')
        expect(events[0].params.message).to.equal('1')
        expect(events[0].params.url).to.equal(server.getUrl())
        expect(events[1].params.result).to.equal(true)
        expect(await wc.executeJavaScript(
          'document.documentElement.dataset.sessionBoxPopupDemoUserscript'
        )).to.equal('after-alert')
      } finally {
        if (timer) clearTimeout(timer)
        if (wc.debugger.isAttached()) {
          if (dialogOpen) await wc.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: false })
          wc.debugger.removeListener('message', onMessage)
          wc.debugger.detach()
        }
        if (view) {
          browser.window.contentView.removeChildView(view)
          wc.close()
        }
      }
    })
  }
})
