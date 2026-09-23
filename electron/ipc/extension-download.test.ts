import assert from 'node:assert/strict'
import test from 'node:test'

import { buildWebStoreDownloadUrl, readExtensionArchive } from './extension-download.ts'

test('Web Store download uses the running Chromium version', () => {
  const url = new URL(buildWebStoreDownloadUrl('bgnkhhnnamicmpeenaelnjfhikgbkllg', '140.0.7339.41'))

  assert.equal(url.searchParams.get('prodversion'), '140.0.7339.41')
  assert.equal(url.searchParams.get('response'), 'redirect')
  assert.equal(url.searchParams.get('acceptformat'), 'crx2,crx3')
  assert.equal(
    url.searchParams.get('x'),
    'id=bgnkhhnnamicmpeenaelnjfhikgbkllg&installsource=ondemand&uc'
  )
})

test('reports downloaded bytes and total while streaming an extension', async () => {
  const updates: Array<{ received: number; total: number | null }> = []
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(Uint8Array.from([1, 2]))
      controller.enqueue(Uint8Array.from([3, 4, 5]))
      controller.close()
    }
  }), { headers: { 'content-length': '5' } })

  const archive = await readExtensionArchive(response, (progress) => updates.push(progress))
  assert.deepEqual(archive, Buffer.from([1, 2, 3, 4, 5]))
  assert.deepEqual(updates.at(-1), { received: 5, total: 5 })
})

test('reports downloaded bytes when content length is unavailable', async () => {
  const updates: Array<{ received: number; total: number | null }> = []
  const response = new Response(new Uint8Array([1, 2, 3]))

  await readExtensionArchive(response, (progress) => updates.push(progress))
  assert.deepEqual(updates.at(-1), { received: 3, total: null })
})
