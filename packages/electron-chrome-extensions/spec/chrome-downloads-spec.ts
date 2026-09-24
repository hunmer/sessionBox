import { expect } from 'chai'
import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import * as http from 'node:http'
import { AddressInfo } from 'node:net'
import { useExtensionBrowser, useServer } from './hooks'
import { delay } from './spec-helpers'

describe('chrome.downloads', () => {
  const server = useServer()
  let slowServer: http.Server
  let slowUrl: string

  before(async () => {
    slowServer = http.createServer((_request, response) => {
      const chunk = Buffer.alloc(16 * 1024, 'x')
      const totalBytes = chunk.length * 128
      let sent = 0
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': totalBytes,
      })
      const timer = setInterval(() => {
        if (sent >= totalBytes) {
          clearInterval(timer)
          response.end()
          return
        }
        response.write(chunk)
        sent += chunk.length
      }, 20)
      response.once('close', () => clearInterval(timer))
    })
    await new Promise<void>((resolve) => slowServer.listen(0, '127.0.0.1', resolve))
    slowUrl = `http://127.0.0.1:${(slowServer.address() as AddressInfo).port}/slow.bin`
  })

  after(() => slowServer.close())
  const browser = useExtensionBrowser({
    url: server.getUrl,
    extensionName: 'rpc',
  })

  it('downloads a data URL and returns a download id', async () => {
    const filename = `sessionbox-download-mvp-${Date.now()}.txt`
    const filePath = join(app.getPath('downloads'), filename)
    try {
      const id = await browser.crx.exec('downloads.download', {
        url: 'data:text/plain,sessionbox-download-mvp',
        filename,
        saveAs: false,
      })
      expect(id).to.be.a('number')

      let body: string | undefined
      for (let attempt = 0; attempt < 20 && body === undefined; attempt += 1) {
        body = await fs.readFile(filePath, 'utf8').catch(() => undefined)
        if (body === undefined) await delay(50)
      }
      if (body === undefined) throw new Error(`download file was not created: ${filePath}`)
      expect(body).to.equal('sessionbox-download-mvp')
      let results: any[] = []
      for (let attempt = 0; attempt < 20; attempt += 1) {
        results = await browser.crx.exec('downloads.search', { id })
        if (results[0]?.state === 'complete') break
        await delay(50)
      }
      expect(results).to.have.length(1)
      expect(results[0].id).to.equal(id)
      expect(results[0].state).to.equal('complete')
      expect(results[0].exists).to.equal(true)
      expect(await browser.crx.exec('downloads.search', { query: ['sessionbox-download-mvp'] })).to.have.length(1)
      expect(await browser.crx.exec('downloads.getFileIcon', id, { size: 16 })).to.match(/^data:image\//)
      await browser.crx.exec('downloads.removeFile', id)
      expect(await fs.stat(filePath).catch(() => null)).to.equal(null)
      expect(await browser.crx.exec('downloads.erase', { id })).to.deep.equal([id])
      expect(await browser.crx.exec('downloads.search', { id })).to.deep.equal([])
    } finally {
      await fs.rm(filePath, { force: true })
    }
  })

  it('pauses, resumes, and cancels an active download', async () => {
    const filename = `sessionbox-download-control-${Date.now()}.bin`
    const filePath = join(app.getPath('downloads'), filename)
    try {
      const id = await browser.crx.exec('downloads.download', { url: slowUrl, filename })
      await browser.crx.exec('downloads.pause', id)
      let [item] = await browser.crx.exec('downloads.search', { id })
      expect(item.paused).to.equal(true)

      await browser.crx.exec('downloads.resume', id)
      ;[item] = await browser.crx.exec('downloads.search', { id })
      expect(item.paused).to.equal(false)

      await browser.crx.exec('downloads.cancel', id)
      for (let attempt = 0; attempt < 20; attempt += 1) {
        ;[item] = await browser.crx.exec('downloads.search', { id })
        if (item?.state === 'interrupted') break
        await delay(50)
      }
      expect(item.state).to.equal('interrupted')
      expect(item.error).to.equal('USER_CANCELED')
    } finally {
      await fs.rm(filePath, { force: true })
    }
  })
})
