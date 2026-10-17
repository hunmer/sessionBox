// chatglm-api 服务：把 SessionBox 管理的智谱清言账号暴露为 OpenAI 兼容 API（零依赖）
//
//   GET  /health                    存活检查 + 登录态
//   GET  /v1/models                 模型列表
//   POST /v1/chat/completions       聊天（OpenAI 兼容，支持 stream）
//   POST /v1/images/generations     AI 生图（CogView，返回 4 图 URL）
//   POST /v1/images/edits           AI 图片编辑（multipart image + prompt → 智能编辑）
//
// 可选透传字段（body 顶层）：chat_mode（deep_thinking）、reasoning_effort、is_networking、
//   conversation_id（多轮续聊）、style/scene/rm_label_watermark（生图）
const http = require('node:http')
const { SessionBoxClient, ChatGLMClient, ASSISTANTS } = require('./client')

const PORT = Number(process.env.CHATGLM_API_PORT || 19206)
const BRIDGE_URL = process.env.SESSIONBOX_API_URL || 'http://127.0.0.1:19100'
const BRIDGE_TOKEN = process.env.SESSIONBOX_API_TOKEN || ''

const sessionBox = new SessionBoxClient(BRIDGE_URL, BRIDGE_TOKEN)
const chatglm = new ChatGLMClient(sessionBox)

const MODELS = [
  { id: 'glm-5.3-flash', description: '智谱清言网页版默认模型' },
  { id: 'cogview-4', description: '智谱清言 AI 画图（images/generations）' },
  { id: 'cogview-edit', description: '智谱清言智能编辑（images/edits，传图+prompt）' }
]

function log(level, msg) {
  console.log(`${new Date().toISOString()} [${level}] ${msg}`)
}
function diag(msg) {
  console.log(`CHATGLM_DIAG ${new Date().toISOString()} ${msg}`)
}

function cors(res) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  res.setHeader('access-control-allow-headers', 'Authorization,Content-Type')
}

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders() })
  res.end(payload)
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Authorization,Content-Type'
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch (e) { reject(new Error(`请求体 JSON 解析失败: ${e.message}`)) }
    })
    req.on('error', reject)
  })
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** 解析 PNG/JPEG/WebP/GIF 宽高，用于智能编辑保持原图比例；失败返回 null */
function imageDimensions(buf) {
  if (buf.length < 24) return null
  // PNG: IHDR
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  // GIF
  if (buf.subarray(0, 4).toString('ascii') === 'GIF8') {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  }
  // WebP: RIFF....WEBP
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    const tag = buf.subarray(12, 16).toString('ascii')
    if (tag === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
    if (tag === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
    if (tag === 'VP8L') {
      const b = buf.readUInt32LE(21)
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }
    }
    return null
  }
  // JPEG: 扫描 SOF0/1/2 marker
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue }
      const marker = buf[off + 1]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) }
      }
      off += 2 + buf.readUInt16BE(off + 2)
    }
  }
  return null
}

function ratioOf(width, height) {
  if (!width || !height) return '1:1'
  const g = (a, b) => (b ? g(b, a % b) : a)
  const div = g(width, height) || 1
  return `${Math.round(width / div)}:${Math.round(height / div)}`
}

/** OpenAI messages → chatglm messages：拼接 system，取最后一条用户输入 */
function toChatglmMessages(openaiMessages) {
  const system = (openaiMessages || [])
    .filter((m) => m.role === 'system')
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('\n')
    .trim()
  const lastUser = [...(openaiMessages || [])].reverse().find((m) => m.role === 'user')
  if (!lastUser) throw new Error('messages 中缺少 user 消息')
  let text = typeof lastUser.content === 'string'
    ? lastUser.content
    : (lastUser.content || []).filter((p) => p.type === 'text').map((p) => p.text).join('\n')
  if (system) text = `${system}\n\n${text}`
  return [{ role: 'user', content: [{ type: 'text', text }] }]
}

/**
 * 遍历 chatglm SSE 事件，产出统一分片：
 *   { type:'text'|'think', delta } 或 { type:'image', urls, description } 或 { type:'done', meta }
 * 规则：init 状态的 text/think 为增量；finish 的 text/think 是全量回放（跳过）；
 *       image 分片一次性携带 URL（finish 状态也收集）。
 */
async function* normalizeEvents(events) {
  for await (const ev of events) {
    for (const part of ev.parts || []) {
      for (const c of part.content || []) {
        if (c.type === 'text' && typeof c.text === 'string' && c.text && part.status !== 'finish') {
          yield { type: 'text', delta: c.text }
        } else if (c.type === 'think' && typeof c.think === 'string' && c.think && part.status !== 'finish') {
          yield { type: 'think', delta: c.think }
        } else if (c.type === 'image' && Array.isArray(c.image)) {
          const urls = c.image.map((i) => i.image_url).filter(Boolean)
          if (urls.length) yield { type: 'image', urls, description: c.code || '' }
        }
      }
    }
    if (ev.status === 'finish') {
      yield { type: 'done', meta: ev.meta_data || {}, conversationId: ev.conversation_id }
      return
    }
  }
  yield { type: 'done', meta: {}, conversationId: '' }
}

function openaiChunk(id, model, delta, finish) {
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, ...(finish ? { finish_reason: finish } : {}) }]
  }
}

async function handleChat(req, res) {
  const body = await readBody(req)
  const model = body.model || 'glm-5.3-flash'
  const stream = body.stream === true
  const messages = toChatglmMessages(body.messages)
  const metaData = {
    chat_mode: body.chat_mode || '',
    reasoning_effort: body.reasoning_effort || 'max',
    is_networking: body.is_networking === true,
    selected_model: model
  }
  const id = `chatcmpl-${Date.now().toString(36)}`
  const iterator = chatglm.stream({
    assistantId: ASSISTANTS.chat,
    conversationId: body.conversation_id || '',
    messages,
    metaData
  })

  if (!stream) {
    let content = ''
    let reasoning = ''
    let usage = null
    for await (const piece of normalizeEvents(iterator)) {
      if (piece.type === 'text') content += piece.delta
      else if (piece.type === 'think') reasoning += piece.delta
      else if (piece.type === 'done') usage = piece.meta
    }
    return json(res, 200, {
      id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, message: { role: 'assistant', content, ...(reasoning ? { reasoning_content: reasoning } : {}) }, finish_reason: 'stop' }],
      ...(usage && usage.total_time ? { chatglm_meta: usage } : {})
    })
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    ...corsHeaders()
  })
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
  send(openaiChunk(id, model, { role: 'assistant' }))
  for await (const piece of normalizeEvents(iterator)) {
    if (piece.type === 'text') send(openaiChunk(id, model, { content: piece.delta }))
    else if (piece.type === 'think') send(openaiChunk(id, model, { reasoning_content: piece.delta }))
    else if (piece.type === 'done') send(openaiChunk(id, model, {}, 'stop'))
  }
  res.write('data: [DONE]\n\n')
  res.end()
}

/** OpenAI size（1024x1024）→ cogview aspect_ratio（1:1）；也接受原生比例（16:9） */
function sizeToRatio(size) {
  if (!size || size === 'auto') return '1:1'
  const m = String(size).match(/^(\d+)x(\d+)$/)
  if (!m) return String(size) // 已经是 16:9 形式
  const w = Number(m[1]), h = Number(m[2])
  const g = (a, b) => (b ? g(b, a % b) : a)
  const div = g(w, h)
  return `${w / div}:${h / div}`
}

async function handleImages(req, res) {
  const body = await readBody(req)
  const prompt = String(body.prompt || '').trim()
  if (!prompt) return json(res, 400, { error: { message: 'prompt 不能为空' } })
  const cogview = {
    aspect_ratio: body.aspect_ratio || sizeToRatio(body.size),
    style: body.style || 'none',
    scene: body.scene || 'none',
    chat_model: '',
    rm_label_watermark: body.rm_label_watermark === true
  }
  const iterator = chatglm.stream({
    assistantId: ASSISTANTS.drawing,
    conversationId: body.conversation_id || '',
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    metaData: { cogview, chat_mode: '', selected_model: body.model || 'glm-5.3-flash' }
  })
  const urls = []
  let descriptions = []
  for await (const piece of normalizeEvents(iterator)) {
    if (piece.type === 'image') { urls.push(...piece.urls); if (piece.description) descriptions.push(piece.description) }
  }
  if (!urls.length) return json(res, 502, { error: { message: '生图未返回图片，请检查积分/登录态', descriptions } })
  const unique = [...new Set(urls)]
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders() })
  res.end(JSON.stringify({
    created: Math.floor(Date.now() / 1000),
    data: unique.map((url) => ({ url })),
    chatglm: { descriptions }
  }))
}

/** OpenAI 兼容图片编辑：multipart image 文件 + prompt → 上传 → 智能编辑 → 结果图 URL */
async function handleImageEdit(req) {
  const contentType = req.headers['content-type'] || ''
  if (!contentType.includes('multipart/form-data')) {
    return [400, { error: { message: 'content-type 需为 multipart/form-data' } }]
  }
  const raw = await readRawBody(req)
  const form = await new Request('http://localhost', { method: 'POST', headers: { 'content-type': contentType }, body: raw }).formData()
  const file = form.get('image') || form.get('image[]') || form.get('file')
  if (!file || typeof file === 'string') return [400, { error: { message: 'multipart 表单缺少 image 文件字段' } }]
  const prompt = String(form.get('prompt') || '').trim()
  if (!prompt) return [400, { error: { message: 'prompt 不能为空' } }]
  const buffer = Buffer.from(await file.arrayBuffer())
  const dims = imageDimensions(buffer)
  const uploaded = await chatglm.uploadImage(buffer, file.name || 'image.png', file.type)
  const result = await chatglm.editImage({
    fileId: uploaded.file_id,
    fileUrl: uploaded.file_url,
    prompt,
    aspectRatio: form.get('aspect_ratio') || ratioOf(dims?.width, dims?.height),
    conversationId: form.get('conversation_id') || '',
    rmLabelWatermark: form.get('rm_label_watermark') === 'true'
  })
  return [200, {
    created: Math.floor(Date.now() / 1000),
    data: [{ url: result.image_url }],
    chatglm: { conversation_id: result.conversation_id, source_ratio: ratioOf(dims?.width, dims?.height) }
  }]
}

const server = http.createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0]
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {})
    if (req.method === 'GET' && path === '/health') {
      const { page, cookieMap } = await sessionBox.getCookies()
      return json(res, 200, {
        ok: true,
        page: { id: page.id, name: page.name, url: page.currentUrl || page.url },
        logged_in: !!cookieMap.chatglm_token
      })
    }
    if (req.method === 'GET' && path === '/v1/models') {
      return json(res, 200, { object: 'list', data: MODELS.map((m) => ({ id: m.id, object: 'model', ...m })) })
    }
    if (req.method === 'POST' && path === '/v1/chat/completions') return await handleChat(req, res)
    if (req.method === 'POST' && path === '/v1/images/generations') return await handleImages(req, res)
    if (req.method === 'POST' && path === '/v1/images/edits') {
      const [status, payload] = await handleImageEdit(req)
      return json(res, status, payload)
    }
    return json(res, 404, { error: { message: `未知路由 ${req.method} ${path}` } })
  } catch (error) {
    log('ERROR', `${req.method} ${path}: ${error.message}`)
    return json(res, 502, { error: { message: error.message } })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  diag(`chatglm-api listening on http://127.0.0.1:${PORT} (bridge ${BRIDGE_URL})`)
})
server.on('error', (e) => log('ERROR', `server: ${e.message}`))
