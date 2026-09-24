import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createSyncServer } from './sync-server.mjs'

async function withServer(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'sync-server-test-'))
  const server = createSyncServer({ dir })
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    await fn(base, dir)
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose))
    await rm(dir, { recursive: true, force: true })
  }
}

function request(method, url, body) {
  return fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

test('health endpoint reports ok', () =>
  withServer(async (base) => {
    const res = await request('GET', `${base}/api/health`)
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.ok, true)
    assert.ok(Array.isArray(data.types))
    assert.ok(data.types.includes('containers'))
  }))

test('PUT then GET roundtrips payload with updatedAt', () =>
  withServer(async (base, dir) => {
    const payload = { containers: [{ id: 'c1', name: '工作', icon: '📦', order: 0 }] }
    const put = await request('PUT', `${base}/api/user-a/containers`, { payload })
    assert.equal(put.status, 200)
    assert.equal((await put.json()).ok, true)

    const res = await request('GET', `${base}/api/user-a/containers`)
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.ok, true)
    assert.deepEqual(data.payload, payload)
    assert.ok(data.updatedAt > 0)

    // 落盘文件确实存在
    const onDisk = JSON.parse(await readFile(join(dir, 'user-a', 'containers.json'), 'utf-8'))
    assert.deepEqual(onDisk.payload, payload)
  }))

test('GET unknown user or type returns empty payload instead of error', () =>
  withServer(async (base) => {
    const res = await request('GET', `${base}/api/nobody/bookmarks`)
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.ok, true)
    assert.equal(data.payload, null)
    assert.equal(data.updatedAt, 0)
  }))

test('invalid user id is rejected to prevent path traversal', () =>
  withServer(async (base, dir) => {
    // '..' 会被 URL 解析归一化掉（404），空格/斜杠等非法字符被白名单拒绝（400），
    // 两种都视为拒绝；且 data 目录外不应产生任何文件
    for (const bad of ['%2E%2E', 'a/b', 'a%20b']) {
      const res = await request('GET', `${base}/api/${bad}/bookmarks`)
      assert.ok([400, 404].includes(res.status), `user "${bad}" should be rejected, got ${res.status}`)
    }
    const { readdir } = await import('node:fs/promises')
    assert.deepEqual(await readdir(dir), [])
  }))

test('invalid sync type is rejected', () =>
  withServer(async (base) => {
    const res = await request('PUT', `${base}/api/user-a/evil-type`, { payload: {} })
    assert.equal(res.status, 400)
    assert.equal((await res.json()).ok, false)
  }))

test('PUT without payload key is rejected', () =>
  withServer(async (base) => {
    const res = await request('PUT', `${base}/api/user-a/history`, { nope: 1 })
    assert.equal(res.status, 400)
  }))

test('DELETE removes stored type', () =>
  withServer(async (base) => {
    await request('PUT', `${base}/api/user-a/proxies`, { payload: [{ id: 'p1' }] })
    const del = await request('DELETE', `${base}/api/user-a/proxies`)
    assert.equal(del.status, 200)
    const data = await (await request('GET', `${base}/api/user-a/proxies`)).json()
    assert.equal(data.payload, null)
  }))

test('list endpoint returns stored types for user', () =>
  withServer(async (base) => {
    await request('PUT', `${base}/api/user-b/bookmarks`, { payload: [] })
    await request('PUT', `${base}/api/user-b/history`, { payload: [] })
    const data = await (await request('GET', `${base}/api/user-b`)).json()
    assert.equal(data.ok, true)
    assert.deepEqual(data.types.sort(), ['bookmarks', 'history'])
  }))
