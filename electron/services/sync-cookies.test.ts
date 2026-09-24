import assert from 'node:assert/strict'
import test from 'node:test'

import {
  containerPartition,
  cookieKey,
  cookieToSetDetails,
  cookieUrl,
  serializeCookie,
} from './sync-cookies.ts'

test('container partition matches webview-manager convention', () => {
  assert.equal(containerPartition('abc'), 'persist:container-abc')
  assert.equal(containerPartition('default'), '')
  assert.equal(containerPartition(''), '')
})

test('cookie url uses scheme from secure flag and strips leading dot', () => {
  assert.equal(cookieUrl({ domain: '.example.com', path: '/', secure: true }), 'https://example.com/')
  assert.equal(cookieUrl({ domain: 'a.com', path: '/x', secure: false }), 'http://a.com/x')
})

test('hostOnly cookie omits domain in set details, domain cookie keeps it', () => {
  const hostOnly = cookieToSetDetails({
    name: 'sid',
    value: '1',
    domain: 'example.com',
    path: '/',
    secure: true,
    httpOnly: true,
    hostOnly: true,
  })
  assert.equal(hostOnly.domain, undefined)
  assert.equal(hostOnly.url, 'https://example.com/')

  const domainCookie = cookieToSetDetails({
    name: 'sid',
    value: '1',
    domain: '.example.com',
    path: '/',
    secure: false,
    httpOnly: false,
  })
  assert.equal(domainCookie.domain, '.example.com')
})

test('session cookies and sameSite are passed through correctly', () => {
  const details = cookieToSetDetails({
    name: 'a',
    value: 'b',
    domain: '.a.com',
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'lax',
  })
  assert.equal(details.sameSite, 'lax')
  assert.equal(details.expirationDate, undefined) // 会话 cookie

  const persistent = cookieToSetDetails({
    name: 'a',
    value: 'b',
    domain: '.a.com',
    path: '/',
    secure: true,
    httpOnly: false,
    expirationDate: 1893456000,
  })
  assert.equal(persistent.expirationDate, 1893456000)
})

test('serializeCookie keeps only syncable fields', () => {
  const cookie = serializeCookie({
    name: 'n',
    value: 'v',
    domain: '.d.com',
    path: '/',
    secure: true,
    httpOnly: false,
    hostOnly: false,
    session: true,
    expirationDate: 123,
    sameSite: 'lax',
    // 多余字段应被忽略
    priority: 'HIGH',
    sourcePort: 443,
  } as any)
  assert.deepEqual(cookie, {
    name: 'n',
    value: 'v',
    domain: '.d.com',
    path: '/',
    secure: true,
    httpOnly: false,
    session: true,
    expirationDate: 123,
    sameSite: 'lax',
  })
})

test('cookieKey distinguishes domain/path/name', () => {
  assert.notEqual(
    cookieKey({ domain: '.a.com', path: '/', name: 'x' }),
    cookieKey({ domain: '.b.com', path: '/', name: 'x' }),
  )
  assert.equal(
    cookieKey({ domain: '.a.com', path: '/', name: 'x' }),
    cookieKey({ domain: '.a.com', path: '/', name: 'x' }),
  )
})
