/**
 * Gemini Web API 客户端（零依赖，协议移植自 HanaokaYuzu/Gemini-API，MIT）
 *
 * 认证: gemini.google.com 的 cookie（至少 __Secure-1PSID / __Secure-1PSIDTS）
 * 流程:
 *   init()           GET /app 提取 SNlM0e(at)/cfb2h(bl)/FdrFJe(f.sid)/TuX5cc(hl)/qKIAYe(push id)
 *   fetchModels()    batchexecute(otAQ7b) 发现账号可用模型（名称/id/容量位）
 *   generateContent()POST StreamGenerate，流式产出 { text, textDelta, thoughts, images, videos, done }
 *   uploadFile()     POST content-push.googleapis.com/upload，返回文件标识
 *
 * 响应为 Google 长度前缀帧（UTF-16 code unit 计数），)]}' 反 XSSI 前缀。
 * JSPB 数组稀疏高位字段收在末尾 dict（key = 字段号+1），getField 兼容两种位置。
 */

const ENDPOINTS = {
  INIT: 'https://gemini.google.com/app',
  GENERATE: 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate',
  BATCH_EXEC: 'https://gemini.google.com/_/BardChatUi/data/batchexecute',
  UPLOAD: 'https://content-push.googleapis.com/upload',
};

/** 测试/私有化部署时可重定向上游（urls = { baseUrl, uploadUrl }） */
function resolveEndpoints(urls = {}) {
  const base = (urls.baseUrl || 'https://gemini.google.com').replace(/\/$/, '');
  return {
    INIT: `${base}/app`,
    GENERATE: `${base}/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`,
    BATCH_EXEC: `${base}/_/BardChatUi/data/batchexecute`,
    UPLOAD: urls.uploadUrl || ENDPOINTS.UPLOAD,
  };
}

const MODEL_HEADER_KEY = 'x-goog-ext-525001261-jspb';
const DEFAULT_METADATA = ['', '', '', null, null, null, null, null, null, ''];
const DEFAULT_PUSH_ID = 'feeds/mcudyrk2a4khkz';
const DEFAULT_LANGUAGE = 'en';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

const CARD_CONTENT_RE = /^https?:\/\/googleusercontent\.com\/card_content\/\d+/;
const ARTIFACTS_RE = /https?:\/\/googleusercontent\.com\/(?:\w+\/)+\d+\n*/g;
const MODEL_PREFIX_RE = /^gemini-(?:\d+(?:\.\d+)?-)?/;

// 服务端错误码（candidate 流 part[5][2][0][1][0]）
const ERROR_CODES = {
  1013: 'TEMPORARY_ERROR',
  1037: 'USAGE_LIMIT_EXCEEDED',
  1050: 'MODEL_INCONSISTENT',
  1052: 'MODEL_HEADER_INVALID',
  1060: 'IP_TEMPORARILY_BLOCKED',
  1185: 'IMAGE_RATE_LIMITED',
};

export class GeminiWebError extends Error {
  constructor(message, code = 'API_ERROR', status = 502) {
    super(message);
    this.name = 'GeminiWebError';
    this.code = code;
    this.status = status;
  }
}

// ---------- JSPB 导航 ----------

/** 安全读取嵌套结构（list 用下标，dict 用字符串 key），路径失效返回 default */
export function getNested(data, path, fallback = null) {
  let cur = data;
  for (const key of path) {
    if (cur == null) return fallback;
    if (typeof key === 'number') {
      if (!Array.isArray(cur) || key < 0 || key >= cur.length) return fallback;
      cur = cur[key];
    } else {
      if (typeof cur !== 'object' || !(key in cur)) return fallback;
      cur = cur[key];
    }
  }
  return cur === undefined || cur === null ? fallback : cur;
}

/** JSPB 数组的稀疏 bundle：末尾元素为 dict 时，高位字段号 N 以 key "N+1" 存于其中 */
function getSparseBundle(container) {
  if (Array.isArray(container) && container.length && typeof container.at(-1) === 'object' && container.at(-1) !== null && !Array.isArray(container.at(-1))) {
    return container.at(-1);
  }
  return null;
}

/** 读取 JSPB 字段：先查位置槽，值为空或槽本身是 bundle 时查稀疏 bundle */
export function getField(container, index, fallback = null) {
  if (!Array.isArray(container) || !container.length) return fallback;
  const value = index < container.length ? container[index] : null;
  if (value === null || value === undefined ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'object' && value !== null && !Array.isArray(value))) {
    const bundle = getSparseBundle(container);
    const fromBundle = bundle ? bundle[String(index + 1)] : undefined;
    if (fromBundle === undefined || fromBundle === null) return fallback;
    if (Array.isArray(fromBundle) && fromBundle.length === 0) return fallback;
    return fromBundle;
  }
  return value;
}

/** candidate 的 [12] rich content block 内字段 */
const richField = (candidate, index, fallback = null) => getField(getNested(candidate, [12]), index, fallback);

// ---------- 流帧解析 ----------

/**
 * Google 流式响应帧解析器。
 * 帧格式: `<marker>\n<JSON 载荷>\n`，marker 为 UTF-16 units 数且**包含 marker 数字后的换行
 * 与载荷后的换行**（即 marker = len('\n' + JSON + '\n')，与 gemini_webapi 一致），首帧前有 )]}' 前缀。
 * JS 字符串长度即 UTF-16 code unit 数，无需 Python 版的 surrogate 换算。
 */
export class StreamFrameParser {
  constructor() {
    this.buffer = '';
    this.expectedUnits = null;
    this.payloadStart = 0;
    this.prefixChecked = false;
  }

  feed(content) {
    if (content) this.buffer += content;
    this.#stripPrefix();
    const frames = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.expectedUnits === null) {
        this.buffer = this.buffer.replace(/^\s+/, '');
        const m = this.buffer.match(/^(\d+)\n/);
        if (!m) break;
        this.expectedUnits = Number(m[1]);
        // 不跳过换行：换行计入 marker units（gemini_webapi payload_start = len(数字)）
        this.payloadStart = m[1].length;
      }
      const available = this.buffer.length - this.payloadStart;
      if (available < this.expectedUnits) break;
      const chunk = this.buffer.slice(this.payloadStart, this.payloadStart + this.expectedUnits);
      this.buffer = this.buffer.slice(this.payloadStart + this.expectedUnits);
      this.expectedUnits = null;
      this.payloadStart = 0;
      if (!chunk.trim()) continue;
      try {
        const parsed = JSON.parse(chunk);
        frames.push(...(Array.isArray(parsed) ? parsed : [parsed]));
      } catch { /* 坏帧跳过 */ }
    }
    return frames;
  }

  #stripPrefix() {
    if (this.prefixChecked) return;
    const prefix = ")]}'";
    if (this.buffer.length < prefix.length && prefix.startsWith(this.buffer)) return;
    if (this.buffer.startsWith(prefix)) this.buffer = this.buffer.slice(prefix.length).replace(/^\s+/, '');
    this.prefixChecked = true;
  }
}

/** 解析完整的 Google 响应文本（batchexecute 等）为帧数组 */
export function extractFrames(text) {
  const parser = new StreamFrameParser();
  let frames = parser.feed(text.replace(/^\)\]\}'/, '').replace(/^\s+/, ''));
  frames = frames.concat(parser.feed(''));
  if (frames.length) return frames;
  // 兜底：逐行 JSON
  const lines = [];
  for (const line of String(text).split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const parsed = JSON.parse(s);
      lines.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch { /* 忽略 */ }
  }
  return lines;
}

// ---------- 文本增量 ----------

function cleanText(s) {
  return s.endsWith('\n```') ? s.slice(0, -4) : s;
}

/**
 * 计算流式文本增量。Gemini 流基本为前缀追加；出现中间修改时按最长公共前缀重发差异，
 * 最终帧以 isFinal 的原始文本校正。
 */
export function textDelta(newRaw, lastSent, isFinal) {
  const clean = isFinal ? newRaw : cleanText(newRaw);
  if (clean.startsWith(lastSent)) return { delta: clean.slice(lastSent.length), full: clean };
  let i = 0;
  const min = Math.min(clean.length, lastSent.length);
  while (i < min && clean[i] === lastSent[i]) i++;
  return { delta: clean.slice(i), full: clean };
}

// ---------- 模型 ----------

function computeCapacity(tierFlags = [], capabilityFlags = []) {
  if (tierFlags.includes(21)) return { capacity: 1, capacityField: 13 };
  if (tierFlags.includes(22)) return { capacity: 2, capacityField: 13 };
  if (capabilityFlags.includes(115)) return { capacity: 4, capacityField: 12 };
  if (tierFlags.includes(16) || capabilityFlags.includes(106)) return { capacity: 3, capacityField: 12 };
  return { capacity: tierFlags.includes(8) || capabilityFlags.includes(19) ? 2 : 1, capacityField: 12 };
}

function deriveModelName(modelId, categoryName, displayName) {
  const cat = String(categoryName || '').trim();
  const disp = String(displayName || '').trim();
  if (cat) return `gemini-${cat.toLowerCase().replace(/\s+/g, '-')}`;
  if (disp) return `gemini-${disp.toLowerCase().replace(/\s+/g, '-')}`;
  return `gemini-${modelId}`;
}

/** 从 otAQ7b 响应的一项 model_data 解析模型（字段含义见 gemini_webapi AvailableModel.from_rpc） */
export function parseModelFromRpc(modelData, capacity, capacityField) {
  const modelId = getNested(modelData, [0], '');
  if (!modelId || typeof modelId !== 'string') return null;
  const categoryName = getNested(modelData, [1], '') || getNested(modelData, [10], '');
  const displayName = getNested(modelData, [11], '') || getNested(modelData, [19], '') || categoryName;
  const description = getNested(modelData, [12], '') || getNested(modelData, [2], '');
  const rawNumber = getNested(modelData, [17]);
  const modelNumber = typeof rawNumber === 'number' ? rawNumber : getNested(modelData, [9], 1);
  const modelName = deriveModelName(modelId, categoryName, displayName);
  return {
    modelId,
    modelName,
    displayName: String(displayName || categoryName || modelId),
    description: String(description || ''),
    capacity,
    capacityField,
    modelNumber: typeof modelNumber === 'number' ? modelNumber : 1,
    aliases: [modelId.toLowerCase(), modelName.toLowerCase()],
  };
}

// ---------- cookie jar ----------

class CookieJar {
  constructor(list = []) {
    this.jar = new Map();
    for (const c of list) if (c && c.name && c.value) this.jar.set(c.name, c.value);
  }
  header() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  get(name) {
    return this.jar.get(name) || '';
  }
  updateFromResponse(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const raw of list) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value && value !== 'EXPIRED') this.jar.set(name, value);
      else this.jar.delete(name);
    }
  }
}

const uuid = () =>
  (globalThis.crypto?.randomUUID?.() ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    })).toUpperCase();

// ---------- 客户端 ----------

/**
 * 创建 Gemini Web 客户端。
 * @param {Array<{name:string,value:string}>} cookies gemini.google.com 的 cookie 列表
 * @param {(msg:string)=>void} [onLog]
 * @param {{baseUrl?:string,uploadUrl?:string}} [urls] 上游重定向（测试用）
 */
export function createGeminiClient({ cookies = [], onLog = () => {}, urls = {} } = {}) {
  const EP = resolveEndpoints(urls);
  const jar = new CookieJar(cookies);
  if (!jar.get('__Secure-1PSID')) {
    throw new GeminiWebError('cookie 缺少 __Secure-1PSID，无法访问 Gemini（请先在 SessionBox 页面登录）', 'NOT_LOGGED_IN', 401);
  }

  const state = {
    accessToken: '',
    buildLabel: '',
    sessionId: '',
    language: DEFAULT_LANGUAGE,
    pushId: DEFAULT_PUSH_ID,
    models: [], // parseModelFromRpc 结果数组
    running: false,
    clientSessionId: uuid(),
    reqid: 10000 + Math.floor(Math.random() * 90000),
  };

  const log = onLog;

  function baseHeaders() {
    return {
      'user-agent': USER_AGENT,
      origin: 'https://gemini.google.com',
      referer: 'https://gemini.google.com/',
      cookie: jar.header(),
    };
  }

  async function request(url, { method = 'GET', headers = {}, body, timeoutMs = 120000 } = {}) {
    const res = await fetch(url, {
      method,
      headers: { ...baseHeaders(), ...headers },
      body,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    jar.updateFromResponse(res);
    return res;
  }

  /** 初始化：提取页面令牌并发现模型 */
  async function init() {
    if (state.running) return;
    const res = await request(EP.INIT, { headers: { accept: 'text/html' } });
    if (!res.ok) {
      throw new GeminiWebError(`初始化请求失败（HTTP ${res.status}），cookie 可能已失效`, 'INIT_FAILED', res.status === 401 || res.status === 403 ? 401 : 502);
    }
    const html = await res.text();
    const pick = (re) => html.match(re)?.[1] || '';
    state.accessToken = pick(/"SNlM0e":\s*"(.*?)"/);
    state.buildLabel = pick(/"cfb2h":\s*"(.*?)"/);
    state.sessionId = pick(/"FdrFJe":\s*"(.*?)"/);
    state.language = pick(/"TuX5cc":\s*"(.*?)"/) || DEFAULT_LANGUAGE;
    state.pushId = pick(/"qKIAYe":\s*"(.*?)"/) || DEFAULT_PUSH_ID;
    if (!state.accessToken && !state.buildLabel) {
      throw new GeminiWebError('页面未包含 WIZ_global_data 令牌，账号未登录或区域不可用', 'NOT_LOGGED_IN', 401);
    }
    state.running = true;
    state.clientSessionId = uuid();
    state.reqid = 10000 + Math.floor(Math.random() * 90000);
    try {
      await fetchModels();
    } catch (err) {
      log(`模型发现失败（忽略，使用默认模型）: ${err.message}`);
    }
    log(`客户端初始化成功: models=${state.models.length} bl=${state.buildLabel ? 'yes' : 'no'}`);
  }

  /** batchexecute 调用（模型发现等 RPC） */
  async function batchExecute(rpcid, payload) {
    const params = new URLSearchParams({
      rpcids: rpcid,
      hl: state.language,
      _reqid: String(state.reqid),
      rt: 'c',
      'source-path': '/app',
    });
    if (state.buildLabel) params.set('bl', state.buildLabel);
    if (state.sessionId) params.set('f.sid', state.sessionId);
    state.reqid += 100000;

    const batchModelHeader = JSON.parse(
      `[1,null,null,null,null,null,null,null,[4,5,6,8],null,null,null,null,null,null,null,${JSON.stringify(state.clientSessionId)}]`,
    );
    const res = await request(`${EP.BATCH_EXEC}?${params}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
        'x-same-domain': '1',
        [MODEL_HEADER_KEY]: JSON.stringify(batchModelHeader),
        'x-goog-ext-73010989-jspb': '[0]',
      },
      body: new URLSearchParams({
        at: state.accessToken || '',
        'f.req': JSON.stringify([[[rpcid, payload, null, 'generic']]]),
      }).toString(),
    });
    if (!res.ok) throw new GeminiWebError(`batchexecute ${rpcid} 失败（HTTP ${res.status}）`, 'RPC_FAILED', 502);
    return extractFrames(await res.text());
  }

  /** 拉取账号可用模型列表（otAQ7b GetUserStatus） */
  async function fetchModels() {
    const frames = await batchExecute('otAQ7b', '[]');
    for (const part of frames) {
      if (getNested(part, [1]) !== 'otAQ7b') continue;
      const code = getNested(part, [5, 0]);
      if (code === 7) throw new GeminiWebError('账号未授权（RPC 权限拒绝），cookie 已失效', 'NOT_LOGGED_IN', 401);
      const bodyStr = getNested(part, [2]);
      if (!bodyStr) continue;
      let body;
      try { body = JSON.parse(bodyStr); } catch { continue; }
      const status = getNested(body, [14]);
      if (typeof status === 'number' && status !== 1000) {
        log(`账号状态码 ${status}（1000 为正常）`);
      }
      const modelsList = getNested(body, [15]);
      if (!Array.isArray(modelsList)) continue;
      const { capacity, capacityField } = computeCapacity(getNested(body, [16], []), getNested(body, [17], []));
      state.models = modelsList
        .map((m) => parseModelFromRpc(m, capacity, capacityField))
        .filter(Boolean);
      return state.models;
    }
    throw new GeminiWebError('模型发现响应中没有 otAQ7b 数据', 'MODEL_DISCOVERY_FAILED', 502);
  }

  /** 按名称/别名/id 解析模型；null 表示用 Google 默认模型 */
  function resolveModel(name) {
    if (!name || name === 'default' || name === 'auto') return null;
    if (!state.models.length) return null;
    const norm = (s) => String(s).toLowerCase().replace(/_/g, '-');
    const target = norm(String(name).replace(MODEL_PREFIX_RE, ''));
    for (const m of state.models) {
      const nm = norm(m.modelName).replace(MODEL_PREFIX_RE, '');
      if (nm === target || target === nm.split('-')[0] || m.aliases.some((a) => norm(a).replace(MODEL_PREFIX_RE, '') === target)) return m;
    }
    return null;
  }

  /**
   * 全尺寸图片解析（RPC c8o8Fe，gemini_webapi _get_full_size_image 同构）。
   * gg-dl 流内 URL 为降采样预览（约 512px），真实尺寸见 candidate 元数据 [0][3][17]。
   * @returns {Promise<string|null>} 最终可下载的全尺寸 URL（两层文本跳转后）
   */
  async function getFullSizeImageUrl({ cid, rid, rcid, imageId }) {
    if (!state.running) await init();
    const payload = JSON.stringify([
      [
        [null, null, null, [null, null, null, null, null, '']],
        [imageId, 0],
        null,
        [19, ''],
        null, null, null, null, null, '',
      ],
      [rid, rcid, cid, null, ''],
      1,
      0,
      1,
    ]);
    const frames = await batchExecute('c8o8Fe', payload);
    for (const part of frames) {
      if (getNested(part, [1]) !== 'c8o8Fe') continue;
      const bodyStr = getNested(part, [2]);
      if (!bodyStr) continue;
      let url;
      try { url = getNested(JSON.parse(bodyStr), [0]); } catch { continue; }
      if (typeof url !== 'string' || !url.startsWith('http')) continue;
      // 两层文本跳转: {url}=d-I?alr=yes → 文本(跳转URL) → 文本(最终下载URL)
      const r1 = await request(`${url}=d-I?alr=yes`, { timeoutMs: 30000 });
      if (!r1.ok) continue;
      const hop1 = (await r1.text()).trim();
      if (!hop1.startsWith('http')) continue;
      const r2 = await request(hop1, { timeoutMs: 30000 });
      if (!r2.ok) continue;
      const finalUrl = (await r2.text()).trim();
      return finalUrl.startsWith('http') ? finalUrl : hop1;
    }
    return null;
  }

  /**
   * 上传文件到 content-push，返回文件标识（用于 message_content[3]）。
   * @param {{buffer:Buffer, filename:string}} file
   */
  async function uploadFile({ buffer, filename }) {
    const form = new FormData();
    const mime = filename.match(/\.(png|jpe?g|webp|gif|bmp)$/i)
      ? `image/${filename.match(/\.jpe?g$/i) ? 'jpeg' : filename.split('.').pop().toLowerCase()}`
      : filename.match(/\.(mp4|webm|mov)$/i)
        ? 'video/mp4'
        : filename.match(/\.pdf$/i)
          ? 'application/pdf'
          : 'application/octet-stream';
    form.append('file', new Blob([buffer], { type: mime }), filename);
    const res = await request(EP.UPLOAD, {
      method: 'POST',
      headers: {
        'x-tenant-id': 'bard-storage',
        'push-id': state.pushId,
      },
      body: form,
    });
    if (!res.ok) throw new GeminiWebError(`文件上传失败（HTTP ${res.status}）`, 'UPLOAD_FAILED', 502);
    const path = (await res.text()).trim();
    if (!path.startsWith('/')) throw new GeminiWebError(`上传返回异常: ${path.slice(0, 100)}`, 'UPLOAD_FAILED', 502);
    return path;
  }

  /**
   * 生成内容（核心）。
   * @param {object} opts
   * @param {string} opts.prompt               已拼接的多轮 prompt（ChatML 标签格式）
   * @param {Array<{url:string,filename:string}>} [opts.files] 已上传的文件（url 为 uploadFile 返回值）
   * @param {object|string|null} opts.model    resolveModel 结果 / 名称 / null
   * @param {boolean} [opts.temporary=false]   临时会话（不写入账号历史）
   * @param {boolean} [opts.extendedThinking=false]
   * @yields {{rcid, text, textDelta, thoughts, thoughtsDelta, images, videos, done, final}}
   */
  async function* generateContent({
    prompt,
    files = [],
    model = null,
    temporary = false,
    extendedThinking = false,
  }) {
    if (!state.running) await init();
    if (!prompt) throw new GeminiWebError('prompt 不能为空', 'EMPTY_PROMPT', 400);

    const selected = typeof model === 'string' ? resolveModel(model) : model;
    const fileData = files.length ? files.map((f) => [[f.url], f.filename]) : null;

    const inner = new Array(81).fill(null);
    inner[0] = [prompt, 0, null, fileData, null, null, 0];
    inner[1] = [state.language];
    inner[2] = DEFAULT_METADATA;
    inner[6] = [1];
    inner[7] = 1; // 流式
    inner[10] = 1;
    inner[11] = 0;
    inner[17] = [[0]];
    inner[18] = 0;
    inner[27] = 1;
    inner[30] = [4];
    inner[41] = [1];
    if (temporary) inner[45] = 1;
    inner[53] = 0;
    const uuidVal = uuid();
    inner[59] = uuidVal;
    inner[61] = [];
    inner[68] = 1;
    inner[79] = 1;
    inner[80] = extendedThinking ? 2 : 1;

    const headers = {
      'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
      'x-same-domain': '1',
      'x-goog-ext-525005358-jspb': JSON.stringify([uuidVal, 1]),
    };
    if (selected) {
      // [1,null,null,null,modelId,null,null,0,[4,5,6,8],null,null,<capacity 尾>,null,null,<modelNumber>,<thinking>,<sessionId>]
      const tail = selected.capacityField === 13 ? `null,${selected.capacity}` : String(selected.capacity);
      const headerArr = JSON.parse(
        `[1,null,null,null,${JSON.stringify(selected.modelId)},null,null,0,[4,5,6,8],null,null,${tail},null,null,${selected.modelNumber}]`,
      );
      headerArr.push(extendedThinking ? 2 : 1);
      headerArr.push(state.clientSessionId);
      headers[MODEL_HEADER_KEY] = JSON.stringify(headerArr);
      headers['x-goog-ext-73010989-jspb'] = '[0]';
      headers['x-goog-ext-73010990-jspb'] = '[0,0,0]';
      inner[79] = selected.modelNumber;
    }

    const params = new URLSearchParams({
      hl: state.language,
      _reqid: String(state.reqid),
      rt: 'c',
    });
    state.reqid += 100000;
    if (state.buildLabel) params.set('bl', state.buildLabel);
    if (state.sessionId) params.set('f.sid', state.sessionId);

    const res = await request(`${EP.GENERATE}?${params}`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        at: state.accessToken || '',
        'f.req': JSON.stringify([null, JSON.stringify(inner)]),
      }).toString(),
      timeoutMs: 600000,
    });
    if (!res.ok) {
      const invalid = res.status === 400 || res.status === 401 || res.status === 403;
      throw new GeminiWebError(
        `生成请求失败（HTTP ${res.status}）${invalid ? '，cookie 可能已失效' : ''}`,
        invalid ? 'NOT_LOGGED_IN' : 'GENERATE_FAILED',
        invalid ? 401 : 502,
      );
    }

    const parser = new StreamFrameParser();
    const decoder = new TextDecoder('utf-8');
    const lastTexts = new Map();
    const lastThoughts = new Map();
    const emitState = { hasText: false, cid: '', rid: '' };

    const handlePart = function* (part) {
      const errorCode = getNested(part, [5, 2, 0, 1, 0]);
      if (errorCode) {
        const label = ERROR_CODES[errorCode] || `SERVER_ERROR_${errorCode}`;
        const messages = {
          USAGE_LIMIT_EXCEEDED: '账号用量已达上限，请换模型（如 Flash）或稍后再试',
          MODEL_INCONSISTENT: '指定模型与会话历史不一致，请全链路使用同一模型',
          MODEL_HEADER_INVALID: '模型暂不可用或请求结构过期',
          IP_TEMPORARILY_BLOCKED: '当前 IP 被临时限制，请更换网络或稍后再试',
          IMAGE_RATE_LIMITED: '生图请求过于频繁（1185），请稍后再试',
          TEMPORARY_ERROR: 'Google 临时错误（1013），请重试',
        };
        throw new GeminiWebError(messages[label] || `Google 返回错误码 ${errorCode}`, label, 502);
      }
      const innerStr = getNested(part, [2]);
      if (!innerStr) return;
      let partJson;
      try { partJson = JSON.parse(innerStr); } catch { return; }

      const metadata = getNested(partJson, [1]);
      if (metadata) {
        const cid = getNested(metadata, [0]);
        const rid = getNested(metadata, [1]);
        if (cid) emitState.cid = cid;
        if (rid) emitState.rid = rid;
      }
      const isFinalChunk = typeof getNested(partJson, [25]) === 'string';

      const candidates = getNested(partJson, [4], []);
      if (!Array.isArray(candidates) || !candidates.length) return;
      for (const candidateData of candidates) {
        const rcid = getNested(candidateData, [0]);
        if (!rcid) continue;
        const parsed = parseCandidate(candidateData);

        const indicator = getNested(candidateData, [8, 0]);
        const isCompleted = indicator === 2 || indicator === null;
        const { delta, full } = textDelta(parsed.text, lastTexts.get(rcid) || '', isCompleted);
        lastTexts.set(rcid, full);
        let thoughtsDelta = '';
        if (parsed.thoughts) {
          const t = textDelta(parsed.thoughts, lastThoughts.get(rcid) || '', isCompleted);
          thoughtsDelta = t.delta;
          lastThoughts.set(rcid, t.full);
        }
        if (delta || thoughtsDelta || parsed.images.length || parsed.videos.length) emitState.hasText = true;
        yield {
          rcid,
          text: parsed.text,
          textDelta: delta,
          thoughts: parsed.thoughts,
          thoughtsDelta,
          images: parsed.images,
          videos: parsed.videos,
          done: isCompleted,
          final: isFinalChunk && isCompleted,
          cid: emitState.cid,
          rid: emitState.rid,
        };
      }
    };

    const reader = res.body.getReader();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const parts = parser.feed(decoder.decode(value, { stream: true }));
      for (const part of parts) yield* handlePart(part);
    }
    const tailParts = parser.feed(decoder.decode());
    for (const part of tailParts) yield* handlePart(part);

    if (!emitState.hasText && !emitState.cid) {
      throw new GeminiWebError('响应中没有候选内容（可能被 Google 静默中止）', 'EMPTY_RESPONSE', 502);
    }
  }

  /** 非流式便捷方法：聚合 generateContent 的最终输出 */
  async function generateOnce(opts) {
    const output = { text: '', thoughts: '', images: [], videos: [], rcid: '', cid: '', rid: '' };
    for await (const chunk of generateContent(opts)) {
      output.text = chunk.text || output.text;
      output.thoughts = chunk.thoughts || output.thoughts;
      output.images = chunk.images.length ? chunk.images : output.images;
      output.videos = chunk.videos.length ? chunk.videos : output.videos;
      output.rcid = output.rcid || chunk.rcid;
      output.cid = output.cid || chunk.cid;
      output.rid = output.rid || chunk.rid;
    }
    return output;
  }

  return {
    init,
    fetchModels,
    resolveModel,
    uploadFile,
    generateContent,
    generateOnce,
    getFullSizeImageUrl,
    get models() {
      return state.models;
    },
    get running() {
      return state.running;
    },
    /** 生成图片/视频直链（gg-dl 等）下载时需要登录态，server 层传给 fetchBinary */
    get cookieHeader() {
      return jar.header();
    },
  };
}

/** 解析单个 candidate：文本 / 思考 / 生成图片 / 生成视频 */
function parseCandidate(candidateData) {
  let text = getNested(candidateData, [1, 0], '');
  if (CARD_CONTENT_RE.test(text)) text = getNested(candidateData, [22, 0]) || text;
  text = String(text).replace(ARTIFACTS_RE, '');
  const thoughts = getNested(candidateData, [37, 0, 0]) || '';

  const images = [];
  const genImages = getNested(richField(candidateData, 7), [0], []);
  if (Array.isArray(genImages)) {
    genImages.forEach((img, i) => {
      const url = getNested(img, [0, 3, 3]);
      if (url) {
        // [0][3][15] = [宽, 高, 字节数]（真实尺寸，gg-dl 预览为降采样）
        const dims = getNested(img, [0, 3, 15]);
        images.push({
          url,
          alt: getNested(img, [0, 3, 2], ''),
          imageId: getNested(img, [1, 0]) || `http://googleusercontent.com/image_generation_content/${i}`,
          width: Array.isArray(dims) ? dims[0] : null,
          height: Array.isArray(dims) ? dims[1] : null,
          size: Array.isArray(dims) ? dims[2] : null,
        });
      }
    });
  }

  const videos = [];
  const videoInfo = getNested(richField(candidateData, 59), [0, 0, 0], null);
  if (videoInfo) {
    const urls = getNested(videoInfo, [0, 7], []);
    if (Array.isArray(urls) && urls.length >= 2) {
      videos.push({ url: urls[1], thumbnail: urls[0] });
    }
  }
  return { text, thoughts, images, videos };
}

// ---------- 媒体下载 ----------

/**
 * 下载二进制（lh3 直链），返回 { status, buffer, contentType }。
 * 生成图片（gg-dl）与视频 URL 会 302 到 work.fife.usercontent.google.com 的一次性签名地址，
 * 二段需要 fife 域 cookie（redirectCookieHeader）；无重定向时仅用 cookieHeader。
 */
export async function fetchBinary(url, timeoutMs = 120000, cookieHeader = '', redirectCookieHeader = '') {
  const baseHeaders = {
    'user-agent': USER_AGENT,
    ...(cookieHeader ? { cookie: cookieHeader, referer: 'https://gemini.google.com/' } : {}),
  };
  let res = await fetch(url, {
    redirect: 'manual',
    headers: baseHeaders,
    signal: AbortSignal.timeout(timeoutMs),
  });
  // 二段：302 → fife 一次性签名 URL，需 fife 域 cookie
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    if (location) {
      res = await fetch(location, {
        redirect: 'follow',
        headers: {
          'user-agent': USER_AGENT,
          ...(redirectCookieHeader || cookieHeader ? { cookie: redirectCookieHeader || cookieHeader } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    }
  }
  if (!res.ok && res.status !== 206) {
    throw new GeminiWebError(`媒体下载失败（HTTP ${res.status}）: ${String(url).slice(0, 120)}`, 'DOWNLOAD_FAILED', 502);
  }
  return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') || '' };
}

/**
 * 轮询生成中的媒体：Google 对未就绪的视频返回 206，就绪后 200。
 * @returns {Promise<{buffer:Buffer, contentType:string}>}
 */
export async function pollMediaUrl(url, { timeoutMs = 300000, intervalMs = 10000, onProgress = () => {}, cookieHeader = '', redirectCookieHeader = '' } = {}) {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetchBinary(url, Math.min(timeoutMs, 120000), cookieHeader, redirectCookieHeader);
    if (res.status === 200 && res.buffer.length) {
      if (res.contentType.startsWith('text/') && res.buffer.length < 1024) {
        // 偶发返回错误页文本，视为未就绪
      } else {
        return res;
      }
    }
    if (Date.now() + intervalMs > deadline) {
      throw new GeminiWebError(`媒体生成超时（${Math.round(timeoutMs / 1000)}s）`, 'MEDIA_TIMEOUT', 504);
    }
    onProgress(res.status);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
