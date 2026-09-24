#!/usr/bin/env node
/**
 * SessionBox 数据同步后端服务
 *
 * 免密、按用户标识符隔离的 JSON 快照存储。
 * 数据明文保存在 DATA_DIR 下（data/<userId>/<type>.json），仅供可信网络自建使用。
 *
 * 启动：
 *   node server/sync-server.mjs [--port 37400] [--dir ./data]
 *   环境变量 PORT / DATA_DIR 优先级低于命令行参数。
 */
import { createServer } from 'node:http'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const VERSION = 1

/** 允许同步的数据类型白名单 */
const SYNC_TYPES = ['bookmarks', 'history', 'extensions', 'plugins', 'proxies', 'containers']

/** 单请求体上限（cookie 快照可能较大） */
const MAX_BODY_BYTES = 64 * 1024 * 1024

/** 用户标识符合法字符（同时是文件名，防止路径穿越） */
const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function parseArgs(argv) {
  const args = { port: Number(process.env.PORT) || 37400, dir: process.env.DATA_DIR || 'data' }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--port') args.port = Number(argv[++i])
    else if (argv[i] === '--dir') args.dir = argv[++i]
  }
  return args
}

export function createSyncServer({ dir }) {
  const dataRoot = resolve(dir)

  /** 用户目录路径；非法标识符返回 null */
  function userDir(userId) {
    if (!USER_ID_RE.test(userId)) return null
    return join(dataRoot, userId)
  }

  async function readJson(path) {
    try {
      return JSON.parse(await readFile(path, 'utf-8'))
    } catch {
      return null
    }
  }

  /** 原子写：先写临时文件再 rename，避免进程中断留下半个 JSON */
  async function writeAtomic(path, data) {
    const tmp = `${path}.${randomUUID()}.tmp`
    await writeFile(tmp, data, 'utf-8')
    await rename(tmp, path)
  }

  function readBody(req) {
    return new Promise((resolveBody, rejectBody) => {
      const chunks = []
      let size = 0
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          rejectBody(Object.assign(new Error('payload too large'), { statusCode: 413 }))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolveBody(Buffer.concat(chunks)))
      req.on('error', rejectBody)
    })
  }

  // 跨域访问由浏览器（Electron 渲染进程 fetch）发起，所有响应都要带 CORS 头
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  function send(res, statusCode, body) {
    const text = JSON.stringify(body)
    res.writeHead(statusCode, {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
    })
    res.end(text)
  }

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders)
      res.end()
      return
    }

    const url = new URL(req.url, 'http://localhost')
    const segments = url.pathname.split('/').filter(Boolean) // ['api', user, type]

    try {
      if (segments[0] !== 'api') {
        send(res, 404, { ok: false, error: 'not found' })
        return
      }

      // GET /api 或 /api/health：健康检查
      if ((segments.length === 1) || (segments.length === 2 && segments[1] === 'health')) {
        send(res, 200, { ok: true, version: VERSION, serverTime: Date.now(), types: SYNC_TYPES })
        return
      }

      const userId = segments[1]
      const userPath = userDir(userId ?? '')
      if (!userPath) {
        send(res, 400, { ok: false, error: 'invalid user id (allowed: A-Za-z0-9_- , max 64)' })
        return
      }

      // /api/:user 列出已有数据类型
      if (segments.length === 2) {
        if (req.method !== 'GET') {
          send(res, 405, { ok: false, error: 'method not allowed' })
          return
        }
        let types = []
        try {
          types = (await readdir(userPath))
            .filter((f) => f.endsWith('.json'))
            .map((f) => f.slice(0, -5))
            .filter((t) => SYNC_TYPES.includes(t))
        } catch { /* 目录不存在 = 空 */ }
        send(res, 200, { ok: true, user: userId, types })
        return
      }

      const type = segments[2]
      if (segments.length !== 3 || !SYNC_TYPES.includes(type)) {
        send(res, 400, { ok: false, error: `invalid sync type, allowed: ${SYNC_TYPES.join(', ')}` })
        return
      }

      const filePath = join(userPath, `${type}.json`)

      // GET /api/:user/:type
      if (req.method === 'GET') {
        const record = await readJson(filePath)
        if (!record) {
          send(res, 200, { ok: true, type, updatedAt: 0, payload: null })
          return
        }
        send(res, 200, { ok: true, type, updatedAt: record.updatedAt, payload: record.payload })
        return
      }

      // PUT /api/:user/:type  body: { payload: any }
      if (req.method === 'PUT') {
        const raw = await readBody(req)
        let parsed
        try {
          parsed = JSON.parse(raw.toString('utf-8'))
        } catch {
          send(res, 400, { ok: false, error: 'invalid JSON body' })
          return
        }
        if (parsed === null || typeof parsed !== 'object' || !('payload' in parsed)) {
          send(res, 400, { ok: false, error: 'body must be { payload }' })
          return
        }
        const updatedAt = Date.now()
        await mkdir(userPath, { recursive: true })
        await writeAtomic(filePath, JSON.stringify({ updatedAt, payload: parsed.payload }))
        send(res, 200, { ok: true, type, updatedAt })
        return
      }

      // DELETE /api/:user/:type
      if (req.method === 'DELETE') {
        await rm(filePath, { force: true })
        send(res, 200, { ok: true, type })
        return
      }

      send(res, 405, { ok: false, error: 'method not allowed' })
    } catch (error) {
      const statusCode = error.statusCode || 500
      if (!res.headersSent) {
        send(res, statusCode, { ok: false, error: error.message || 'internal error' })
      } else {
        res.destroy()
      }
    }
  })

  return server
}

// 仅作为脚本直接执行时启动监听（被测试 import 时不监听）
if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1]).replace(/\\/g, '/')}`).href) {
  const args = parseArgs(process.argv)
  const server = createSyncServer({ dir: args.dir })
  server.listen(args.port, () => {
    console.log(`[sync-server] listening on http://0.0.0.0:${args.port}`)
    console.log(`[sync-server] data dir: ${resolve(args.dir)}`)
  })
}
