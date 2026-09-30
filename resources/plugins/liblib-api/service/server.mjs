#!/usr/bin/env node
/**
 * liblib-api 服务：把 SessionBox 管理的 liblib.tv 账号暴露为 OpenAI 兼容 API（零依赖）
 *
 * 端点:
 *   GET  /health                     存活检查
 *   GET  /v1/models                  全部模型（text/image/audio/video 四模态）
 *   GET  /v1/sessionbox/pages        列出 liblib 账号页面（凭据就绪状态）
 *   POST /v1/sessionbox/refresh      清空凭据缓存（token 过期后手动刷新）
 *   POST /v1/chat/completions        文本模型（支持多模态 image_url 输入；伪流式）
 *   POST /v1/images/generations      图片模型（text2image / image2image）
 *   POST /v1/audio/generations       音频模型（JSON 返回 url）
 *   POST /v1/audio/speech            OpenAI TTS 兼容（返回 wav 二进制）
 *   POST /v1/video/generations       视频模型
 *   POST /v1/files                   上传文件（JSON base64 或 raw body + x-filename）
 *   GET  /v1/tasks/:taskId           任务进度直通
 *
 * 账号选择（SessionBox 页面 = 账号）:
 *   x-session-page 头 > Authorization: Bearer <pageId>（命中页面 id 时）> body.page_id > 自动（open 的优先）
 *
 * 环境变量: LIBLIB_PORT(19201) SESSIONBOX_API_URL(127.0.0.1:19100) SESSIONBOX_API_TOKEN
 */
import { createServer } from 'node:http';
import { appendFileSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBridgeClient } from './sessionbox.mjs';
import { createAccountManager, SessionBoxAccountError } from './accounts.mjs';
import { MODELS } from '../api-client.mjs';

const DEFAULT_MODEL = { text: 'qwen-3-vl-flash', image: 'qwen-edit', audio: 'seed-audio-1.0', video: 'MiniMax-Hailuo-o2' };
const ALL_MODELS = Object.entries(MODELS).flatMap(([type, list]) => list.map((m) => ({ ...m, type })));
const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'];

const LOG_FILE = new URL('./service.log', import.meta.url);
const LOG_MAX_BYTES = 5 * 1024 * 1024;

/** 服务日志：stdout（由插件 main.js 转发到主进程日志）+ service.log 双写，超 5MB 截断 */
const log = (...args) => {
  const line = `${new Date().toISOString()} ${args.join(' ')}`;
  console.log(`LIBLIB_API ${line}`);
  try {
    if (statSync(LOG_FILE).size > LOG_MAX_BYTES) {
      const tail = readFileSync(LOG_FILE, 'utf8').slice(-LOG_MAX_BYTES / 2);
      writeFileSync(LOG_FILE, tail.slice(tail.indexOf('\n') + 1));
    }
  } catch { /* 文件不存在时忽略 */ }
  try { appendFileSync(LOG_FILE, `${line}\n`); } catch { /* 日志失败不中断服务 */ }
};
const mask = (s) => (s ? `${String(s).slice(0, 6)}...` : '-');

/** OpenAI size（1024x1024）或原生比例（16:9）→ liblib ratio */
function toRatio(size) {
  if (!size) return '1:1';
  if (RATIOS.includes(size)) return size;
  const m = String(size).match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
  if (!m) return '1:1';
  const target = Number(m[1]) / Number(m[2]);
  let best = '1:1';
  let bestDiff = Infinity;
  for (const r of RATIOS) {
    const [w, h] = r.split(':').map(Number);
    const diff = Math.abs(w / h - target);
    if (diff < bestDiff) { bestDiff = diff; best = r; }
  }
  return best;
}

/** chat messages → { prompt, imageRefs }；多轮拼接，image_url 收集为参考图 */
async function messagesToPrompt(messages) {
  const lines = [];
  const refs = [];
  for (const msg of messages || []) {
    let text = '';
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') text += (text ? '\n' : '') + part.text;
        else if (part.type === 'image_url' && part.image_url?.url) refs.push(part.image_url.url);
      }
    }
    lines.push(`${msg.role || 'user'}: ${text}`);
  }
  const prompt = lines.length === 1 ? lines[0].replace(/^user:\s*/, '') : lines.join('\n');
  return { prompt: prompt.trim(), refs };
}

/** 从 taskResult 提取生成文本（结构以实测日志为准，先做防御性多字段提取） */
function extractText(taskResult) {
  if (!taskResult) return '';
  const r = taskResult;
  for (const list of [r.texts, r.contents, r.textList]) {
    if (Array.isArray(list) && list.length) {
      return list.map((t) => (typeof t === 'string' ? t : t.content || t.text || '')).join('\n').trim();
    }
  }
  if (typeof r.text === 'string') return r.text;
  if (r.result && (r.result.text || r.result.content)) return r.result.text || r.result.content;
  return JSON.stringify(r);
}

const uid = () => `chatcmpl-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

export async function startServer({ port = 0, host = '127.0.0.1', bridgeUrl, bridgeToken = '', urls, liblibHostRe } = {}) {
  const bridge = createBridgeClient({ baseUrl: bridgeUrl, token: bridgeToken });
  const accounts = createAccountManager({ bridge, urls, liblibHostRe, onLog: log });

  /** 从请求解析账号选择与凭据，返回 { page, entry } */
  async function pickAccount(req, body = {}) {
    let explicit = req.headers['x-session-page'] || body.page_id || body.session_page || '';
    const auth = String(req.headers.authorization || '');
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!explicit && bearer) {
      const pages = await accounts.listLiblibPages();
      if (pages.some((p) => p.id === bearer)) explicit = bearer; // api key 形式传 pageId
    }
    return accounts.pick(explicit || undefined);
  }

  async function runWithAccount(req, body, fn) {
    const { page, entry } = await pickAccount(req, body);
    log(`account page=${page.id}(${page.name}) token=${mask(entry.creds.token)}`);
    return accounts.withClient(page.id, fn);
  }

  const server = createServer((req, res) => {
    const started = Date.now();
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;

    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'authorization, content-type, x-session-page, x-filename');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    req.on('error', () => {});
    const chunks = [];
    req.on('data', (c) => chunks.push(c));

    req.on('end', () => {
      handle(req, res, path, url, Buffer.concat(chunks))
        .catch((err) => {
          const { status, payload } = toErrorResponse(err);
          if (!res.headersSent) {
            res.writeHead(status, { 'content-type': 'application/json' });
            res.end(JSON.stringify(payload));
          } else res.end();
          log(`${req.method} ${path} -> ${status} (${Date.now() - started}ms) error=${err.code || ''} ${String(err.message).slice(0, 300)}`);
        })
        .finally(() => {
          if (res.writableEnded) log(`${req.method} ${path} -> ${res.statusCode} (${Date.now() - started}ms)`);
        });
    });
  });

  async function handle(req, res, path, url, rawBody) {
    const body = parseJsonBody(req, rawBody);
    const json = (status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };

    if (req.method === 'GET' && path === '/health') {
      return json(200, { status: 'ok', service: 'liblib-api', ts: Date.now() });
    }

    if (req.method === 'GET' && path === '/v1/models') {
      return json(200, {
        object: 'list',
        data: ALL_MODELS.map((m) => ({
          id: m.id, object: 'model', created: 0, owned_by: `liblib/${m.type}`,
          meta: { label: m.label, type: m.type, provider: m.provider, power: m.power },
        })),
      });
    }

    if (req.method === 'GET' && path === '/v1/sessionbox/pages') {
      const pages = await accounts.listLiblibPages();
      const out = [];
      for (const p of pages) {
        let ready = false;
        let reason = '';
        try { await accounts.resolve(p.id); ready = true; } catch (err) { reason = String(err.message).slice(0, 200); }
        out.push({ id: p.id, name: p.name, url: p.url, open: !!p.open, ready, reason });
      }
      return json(200, { pages: out });
    }

    if (req.method === 'POST' && path === '/v1/sessionbox/refresh') {
      for (const p of await accounts.listLiblibPages()) accounts.invalidate(p.id);
      log('凭据缓存已清空');
      return json(200, { refreshed: true });
    }

    if (req.method === 'GET' && path === '/v1/admin/logs') {
      const lines = Math.min(Number(url.searchParams.get('lines')) || 100, 1000);
      let text = '';
      try { text = readFileSync(LOG_FILE, 'utf8'); } catch { /* 尚无日志 */ }
      const all = text ? text.trimEnd().split('\n') : [];
      return json(200, { lines: all.slice(-lines) });
    }

    if (req.method === 'GET' && path === '/v1/sessionbox/account') {
      // 当前账号的会员/积分信息（liblib getAccount）
      const data = await runWithAccount(req, {}, (api) => api.getAccount());
      const attr = data.attr || {};
      return json(200, {
        page: undefined,
        userId: data.userId, name: data.name, ownerUuid: data.ownerUuid,
        member: { level: data.accountLevelName || null, effective: !!data.effective, endTime: data.endTime || null },
        power: { usable: attr.usablePower, total: attr.totalPower, used: attr.usedPower, concurrent: attr.taskCanSubmit },
      });
    }

    if (req.method === 'POST' && path === '/v1/chat/completions') {
      requireModel(body, 'text');
      const { prompt, refs } = await messagesToPrompt(body.messages);
      if (!prompt) return json(400, errPayload('messages 内容为空', 'invalid_request_error'));
      const imageRefs = await normalizeImageRefs(refs, req);

      const result = await runWithAccount(req, body, (api) => (async () => {
        const task = await api.createTextGeneration({ prompt, model: body.model, refs: imageRefs });
        log(`task create model=${body.model} taskId=${task.taskId} power=${task.power}`);
        return api.waitForTask(task.taskId, { timeoutMs: 180000 });
      })());

      const text = extractText(result);
      if (!text) log(`taskResult 结构未识别，原文: ${JSON.stringify(result).slice(0, 500)}`);
      const id = uid();
      const created = Math.floor(Date.now() / 1000);
      const usage = { prompt_tokens: prompt.length, completion_tokens: text.length, total_tokens: prompt.length + text.length };

      if (body.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        const chunk = (delta) => `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: body.model, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`;
        res.write(chunk({ role: 'assistant', content: '' }));
        for (const piece of text.match(/[\s\S]{1,64}/g) || []) res.write(chunk({ content: piece }));
        res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: body.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      return json(200, {
        id, object: 'chat.completion', created, model: body.model,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage,
      });
    }

    if (req.method === 'POST' && path === '/v1/images/generations') {
      requireModel(body, 'image');
      const refs = await normalizeImageRefs([body.image, ...(body.refs || [])].filter(Boolean), req);
      const result = await runWithAccount(req, body, (api) => (async () => {
        const task = await api.createImageGeneration({
          prompt: body.prompt || '', model: body.model, ratio: toRatio(body.size),
          quality: body.quality || 'medium', resolution: body.resolution || '2K',
          count: Math.min(Number(body.n) || 1, 4), refs,
        });
        log(`task create model=${body.model} taskId=${task.taskId} power=${task.power}`);
        return api.waitForTask(task.taskId, { timeoutMs: 300000 });
      })());
      const images = result.images || [];
      if (body.response_format === 'b64_json') {
        const encoded = [];
        for (const img of images) encoded.push(Buffer.from(await (await fetch(img.previewPath || img.url)).arrayBuffer()).toString('base64'));
        return json(200, { created: Math.floor(Date.now() / 1000), data: encoded.map((b64) => ({ b64_json: b64 })) });
      }
      return json(200, { created: Math.floor(Date.now() / 1000), data: images.map((img) => ({ url: img.previewPath || img.url })) });
    }

    if (req.method === 'POST' && path === '/v1/images/edits') {
      // OpenAI images/edits: multipart/form-data（image 文件 + prompt），mask 忽略（liblib 无对应参数）
      const form = await parseForm(req, rawBody);
      const body2 = { model: str(form.get('model')), size: str(form.get('size')), n: form.get('n') || 1, prompt: str(form.get('prompt')) };
      requireModel(body2, 'image');
      const mask = form.get('mask');
      if (mask) log('images/edits 收到 mask，已忽略（liblib 未暴露局部重绘参数）');

      const imageFiles = [...form.getAll('image'), ...form.getAll('image[]'), ...form.getAll('images')].filter((f) => f && typeof f === 'object');
      if (imageFiles.length === 0) {
        return json(400, errPayload('multipart 表单缺少 image 文件字段', 'invalid_request_error'));
      }
      const refs = [];
      for (const file of imageFiles.slice(0, 4)) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const up = await runWithAccount(req, body2, (api) => api.uploadFile({
          buffer, filename: file.name || 'upload.png', contentType: file.type || undefined,
        }));
        refs.push(up.cdnUrl);
      }
      const result = await runWithAccount(req, body2, (api) => (async () => {
        const task = await api.createImageGeneration({
          prompt: body2.prompt || '', model: body2.model, ratio: toRatio(body2.size),
          quality: str(form.get('quality')) || 'medium', resolution: str(form.get('resolution')) || '2K',
          count: Math.min(Number(body2.n) || 1, 4), refs,
        });
        log(`task create(edits) model=${body2.model} refs=${refs.length} taskId=${task.taskId} power=${task.power}`);
        return api.waitForTask(task.taskId, { timeoutMs: 300000 });
      })());
      const images = result.images || [];
      if (str(form.get('response_format')) === 'b64_json') {
        const encoded = [];
        for (const img of images) encoded.push(Buffer.from(await (await fetch(img.previewPath || img.url)).arrayBuffer()).toString('base64'));
        return json(200, { created: Math.floor(Date.now() / 1000), data: encoded.map((b64) => ({ b64_json: b64 })) });
      }
      return json(200, { created: Math.floor(Date.now() / 1000), data: images.map((img) => ({ url: img.previewPath || img.url })) });
    }

    if (req.method === 'POST' && path === '/v1/audio/generations') {
      requireModel(body, 'audio');
      const result = await runWithAccount(req, body, (api) => (async () => {
        const task = await api.createAudioGeneration({
          prompt: body.prompt || body.input || '', model: body.model,
          speed: body.speed ?? 1, pitch: body.pitch ?? 0, vol: body.vol ?? 1,
        });
        log(`task create model=${body.model} taskId=${task.taskId} power=${task.power}`);
        return api.waitForTask(task.taskId, { timeoutMs: 300000 });
      })());
      return json(200, { created: Math.floor(Date.now() / 1000), data: (result.audios || []).map((a) => ({ url: a.previewPath || a.url })) });
    }

    if (req.method === 'POST' && path === '/v1/audio/speech') {
      requireModel(body, 'audio');
      const audioUrl = await runWithAccount(req, body, (api) => (async () => {
        const task = await api.createAudioGeneration({ prompt: body.input || '', model: body.model, scene: body.scene || 'Music' });
        const result = await api.waitForTask(task.taskId, { timeoutMs: 300000 });
        const a = (result.audios || [])[0];
        if (!a) throw new Error('音频任务无结果');
        return a.previewPath || a.url;
      })());
      const buf = Buffer.from(await (await fetch(audioUrl)).arrayBuffer());
      res.writeHead(200, { 'content-type': 'audio/wav' });
      res.end(buf);
      return;
    }

    if (req.method === 'POST' && path === '/v1/video/generations') {
      requireModel(body, 'video');
      const refs = await normalizeImageRefs([body.image, ...(body.refs || [])].filter(Boolean), req);
      const result = await runWithAccount(req, body, (api) => (async () => {
        const task = await api.createVideoGeneration({
          prompt: body.prompt || '', model: body.model,
          ratio: toRatio(body.size || body.ratio), resolution: body.resolution || '720P',
          duration: Number(body.duration) || 2, refs, mode: body.modeType,
        });
        log(`task create model=${body.model} taskId=${task.taskId} power=${task.power}`);
        return api.waitForTask(task.taskId, { timeoutMs: 900000, intervalMs: 8000 });
      })());
      return json(200, { created: Math.floor(Date.now() / 1000), data: (result.videos || []).map((v) => ({ url: v.previewPath || v.url })) });
    }

    if (req.method === 'POST' && path === '/v1/files') {
      const { filename, buffer } = parseFileBody(req, url, body, rawBody);
      const out = await runWithAccount(req, body, (api) => api.uploadFile({ buffer, filename }));
      return json(200, { filename, url: out.cdnUrl });
    }

    const taskMatch = path.match(/^\/v1\/tasks\/([^/]+)$/);
    if (req.method === 'GET' && taskMatch) {
      const data = await runWithAccount(req, {}, (api) => api.getProgress([decodeURIComponent(taskMatch[1])]));
      return json(200, data);
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(errPayload(`未知路由 ${req.method} ${path}`, 'not_found')));
  }

  function requireModel(body, type) {
    if (!body.model) body.model = DEFAULT_MODEL[type];
    if (!ALL_MODELS.some((m) => m.id === body.model)) {
      const err = new Error(`未知模型 ${body.model}。可用模型见 GET /v1/models（共 ${ALL_MODELS.length} 个）`);
      err.code = 'UNKNOWN_MODEL';
      err.status = 400;
      throw err;
    }
    if (!MODELS[type].some((m) => m.id === body.model)) {
      const err = new Error(`模型 ${body.model} 不属于 ${type} 模态，请使用 ${type} 端点对应的模型`);
      err.code = 'WRONG_MODALITY';
      err.status = 400;
      throw err;
    }
  }

  /** image 引一化: data URL → 上传取 cdnUrl；http(s) 直接透传 */
  async function normalizeImageRefs(refs, req) {
    const out = [];
    for (const ref of refs) {
      if (!ref) continue;
      if (ref.startsWith('data:')) {
        const m = ref.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) continue;
        const ext = (m[1].split('/')[1] || 'png').split('+')[0];
        const buf = Buffer.from(m[2], 'base64');
        const up = await runWithAccount(req, {}, (api) => api.uploadFile({ buffer: buf, filename: `upload.${ext}`, contentType: m[1] }));
        out.push(up.cdnUrl);
      } else out.push(ref);
    }
    return out;
  }

  await new Promise((r) => server.listen(port, host, r));
  log(`liblib-api 服务已启动 ${host}:${server.address().port} bridge=${bridgeUrl}`);
  return {
    server,
    port: server.address().port,
    close: () => new Promise((r) => server.close(r)),
  };
}

function parseJsonBody(req, rawBody) {
  if (!rawBody.length || !(req.headers['content-type'] || '').includes('application/json')) return {};
  try { return JSON.parse(rawBody.toString('utf8')); } catch { return {}; }
}

/** 解析 multipart/form-data（借助 Node 内置 Request.formData，零依赖） */
async function parseForm(req, rawBody) {
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('multipart/form-data')) {
    throw Object.assign(new Error('content-type 需为 multipart/form-data'), { code: 'INVALID_CONTENT_TYPE', status: 400 });
  }
  const request = new Request('http://localhost', { method: 'POST', headers: { 'content-type': contentType }, body: rawBody });
  return request.formData();
}

const str = (v) => (v == null ? undefined : String(v));

function parseFileBody(req, url, body, rawBody) {
  if (body.content_base64) {
    return { filename: body.filename || 'upload.bin', buffer: Buffer.from(body.content_base64, 'base64') };
  }
  if (body.content_url) {
    throw Object.assign(new Error('content_url 未实现，请使用 content_base64'), { code: 'NOT_IMPLEMENTED', status: 501 });
  }
  const filename = body.filename || req.headers['x-filename'] || url.searchParams.get('filename') || 'upload.bin';
  if (!rawBody.length) throw Object.assign(new Error('请求体为空'), { code: 'EMPTY_BODY', status: 400 });
  return { filename, buffer: rawBody };
}

function errPayload(message, code, type = 'invalid_request_error') {
  return { error: { message, type, code } };
}

function toErrorResponse(err) {
  if (err instanceof SessionBoxAccountError) {
    const status = err.code === 'NO_ACCOUNT' || err.code === 'PAGE_NOT_FOUND' ? 400 : 401;
    return { status, payload: errPayload(err.message, err.code, 'account_error') };
  }
  const status = Number(err.status) || 500;
  return { status, payload: errPayload(String(err.message).slice(0, 500), err.code || 'api_error', status >= 500 ? 'server_error' : 'invalid_request_error') };
}

// ---------- main ----------
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const bridgeUrl = process.env.SESSIONBOX_API_URL || 'http://127.0.0.1:19100';
  const port = Number(process.env.LIBLIB_PORT || 19201);
  const urls = process.env.LIBLIB_API_URLS ? JSON.parse(process.env.LIBLIB_API_URLS) : undefined;
  startServer({ port, bridgeUrl, bridgeToken: process.env.SESSIONBOX_API_TOKEN || '', urls })
    .then(({ port: actual }) => console.log(`liblib-api listening on http://127.0.0.1:${actual}`))
    .catch((err) => { console.error(err); process.exit(1); });
}
