// ChatGLM 客户端：SessionBox bridge 获取页面会话 cookie，自算签名直连 chatglm.cn。
// 签名算法逆向自 chatglm.cn 前端 main.js 模块 86129：
//   timestamp = 13位毫秒时间戳，倒数第二位替换为 (数字和-倒数第二位)%10
//   xNonce    = uuid4 去横线
//   xSign     = md5(`${timestamp}-${nonce}-8a1317a7468aa3ad86e997d08f3f31cb`)
const crypto = require('node:crypto')

const BASE = 'https://chatglm.cn'
const SIGN_SALT = '8a1317a7468aa3ad86e997d08f3f31cb'
const PAGE_HOST = 'chatglm.cn'

// 站点能力入口：主聊天助手 与 AI画图助手（assistant_id 决定路由到聊天还是生图）
const ASSISTANTS = {
  chat: '65940acff94777010aa6b796',
  drawing: '65a232c082ff90a2ad2f15e2'
}

function md5(s) { return crypto.createHash('md5').update(s).digest('hex') }
function uuid() { return crypto.randomUUID().replace(/-/g, '') }

function makeSign() {
  const raw = Date.now().toString()
  const digits = raw.split('').map(Number)
  const check = (digits.reduce((s, d) => s + d, 0) - digits[digits.length - 2]) % 10
  const timestamp = raw.substring(0, raw.length - 2) + check + raw.substring(raw.length - 1)
  const xNonce = uuid()
  return { timestamp, xNonce, sign: md5(`${timestamp}-${xNonce}-${SIGN_SALT}`) }
}

function decodeJwtPayload(token) {
  try {
    const seg = token.split('.')[1]
    return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'))
  } catch { return {} }
}

class SessionBoxClient {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.token = token
  }

  async request(method, path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body } : {})
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`SessionBox bridge ${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`)
    return data
  }

  async findPage() {
    const { pages } = await this.request('GET', '/api/v1/pages')
    const page = (pages || []).find((p) => (p.url || '').includes(PAGE_HOST) || (p.currentUrl || '').includes(PAGE_HOST))
    if (!page) throw new Error(`未找到 ${PAGE_HOST} 页面，请先在 SessionBox 中打开并登录智谱清言`)
    return page
  }

  /** 页面未打开时自动通过 bridge 打开标签页，等待加载后重试 */
  async getCookies(retry = true) {
    const page = await this.findPage()
    try {
      const { cookies } = await this.request('GET', `/api/v1/pages/${encodeURIComponent(page.id)}/cookies?url=${BASE}/`)
      const map = {}
      for (const c of cookies || []) map[c.name] = c.value
      return { page, cookieMap: map }
    } catch (e) {
      if (retry && /没有打开的标签页/.test(e.message)) {
        await this.request('POST', `/api/v1/pages/${encodeURIComponent(page.id)}/open`, JSON.stringify({ url: `${BASE}/main/alltoolsdetail?lang=zh` }))
        await new Promise((r) => setTimeout(r, 4000))
        return this.getCookies(false)
      }
      throw e
    }
  }

  async openPage(pageId, url) {
    return this.request('POST', `/api/v1/pages/${encodeURIComponent(pageId)}/open`, JSON.stringify({ url }))
  }
}

class ChatGLMClient {
  constructor(sessionBox) {
    this.sessionBox = sessionBox
  }

  /** 每次请求实时拉取页面 cookie：页面自身的续期逻辑保证 token 新鲜 */
  async session() {
    const { cookieMap } = await this.sessionBox.getCookies()
    const token = cookieMap.chatglm_token
    if (!token) throw new Error('页面缺少 chatglm_token cookie，请确认已在 chatglm.cn 登录')
    const cookieHeader = ['chatglm_token', 'chatglm_refresh_token', 'chatglm_user_id', 'acw_tc', 'cdn_sec_tc']
      .filter((k) => cookieMap[k])
      .map((k) => `${k}=${cookieMap[k]}`)
      .join('; ')
    const device_id = decodeJwtPayload(token).device_id || ''
    return { token, cookieHeader, device_id }
  }

  async buildHeaders(overrides = {}) {
    const { token, cookieHeader, device_id } = await this.session()
    const { timestamp, xNonce, sign } = makeSign()
    return {
      accept: 'text/event-stream',
      'accept-language': 'zh-CN,zh;q=0.9',
      'app-name': 'chatglm',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      cookie: cookieHeader,
      origin: BASE,
      referer: `${BASE}/main/alltoolsdetail?lang=zh`,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
      'x-app-fr': 'default',
      'x-app-platform': 'pc',
      'x-app-version': '0.0.1',
      'x-device-id': device_id,
      'x-lang': 'zh',
      'x-nonce': xNonce,
      'x-request-id': uuid(),
      'x-sign': sign,
      'x-timestamp': timestamp,
      ...overrides
    }
  }

  async jsonPost(path, body, headerOverrides = {}) {
    const headers = await this.buildHeaders({ accept: 'application/json, text/plain, */*', 'content-type': 'application/json;charset=UTF-8', ...headerOverrides })
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
    if (res.status === 401) throw new Error('chatglm_token 已失效，请在 SessionBox 中重新打开 chatglm.cn 页面完成登录')
    const data = await res.json().catch(() => ({}))
    if (data.status !== 0) throw new Error(`chatglm ${path} 失败(${data.status}): ${data.message}`)
    return data.result
  }

  /** 上传图片文件（智能编辑第一步），返回 {file_id, file_url, file_name, file_type...} */
  async uploadImage(buffer, fileName, contentType) {
    const headers = await this.buildHeaders({ accept: 'application/json, text/plain, */*' })
    delete headers['content-type'] // FormData 自带 boundary
    const fd = new FormData()
    fd.append('file', new Blob([buffer], { type: contentType || 'image/png' }), fileName || 'image.png')
    fd.append('from', 'chat')
    fd.append('assistant_id', ASSISTANTS.drawing)
    const res = await fetch(`${BASE}/chatglm/productivity-api/file/chat_upload`, { method: 'POST', headers, body: fd })
    if (res.status === 401) throw new Error('chatglm_token 已失效，请在 SessionBox 中重新打开 chatglm.cn 页面完成登录')
    const data = await res.json().catch(() => ({}))
    if (data.status !== 0) throw new Error(`图片上传失败(${data.status}): ${data.message}`)
    return data.result
  }

  /** 智能编辑（drawing-api/v1/image/reference），同步返回 {image_url, conversation_id} */
  async editImage({ fileId, fileUrl, prompt, aspectRatio, conversationId, rmLabelWatermark }) {
    return this.jsonPost('/chatglm/drawing-api/v1/image/reference', {
      image_url: `${fileUrl}&image_process=format,webp/resize,s_512/threshold,1024000`,
      file_id: fileId,
      type: 'Intelligent Editing',
      category: 1,
      conversation_id: conversationId || '',
      history_id: '',
      assistant_id: ASSISTANTS.drawing,
      prompt,
      if_plus_model: false,
      title: `【智能编辑】 ${prompt}`,
      aspect_ratio: aspectRatio || '1:1',
      rm_label_watermark: rmLabelWatermark === true
    })
  }

  /**
   * 发送聊天/生图消息，返回解析后的 SSE 事件异步迭代器。
   * 事件形如 { parts, status, meta_data }，parts[].content[] 内含 text/think/image 分片。
   */
  async *stream({ assistantId, conversationId = '', messages, metaData }) {
    const headers = await this.buildHeaders()
    const body = {
      assistant_id: assistantId,
      conversation_id: conversationId,
      project_id: '',
      chat_type: 'user_chat',
      meta_data: {
        is_test: false,
        input_question_type: 'xxxx',
        channel: '',
        draft_id: '',
        chat_mode: '',
        reasoning_effort: 'max',
        selected_model: 'glm-5.3-flash',
        is_networking: false,
        quote_log_id: '',
        platform: 'pc',
        ...metaData
      },
      messages
    }
    const res = await fetch(`${BASE}/chatglm/backend-api/assistant/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
    if (res.status === 401) throw new Error('chatglm_token 已失效，请在 SessionBox 中重新打开 chatglm.cn 页面完成登录')
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`chatglm stream HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    yield* parseSse(res.body)
  }
}

/** 解析 chatglm SSE 流：按空行分隔的 data: JSON 事件 */
async function* parseSse(body) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try { yield JSON.parse(payload) } catch { /* 跳过残缺块 */ }
      }
    }
  }
}

module.exports = { SessionBoxClient, ChatGLMClient, ASSISTANTS, makeSign, parseSse }
