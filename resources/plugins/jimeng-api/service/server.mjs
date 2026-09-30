#!/usr/bin/env node
/**
 * jimeng-api 服务：把 SessionBox 管理的即梦账号暴露为 OpenAI 兼容 API（零依赖）
 *
 * 端点:
 *   GET  /health                     存活检查
 *   GET  /v1/models                  全部模型（image/video 两类）
 *   GET  /v1/sessionbox/pages        列出即梦账号页面（凭据就绪状态）
 *   POST /v1/sessionbox/refresh      清空凭据缓存（sessionid 失效后手动刷新）
 *   GET  /v1/sessionbox/account      当前账号信息 + 积分
 *   POST /v1/token/receive           收取今日积分
 *   POST /v1/images/generations      文生图（ratio/resolution/sample_strength/intelligent_ratio）
 *   POST /v1/images/compositions     图生图（body.images: [url|dataURL]，1-10 张）
 *   POST /v1/images/edits            OpenAI 兼容图生图（multipart image 文件）
 *   POST /v1/videos/generations      文/图生视频（首尾帧模式，file_paths/image 为参考图）
 *   GET  /v1/tasks/:historyId        任务进度直通
 *   GET  /v1/admin/logs              最近服务日志
 *
 * 账号选择（SessionBox 页面 = 账号）:
 *   x-session-page 头 > Authorization: Bearer <pageId>（命中页面 id 时）> body.page_id > 自动（open 的优先）
 *
 * 环境变量: JIMENG_PORT(19203) SESSIONBOX_API_URL(127.0.0.1:19100) SESSIONBOX_API_TOKEN
 */
import { createServer } from 'node:http';
import { appendFileSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBridgeClient } from './sessionbox.mjs';
import { createAccountManager, SessionBoxAccountError } from './accounts.mjs';
import { IMAGE_MODELS, VIDEO_MODELS } from '../api-client.mjs';

const DEFAULT_IMAGE_MODEL = 'jimeng-4.5';
const DEFAULT_VIDEO_MODEL = 'seedance-2.5';
const ALL_MODELS = [
  ...Object.keys(IMAGE_MODELS).map((id) => ({ id, type: 'image', internal: IMAGE_MODELS[id] })),
  ...Object.keys(VIDEO_MODELS).map((id) => ({ id, type: 'video', internal: VIDEO_MODELS[id].key })),
];
const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'];

const LOG_FILE = new URL('./service.log', import.meta.url);
const LOG_MAX_BYTES = 5 * 1024 * 1024;

/** 服务日志：stdout（由插件 main.js 转发到主进程日志）+ service.log 双写，超 5MB 截断 */
const log = (...args) => {
  const line = `${new Date().toISOString()} ${args.join(' ')}`;
  console.log(`JIMENG_API ${line}`);
  try {
    if (statSync(LOG_FILE).size > LOG_MAX_BYTES) {
      const tail = readFileSync(LOG_FILE, 'utf8').slice(-LOG_MAX_BYTES / 2);
      writeFileSync(LOG_FILE, tail.slice(tail.indexOf('\n') + 1));
    }
  } catch { /* 文件不存在时忽略 */ }
  try { appendFileSync(LOG_FILE, `${line}\n`); } catch { /* 日志失败不中断服务 */ }
};
const mask = (s) => (s ? `${String(s).slice(0, 6)}...` : '-');

/** OpenAI size（1024x1024）或原生比例（16:9）→ jimeng ratio */
function toRatio(size) {
  if (!size) return undefined;
  if (RATIOS.includes(size)) return size;
  const m = String(size).match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
  if (!m) return undefined;
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

export async function startServer({ port = 0, host = '127.0.0.1', bridgeUrl, bridgeToken = '', urls } = {}) {
  const bridge = createBridgeClient({ baseUrl: bridgeUrl, token: bridgeToken });
  const accounts = createAccountManager({ bridge, urls, onLog: log });

  /** 从请求解析账号选择与凭据，返回 { page, entry } */
  async function pickAccount(req, body = {}) {
    let explicit = req.headers['x-session-page'] || body.page_id || body.session_page || '';
    const auth = String(req.headers.authorization || '');
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!explicit && bearer && !bearer.startsWith('us-') && !bearer.startsWith('hk-')) {
      const pages = await accounts.listJimengPages();
      if (pages.some((p) => p.id === bearer)) explicit = bearer; // api key 形式传 pageId
    }
    return accounts.pick(explicit || undefined);
  }

  async function runWithAccount(req, body, fn) {
    const { page, entry } = await pickAccount(req, body);
    log(`account page=${page.id}(${page.name}) sessionid=${mask(entry.creds.sessionid)}`);
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
      return json(200, { status: 'ok', service: 'jimeng-api', ts: Date.now() });
    }

    if (req.method === 'GET' && path === '/v1/models') {
      // ?live=1 时额外拉取线上当前可用视频模型（模型下线/上新时以此为准）
      let live = null;
      if (url.searchParams.get('live') === '1') {
        try { live = await runWithAccount(req, {}, (api) => api.fetchVideoModels()); } catch (err) { live = { error: String(err.message).slice(0, 200) }; }
      }
      return json(200, {
        object: 'list',
        data: ALL_MODELS.map((m) => ({
          id: m.id, object: 'model', created: 0, owned_by: `jimeng/${m.type}`,
          meta: { type: m.type, internal: m.internal },
        })),
        ...(live ? { live_video_models: live } : {}),
      });
    }

    if (req.method === 'GET' && path === '/v1/sessionbox/pages') {
      const pages = await accounts.listJimengPages();
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
      for (const p of await accounts.listJimengPages()) accounts.invalidate(p.id);
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
      // 当前账号信息 + 积分
      const data = await runWithAccount(req, {}, async (api) => ({
        info: await api.getAccountInfo(),
        credit: await api.getCredit(),
      }));
      const info = data.info || {};
      return json(200, {
        userId: info.user_id, name: info.name || info.screen_name || null,
        credit: data.credit,
      });
    }

    if (req.method === 'POST' && path === '/v1/token/receive') {
      const received = await runWithAccount(req, body, (api) => api.receiveCredit());
      const credit = await runWithAccount(req, body, (api) => api.getCredit());
      return json(200, { received, credit });
    }

    if (req.method === 'POST' && path === '/v1/images/generations') {
      const model = body.model || DEFAULT_IMAGE_MODEL;
      requireModel(model, 'image');
      if (!body.prompt) return json(400, errPayload('缺少 prompt', 'invalid_request_error'));
      const result = await runWithAccount(req, body, (api) => api.generateImages({
        prompt: body.prompt,
        model,
        ratio: toRatio(body.size) || body.ratio || '1:1',
        resolution: body.resolution || '2k',
        sampleStrength: body.sample_strength ?? body.sampleStrength ?? 0.5,
        negativePrompt: body.negative_prompt || body.negativePrompt || '',
        intelligentRatio: body.intelligent_ratio ?? body.intelligentRatio ?? false,
      }));
      log(`images/generations model=${model} history=${result.historyId} urls=${result.urls.length} ${Math.round(result.elapsedMs / 1000)}s`);
      const urls = typeof body.n === 'number' && body.n > 0 ? result.urls.slice(0, body.n) : result.urls;
      return json(200, await toImageData(urls, body.response_format));
    }

    if (req.method === 'POST' && path === '/v1/images/compositions') {
      // JSON 形式: body.images = [url | dataURL]
      const model = body.model || DEFAULT_IMAGE_MODEL;
      requireModel(model, 'image');
      if (!body.prompt) return json(400, errPayload('缺少 prompt', 'invalid_request_error'));
      const images = body.images || body.refs || [];
      if (!Array.isArray(images) || images.length === 0) {
        return json(400, errPayload('images 至少需要 1 张图片（url 或 dataURL）', 'invalid_request_error'));
      }
      const result = await runWithAccount(req, body, (api) => api.generateImageComposition({
        prompt: body.prompt,
        images,
        model,
        ratio: toRatio(body.size) || body.ratio || '1:1',
        resolution: body.resolution || '2k',
        sampleStrength: body.sample_strength ?? body.sampleStrength ?? 0.5,
        negativePrompt: body.negative_prompt || body.negativePrompt || '',
        intelligentRatio: body.intelligent_ratio ?? body.intelligentRatio ?? false,
      }));
      log(`images/compositions model=${model} history=${result.historyId} urls=${result.urls.length} ${Math.round(result.elapsedMs / 1000)}s`);
      return json(200, await toImageData(result.urls, body.response_format));
    }

    if (req.method === 'POST' && path === '/v1/images/edits') {
      // OpenAI 兼容: multipart/form-data（image 文件 + prompt）
      const form = await parseForm(req, rawBody);
      const str = (v) => (v == null ? undefined : String(v));
      const model = str(form.get('model')) || DEFAULT_IMAGE_MODEL;
      requireModel(model, 'image');
      const imageFiles = [...form.getAll('image'), ...form.getAll('image[]'), ...form.getAll('images')].filter((f) => f && typeof f === 'object');
      if (imageFiles.length === 0) {
        return json(400, errPayload('multipart 表单缺少 image 文件字段', 'invalid_request_error'));
      }
      const images = [];
      for (const file of imageFiles.slice(0, 10)) {
        images.push({ buffer: Buffer.from(await file.arrayBuffer()) });
      }
      const result = await runWithAccount(req, {}, (api) => api.generateImageComposition({
        prompt: str(form.get('prompt')) || '',
        images,
        model,
        ratio: toRatio(str(form.get('size'))) || str(form.get('ratio')) || '1:1',
        resolution: str(form.get('resolution')) || '2k',
        sampleStrength: Number(str(form.get('sample_strength')) || 0.5),
      }));
      log(`images/edits model=${model} history=${result.historyId} urls=${result.urls.length} ${Math.round(result.elapsedMs / 1000)}s`);
      return json(200, await toImageData(result.urls, str(form.get('response_format'))));
    }

    if (req.method === 'POST' && path === '/v1/videos/generations') {
      const model = body.model || DEFAULT_VIDEO_MODEL;
      requireModel(model, 'video');
      if (!body.prompt) return json(400, errPayload('缺少 prompt', 'invalid_request_error'));
      // 参考图兼容: file_paths / filePaths / image / images（首帧+尾帧，最多 2 张）
      const imageUrls = [
        ...(Array.isArray(body.file_paths) ? body.file_paths : []),
        ...(Array.isArray(body.filePaths) ? body.filePaths : []),
        ...(Array.isArray(body.images) ? body.images : []),
        body.image,
      ].filter(Boolean).flat().slice(0, 2);
      const result = await runWithAccount(req, body, (api) => api.generateVideo({
        prompt: body.prompt,
        model,
        ratio: toRatio(body.size) || body.ratio || '16:9',
        resolution: body.resolution || '720p',
        duration: Number(body.duration) || 5,
        imageUrls,
      }));
      log(`videos/generations model=${model} history=${result.historyId} ${Math.round(result.elapsedMs / 1000)}s`);
      if (body.response_format === 'b64_json') {
        const b64 = Buffer.from(await (await fetch(result.url)).arrayBuffer()).toString('base64');
        return json(200, { created: Math.floor(Date.now() / 1000), data: [{ b64_json: b64, revised_prompt: body.prompt }] });
      }
      return json(200, { created: Math.floor(Date.now() / 1000), data: [{ url: result.url, revised_prompt: body.prompt }], history_id: result.historyId });
    }

    const taskMatch = path.match(/^\/v1\/tasks\/([^/]+)$/);
    if (req.method === 'GET' && taskMatch) {
      const data = await runWithAccount(req, {}, (api) => api.getHistory(decodeURIComponent(taskMatch[1])));
      return json(200, data);
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(errPayload(`未知路由 ${req.method} ${path}`, 'not_found')));
  }

  function requireModel(model, type) {
    const map = type === 'image' ? IMAGE_MODELS : VIDEO_MODELS;
    if (!map[model]) {
      const err = new Error(`未知模型 ${model}（或模型类型不符）。可用 ${type} 模型: ${Object.keys(map).join(', ')}`);
      err.code = 'UNKNOWN_MODEL';
      err.status = 400;
      throw err;
    }
  }

  /** urls → OpenAI images 响应 data（url 或 b64_json） */
  async function toImageData(urls, responseFormat) {
    if (responseFormat === 'b64_json') {
      const encoded = await Promise.all(urls.map(async (u) => Buffer.from(await (await fetch(u)).arrayBuffer()).toString('base64')));
      return { created: Math.floor(Date.now() / 1000), data: encoded.map((b64) => ({ b64_json: b64 })) };
    }
    return { created: Math.floor(Date.now() / 1000), data: urls.map((url) => ({ url })) };
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

  await new Promise((r) => server.listen(port, host, r));
  log(`jimeng-api 服务已启动 ${host}:${server.address().port} bridge=${bridgeUrl}`);
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
  const port = Number(process.env.JIMENG_PORT || 19203);
  const urls = process.env.JIMENG_API_URLS ? JSON.parse(process.env.JIMENG_API_URLS) : undefined;
  startServer({ port, bridgeUrl, bridgeToken: process.env.SESSIONBOX_API_TOKEN || '', urls })
    .then(({ port: actual }) => console.log(`jimeng-api listening on http://127.0.0.1:${actual}`))
    .catch((err) => { console.error(err); process.exit(1); });
}
