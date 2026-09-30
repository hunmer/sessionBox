import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'

import { createPluginGateway } from './plugin-gateway.ts'

/** mock 插件上游服务（模拟 jimeng/liblib 等本地服务） */
async function startUpstream() {
  const hits: { method: string; path: string; body: string; headers: Record<string, string> }[] = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      hits.push({ method: req.method || '', path: req.url || '', body, headers: req.headers as any })
      if ((req.url || '').startsWith('/stream')) {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write('data: a\n\n')
        setTimeout(() => { res.write('data: b\n\n'); res.end() }, 50)
        return
      }
      if ((req.url || '').startsWith('/echo')) {
        res.writeHead(200, { 'content-type': 'application/json', 'x-upstream': 'yes' })
        res.end(JSON.stringify({ method: req.method, url: req.url, body, auth: req.headers.authorization || null }))
        return
      }
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end('{"error":"not_found"}')
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return { server, hits, port: (server.address() as any).port }
}

/** 把网关 proxy 挂到真实 http server 上，返回网关地址 */
async function startGatewayServer(gateway: ReturnType<typeof createPluginGateway>) {
  const server = createServer((req, res) => {
    void gateway.proxy(req, res, new URL(req.url || '/', `http://${req.headers.host}`))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return { server, base: `http://127.0.0.1:${(server.address() as any).port}` }
}

test('注册表: 全名/短名匹配，/api/v1 与未注册 id 不命中', () => {
  const gw = createPluginGateway()
  gw.register('sessionbox.jimeng-api', 19203)
  assert.equal(gw.match('/api/jimeng-api/v1/sessionbox/pages')?.target.port, 19203)
  assert.equal(gw.match('/api/sessionbox.jimeng-api/health')?.target.port, 19203)
  assert.equal(gw.match('/api/jimeng-api/v1/sessionbox/pages')?.rest, 'v1/sessionbox/pages')
  assert.equal(gw.match('/api/v1/pages'), null, '/api/v1 为 bridge 自身路由')
  assert.equal(gw.match('/api/unknown-api/health'), null, '未注册插件不命中')
  assert.equal(gw.match('/health'), null)
  assert.equal(gw.match('/api/jimeng-api')?.rest, '', '仅插件名无子路径')
  assert.throws(() => gw.register('x', 0))
  assert.throws(() => gw.register('', 1234))
  gw.unregister('sessionbox.jimeng-api')
  assert.equal(gw.match('/api/jimeng-api/health'), null, '注销后不再命中')
  gw.register('sessionbox.jimeng-api', 19203)
  assert.deepEqual(gw.list().map((t) => t.pluginId), ['sessionbox.jimeng-api'], 'list 去重')
})

test('代理: 方法/路径/query/body/请求头透传，响应头与状态码回传', async (t) => {
  const upstream = await startUpstream()
  const gw = createPluginGateway()
  gw.register('sessionbox.jimeng-api', upstream.port)
  const gwServer = await startGatewayServer(gw)
  t.after(() => Promise.all([upstream.server, gwServer.server].map((s: Server) => new Promise((r) => s.close(r)))))

  // POST + query + 自定义头
  const res = await fetch(`${gwServer.base}/api/jimeng-api/echo?x=1&page_id=p2`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-session-page': 'page-a', authorization: 'Bearer tok' },
    body: JSON.stringify({ prompt: '一只猫' }),
  })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('x-upstream'), 'yes', '上游响应头应透传')
  const data = await res.json()
  assert.equal(data.method, 'POST')
  assert.equal(data.url, '/echo?x=1&page_id=p2', '子路径与 query 应原样转发')
  assert.equal(data.body, '{"prompt":"一只猫"}', '请求体应透传')
  assert.equal(data.auth, 'Bearer tok')
  assert.equal(upstream.hits[0].headers['x-session-page'], 'page-a', '自定义请求头应透传')

  // 全名访问
  const res2 = await fetch(`${gwServer.base}/api/sessionbox.jimeng-api/echo`)
  assert.equal(res2.status, 200)

  // 未注册插件 → 网关不处理，落到宿主 server（此处无 fallback，返回 socket 挂起前由测试断言 match）
  assert.equal(gw.match('/api/other-api/echo'), null)

  // 404 透传
  const res404 = await fetch(`${gwServer.base}/api/jimeng-api/nope`)
  assert.equal(res404.status, 404)
})

test('代理: SSE 流式响应按序透传；上游不可达返回 502', async (t) => {
  const upstream = await startUpstream()
  const gw = createPluginGateway()
  gw.register('sessionbox.jimeng-api', upstream.port)
  const gwServer = await startGatewayServer(gw)
  t.after(() => Promise.all([upstream.server, gwServer.server].map((s: Server) => new Promise((r) => s.close(r)))))

  const res = await fetch(`${gwServer.base}/api/jimeng-api/stream`)
  assert.equal(res.headers.get('content-type'), 'text/event-stream')
  const text = await res.text()
  assert.equal(text, 'data: a\n\ndata: b\n\n', '分块写入应按序到达且完整')

  // 注册一个无人监听的端口 → 502 + 可读错误
  gw.register('sessionbox.dead-api', 1)
  const res502 = await fetch(`${gwServer.base}/api/dead-api/health`)
  assert.equal(res502.status, 502)
  const err = await res502.json()
  assert.match(err.error, /dead-api.*不可达/)
  assert.ok(err.hint)
})
