import { app, session } from 'electron'
import * as http from 'node:http'
import * as https from 'node:https'
import * as net from 'node:net'
import * as tls from 'node:tls'
import type { Proxy } from './store'

const TEST_TARGET_HOST = 'httpbin.org'
const TEST_TARGET_PORT = 443
const TEST_TARGET_PATH = '/ip'
const REQUEST_TIMEOUT_MS = 15000

const sessionProxyAuthMap = new WeakMap<Electron.Session, Proxy>()
const proxyEndpointAuthMap = new Map<string, Proxy>()
const sessionLabelMap = new WeakMap<Electron.Session, string>()

let proxyAuthHandlerInitialized = false

function getProxyMode(proxy: Proxy): NonNullable<Proxy['proxyMode']> {
  return proxy.proxyMode ?? 'global'
}

function getProxyType(proxy: Proxy): NonNullable<Proxy['type']> {
  return proxy.type ?? 'socks5'
}

function getProxyEndpointKey(host: string, port: number | string): string {
  return `${host}:${Number(port)}`
}

function describeProxy(proxy: Proxy): string {
  return JSON.stringify({
    name: proxy.name,
    proxyMode: getProxyMode(proxy),
    type: proxy.type ?? '',
    host: proxy.host ?? '',
    port: proxy.port ?? '',
    username: proxy.username ?? '',
    passwordLength: proxy.password?.length ?? 0,
    pacScriptLength: proxy.pacScript?.length ?? 0,
    pacUrl: proxy.pacUrl ?? ''
  })
}

function getSessionLabel(ses?: Electron.Session): string {
  if (!ses) return 'unknown'
  return sessionLabelMap.get(ses) ?? 'unknown'
}

function getProxyAuthorizationValue(proxy: Proxy): string | null {
  if (!proxy.username) return null
  const token = Buffer.from(`${proxy.username}:${proxy.password || ''}`, 'utf8').toString('base64')
  return `Basic ${token}`
}

function assertGlobalProxyServer(proxy: Proxy): { host: string; port: number } {
  const host = proxy.host?.trim()
  const port = Number(proxy.port)
  if (!host || !Number.isFinite(port) || port <= 0) {
    throw new Error('全局代理模式需要有效的主机地址和端口')
  }
  return { host, port }
}

function buildPacDataUrl(content: string): string {
  return `data:application/x-ns-proxy-autoconfig;base64,${Buffer.from(content, 'utf8').toString('base64')}`
}

function buildPacProxyTarget(proxy: Proxy): string {
  const { host, port } = assertGlobalProxyServer(proxy)
  return `${getProxyType(proxy) === 'socks5' ? 'SOCKS5' : 'PROXY'} ${host}:${port}`
}

function buildGlobalPacScript(proxy: Proxy): string {
  return [
    'function FindProxyForURL(url, host) {',
    `  return '${buildPacProxyTarget(proxy)}';`,
    '}'
  ].join('\n')
}

function normalizeCustomPacScript(content?: string): string {
  const trimmed = content?.trim() ?? ''
  if (!trimmed) {
    throw new Error('自定义模式需要填写 PAC 脚本内容')
  }

  if (trimmed.includes('function FindProxyForURL')) {
    return trimmed
  }

  return [
    'function FindProxyForURL(url, host) {',
    trimmed,
    '}'
  ].join('\n')
}

export function buildProxyConfig(proxy: Proxy): Electron.ProxyConfig {
  const proxyMode = getProxyMode(proxy)

  if (proxyMode === 'custom') {
    return {
      mode: 'pac_script',
      pacScript: buildPacDataUrl(normalizeCustomPacScript(proxy.pacScript))
    }
  }

  if (proxyMode === 'pac_url') {
    const pacUrl = proxy.pacUrl?.trim()
    if (!pacUrl) {
      throw new Error('PAC 地址模式需要填写 PAC URL')
    }

    return {
      mode: 'pac_script',
      pacScript: pacUrl
    }
  }

  return {
    mode: 'pac_script',
    pacScript: buildPacDataUrl(buildGlobalPacScript(proxy))
  }
}

export async function applyProxyToSession(ses: Electron.Session, proxy: Proxy | null): Promise<void> {
  await ses.closeAllConnections()

  if (!proxy) {
    unregisterProxyAuth(ses)
    sessionLabelMap.set(ses, 'direct')
    await ses.setProxy({ mode: 'direct' })
    return
  }

  const proxyMode = getProxyMode(proxy)
  sessionLabelMap.set(ses, `${proxyMode}:${proxy.name}`)

  if (proxyMode === 'global' && proxy.username) {
    const { host, port } = assertGlobalProxyServer(proxy)
    registerProxyAuth(ses, { ...proxy, host, port })
  } else {
    unregisterProxyAuth(ses)
  }

  await ses.setProxy(buildProxyConfig(proxy))
}

export async function fetchSessionExitIp(ses: Electron.Session): Promise<string> {
  return await withTimeout(async () => {
    const response = await ses.fetch(`https://${TEST_TARGET_HOST}${TEST_TARGET_PATH}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'session-box-proxy-test'
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json() as { origin?: string }
    if (!data.origin || typeof data.origin !== 'string') {
      throw new Error('Invalid IP response')
    }

    return data.origin
  }, 'Session exit ip fetch')
}

async function testProxyThroughElectronSession(proxy: Proxy): Promise<{ ok: boolean; ip?: string; error?: string }> {
  return await withTimeout(async () => {
    const partition = `proxy-test:${Date.now()}:${Math.random().toString(36).slice(2)}`
    const ses = session.fromPartition(partition)

    try {
      await applyProxyToSession(ses, proxy)

      return {
        ok: true,
        ip: await fetchSessionExitIp(ses)
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    } finally {
      await applyProxyToSession(ses, null).catch(() => undefined)
    }
  }, 'Electron session proxy test')
}

function ensureProxyAuthHandler(): void {
  if (proxyAuthHandlerInitialized) return

  console.log('[ProxyAuth] initialize global login handler')

  app.on('login', (event, webContents, _request, authInfo, callback) => {
    if (!authInfo.isProxy) return

    const sessionProxy = webContents ? sessionProxyAuthMap.get(webContents.session) : undefined
    const endpointProxy = proxyEndpointAuthMap.get(getProxyEndpointKey(authInfo.host, authInfo.port))
    const proxy = sessionProxy ?? endpointProxy

    console.log('[ProxyAuth] login event', {
      hasWebContents: !!webContents,
      partition: getSessionLabel(webContents?.session),
      authHost: authInfo.host,
      authPort: authInfo.port,
      realm: authInfo.realm,
      scheme: authInfo.scheme,
      matchedBySession: !!sessionProxy,
      matchedByEndpoint: !!endpointProxy,
      hasProxyCredentials: !!proxy?.username
    })

    if (!proxy?.username) return

    event.preventDefault()
    console.log('[ProxyAuth] credentials applied', {
      partition: getSessionLabel(webContents?.session),
      proxy: describeProxy(proxy)
    })
    callback(proxy.username, proxy.password || '')
  })

  proxyAuthHandlerInitialized = true
}

export function registerProxyAuth(ses: Electron.Session, proxy: Proxy): void {
  ensureProxyAuthHandler()
  const { host, port } = assertGlobalProxyServer(proxy)
  sessionLabelMap.set(ses, `${getProxyType(proxy)}://${host}:${port}`)

  if (!proxy.username) {
    console.log('[ProxyAuth] unregister because proxy has no username', {
      partition: getSessionLabel(ses),
      proxy: describeProxy(proxy)
    })
    unregisterProxyAuth(ses)
    return
  }

  sessionProxyAuthMap.set(ses, proxy)
  proxyEndpointAuthMap.set(getProxyEndpointKey(host, port), { ...proxy, host, port })

  console.log('[ProxyAuth] register', {
    partition: getSessionLabel(ses),
    proxy: describeProxy(proxy)
  })
}

export function unregisterProxyAuth(ses: Electron.Session): void {
  const existingProxy = sessionProxyAuthMap.get(ses)

  if (existingProxy) {
    const { host, port } = assertGlobalProxyServer(existingProxy)
    proxyEndpointAuthMap.delete(getProxyEndpointKey(host, port))
    console.log('[ProxyAuth] unregister', {
      partition: getSessionLabel(ses),
      proxy: describeProxy(existingProxy)
    })
  }

  sessionProxyAuthMap.delete(ses)
}

function withTimeout<T>(promiseFactory: () => Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${REQUEST_TIMEOUT_MS}ms`))
    }, REQUEST_TIMEOUT_MS)

    void promiseFactory()
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

function requestThroughTlsSocket(socket: tls.TLSSocket, proxy: Proxy): Promise<{ ok: boolean; ip?: string; error?: string }> {
  return new Promise((resolve) => {
    let settled = false
    let raw = ''

    const finish = (result: { ok: boolean; ip?: string; error?: string }): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }

    socket.setEncoding('utf8')
    socket.setTimeout(REQUEST_TIMEOUT_MS, () => {
      finish({ ok: false, error: 'Target request timeout' })
    })

    socket.on('data', (chunk: string) => {
      raw += chunk
    })

    socket.on('error', (error) => {
      console.error('[ProxyTestNative] target socket error', {
        proxyType: proxy.type,
        message: error.message
      })
      finish({ ok: false, error: error.message })
    })

    socket.on('end', () => {
      const separator = '\r\n\r\n'
      const headerEnd = raw.indexOf(separator)
      if (headerEnd === -1) {
        finish({ ok: false, error: 'Invalid target response' })
        return
      }

      const headerText = raw.slice(0, headerEnd)
      const body = raw.slice(headerEnd + separator.length)
      const statusLine = headerText.split('\r\n')[0] || ''
      const match = statusLine.match(/^HTTP\/\d\.\d\s+(\d{3})/)
      const statusCode = match ? Number(match[1]) : 0

      console.log('[ProxyTestNative] target response', {
        proxyType: proxy.type,
        statusCode,
        body
      })

      if (statusCode !== 200) {
        finish({ ok: false, error: `Target HTTP ${statusCode || 'unknown'}` })
        return
      }

      try {
        const data = JSON.parse(body) as { origin: string }
        finish({ ok: true, ip: data.origin })
      } catch {
        finish({ ok: false, error: '解析响应失败' })
      }
    })

    const requestText = [
      `GET ${TEST_TARGET_PATH} HTTP/1.1`,
      `Host: ${TEST_TARGET_HOST}`,
      'Accept: application/json',
      'Connection: close',
      'User-Agent: session-box-proxy-test',
      '',
      ''
    ].join('\r\n')

    socket.write(requestText)
  })
}

function createTlsTunnel(socket: net.Socket, proxy: Proxy, head?: Buffer): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    if (head && head.length > 0) {
      socket.unshift(head)
    }

    const tlsSocket = tls.connect({
      socket,
      servername: TEST_TARGET_HOST
    })

    tlsSocket.setTimeout(REQUEST_TIMEOUT_MS, () => {
      tlsSocket.destroy(new Error('TLS tunnel timeout'))
    })

    tlsSocket.once('secureConnect', () => {
      console.log('[ProxyTestNative] tls tunnel established', {
        proxyType: proxy.type,
        proxyHost: proxy.host,
        proxyPort: proxy.port
      })
      resolve(tlsSocket)
    })

    tlsSocket.once('error', reject)
  })
}

function testHttpConnectProxy(proxy: Proxy): Promise<{ ok: boolean; ip?: string; error?: string }> {
  return withTimeout(async () => {
    const { host, port } = assertGlobalProxyServer(proxy)
    console.log('[ProxyTestNative] begin http connect', {
      proxy: describeProxy(proxy)
    })

    const headers: Record<string, string> = {
      Host: `${TEST_TARGET_HOST}:${TEST_TARGET_PORT}`,
      Connection: 'keep-alive',
      'Proxy-Connection': 'keep-alive',
      'User-Agent': 'session-box-proxy-test'
    }

    const authorization = getProxyAuthorizationValue(proxy)
    if (authorization) {
      headers['Proxy-Authorization'] = authorization
    }

    const requestModule = proxy.type === 'https' ? https : http

    return await new Promise<{ ok: boolean; ip?: string; error?: string }>((resolve) => {
      let settled = false

      const finish = (result: { ok: boolean; ip?: string; error?: string }): void => {
        if (settled) return
        settled = true
        resolve(result)
      }

      const connectRequest = requestModule.request({
        host,
        port,
        method: 'CONNECT',
        path: `${TEST_TARGET_HOST}:${TEST_TARGET_PORT}`,
        headers
      })

      connectRequest.setTimeout(REQUEST_TIMEOUT_MS, () => {
        connectRequest.destroy(new Error('CONNECT timeout'))
      })

      connectRequest.on('connect', async (response, socket, head) => {
        console.log('[ProxyTestNative] connect response', {
          proxyType: proxy.type,
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          headers: response.headers
        })

        if (response.statusCode !== 200) {
          socket.destroy()
          finish({ ok: false, error: `Proxy HTTP ${response.statusCode}` })
          return
        }

        try {
          const tlsSocket = await createTlsTunnel(socket, proxy, head)
          const result = await requestThroughTlsSocket(tlsSocket, proxy)
          finish(result)
        } catch (error) {
          finish({
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      })

      connectRequest.on('response', (response) => {
        console.log('[ProxyTestNative] unexpected non-connect response', {
          proxyType: proxy.type,
          statusCode: response.statusCode,
          headers: response.headers
        })
      })

      connectRequest.on('error', (error) => {
        console.error('[ProxyTestNative] connect error', {
          proxyType: proxy.type,
          message: error.message
        })
        finish({ ok: false, error: error.message })
      })

      connectRequest.end()
    })
  }, 'HTTP CONNECT proxy test')
}

function readExact(socket: net.Socket, size: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let chunks: Buffer[] = []
    let total = 0

    const cleanup = (): void => {
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('close', onClose)
    }

    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }

    const onClose = (): void => {
      cleanup()
      reject(new Error('SOCKS5 socket closed'))
    }

    const onData = (chunk: Buffer): void => {
      chunks.push(chunk)
      total += chunk.length

      if (total < size) return

      cleanup()
      const buffer = Buffer.concat(chunks, total)
      const required = buffer.subarray(0, size)
      const rest = buffer.subarray(size)
      if (rest.length > 0) {
        socket.unshift(rest)
      }
      resolve(required)
    }

    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('close', onClose)
  })
}

async function readSocks5Reply(socket: net.Socket): Promise<void> {
  const header = await readExact(socket, 4)
  const atyp = header[3]

  let restLength = 0
  if (atyp === 0x01) restLength = 4 + 2
  else if (atyp === 0x03) {
    const domainLength = (await readExact(socket, 1))[0]
    restLength = domainLength + 2
  } else if (atyp === 0x04) restLength = 16 + 2
  else throw new Error(`Unsupported SOCKS5 ATYP: ${atyp}`)

  const rest = await readExact(socket, restLength)
  const response = Buffer.concat([header, restLength === rest.length ? rest : Buffer.alloc(0)])

  if (response[1] !== 0x00) {
    throw new Error(`SOCKS5 connect failed: ${response[1]}`)
  }
}

function testSocks5Proxy(proxy: Proxy): Promise<{ ok: boolean; ip?: string; error?: string }> {
  return withTimeout(async () => {
    const { host, port } = assertGlobalProxyServer(proxy)
    console.log('[ProxyTestNative] begin socks5 connect', {
      proxy: describeProxy(proxy)
    })

    const socket = net.connect({
      host,
      port
    })

    socket.setTimeout(REQUEST_TIMEOUT_MS, () => {
      socket.destroy(new Error('SOCKS5 timeout'))
    })

    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })

    const methods = proxy.username ? [0x00, 0x02] : [0x00]
    socket.write(Buffer.from([0x05, methods.length, ...methods]))

    const authSelection = await readExact(socket, 2)
    if (authSelection[0] !== 0x05) {
      throw new Error('Invalid SOCKS5 handshake version')
    }

    if (authSelection[1] === 0xff) {
      throw new Error('SOCKS5 no acceptable auth method')
    }

    if (authSelection[1] === 0x02) {
      const username = Buffer.from(proxy.username || '', 'utf8')
      const password = Buffer.from(proxy.password || '', 'utf8')
      const authPacket = Buffer.concat([
        Buffer.from([0x01, username.length]),
        username,
        Buffer.from([password.length]),
        password
      ])
      socket.write(authPacket)

      const authResponse = await readExact(socket, 2)
      if (authResponse[1] !== 0x00) {
        throw new Error(`SOCKS5 auth failed: ${authResponse[1]}`)
      }
    }

    const hostBuffer = Buffer.from(TEST_TARGET_HOST, 'utf8')
    const portBuffer = Buffer.alloc(2)
    portBuffer.writeUInt16BE(TEST_TARGET_PORT, 0)

    const connectPacket = Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuffer.length]),
      hostBuffer,
      portBuffer
    ])

    socket.write(connectPacket)
    await readSocks5Reply(socket)

    console.log('[ProxyTestNative] socks5 tunnel established', {
      proxyHost: proxy.host,
      proxyPort: proxy.port
    })

    const tlsSocket = await createTlsTunnel(socket, proxy)
    return await requestThroughTlsSocket(tlsSocket, proxy)
  }, 'SOCKS5 proxy test')
}

export async function testProxy(proxy: Proxy): Promise<{ ok: boolean; ip?: string; error?: string }> {
  try {
    const proxyMode = getProxyMode(proxy)

    if (proxyMode === 'custom' || proxyMode === 'pac_url') {
      return await testProxyThroughElectronSession(proxy)
    }

    if (getProxyType(proxy) === 'socks5') {
      return await testSocks5Proxy(proxy)
    }

    if (getProxyType(proxy) === 'http' || getProxyType(proxy) === 'https') {
      return await testHttpConnectProxy(proxy)
    }

    return { ok: false, error: `Unsupported proxy type: ${getProxyType(proxy)}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[ProxyTestNative] fatal error', {
      proxy: describeProxy(proxy),
      message
    })
    return { ok: false, error: message }
  }
}
