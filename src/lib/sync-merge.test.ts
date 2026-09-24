import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mergeById,
  mergeContainerCookies,
  mergeHistory,
  type SyncCookieItem,
} from './sync-merge.ts'

test('mergeById unions by id and resolves conflicts by preferRemote', () => {
  const local = [
    { id: 'a', name: 'A-local' },
    { id: 'b', name: 'B' },
  ]
  const remote = [
    { id: 'a', name: 'A-remote' },
    { id: 'c', name: 'C' },
  ]

  // 远端较新：冲突取远端
  const preferRemote = mergeById(local, remote, true)
  assert.deepEqual(
    preferRemote.map((i) => `${i.id}:${i.name}`).sort(),
    ['a:A-remote', 'b:B', 'c:C'],
  )

  // 本地较新：冲突保留本地
  const preferLocal = mergeById(local, remote, false)
  assert.deepEqual(
    preferLocal.map((i) => `${i.id}:${i.name}`).sort(),
    ['a:A-local', 'b:B', 'c:C'],
  )
})

test('mergeHistory dedupes by url+time, sorts desc and caps limit', () => {
  const local = [
    { url: 'https://a.com', title: 'A', time: 100 },
    { url: 'https://b.com', title: 'B', time: 300 },
  ]
  const remote = [
    { url: 'https://a.com', title: 'A', time: 100 }, // 重复
    { url: 'https://c.com', title: 'C', time: 200 },
  ]

  const merged = mergeHistory(local, remote, 10)
  assert.deepEqual(
    merged.map((e) => e.url),
    ['https://b.com', 'https://c.com', 'https://a.com'],
  )

  const capped = mergeHistory(local, remote, 2)
  assert.equal(capped.length, 2)
  assert.equal(capped[0].url, 'https://b.com')
})

test('mergeContainerCookies unions containers and merges by domain|path|name', () => {
  const cookie = (name: string, value: string): SyncCookieItem => ({
    name,
    value,
    domain: '.example.com',
    path: '/',
    secure: true,
    httpOnly: false,
  })

  const local = { c1: [cookie('sid', 'local-v')] }
  const remote = {
    c1: [cookie('sid', 'remote-v'), cookie('extra', 'x')],
    c2: [cookie('only-remote', 'y')],
  }

  // 远端较新：冲突 cookie 取远端
  const merged = mergeContainerCookies(local, remote, true)
  assert.equal(merged.c1.find((c) => c.name === 'sid')?.value, 'remote-v')
  assert.equal(merged.c1.length, 2)
  assert.equal(merged.c2.length, 1)

  // 本地较新：保留本地值，仍并入远端独有的 cookie
  const mergedLocal = mergeContainerCookies(local, remote, false)
  assert.equal(mergedLocal.c1.find((c) => c.name === 'sid')?.value, 'local-v')
  assert.equal(mergedLocal.c1.find((c) => c.name === 'extra')?.value, 'x')
})
