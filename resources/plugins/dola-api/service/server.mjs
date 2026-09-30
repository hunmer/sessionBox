#!/usr/bin/env node
/**
 * dola-api 服务：把 SessionBox 管理的 dola.com 账号暴露为 OpenAI 兼容 API（零依赖）
 *
 * 端点:
 *   GET  /health                     存活检查
 *   GET  /v1/models                  模型列表（对话/图像/视频）
 *   GET  /v1/sessionbox/pages        列出 dola 账号页面（登录状态）
 *   POST /v1/sessionbox/refresh      清空账号缓存
 *   POST /v1/chat/completions        对话（支持 stream；reasoning_content 携带思考过程）
 *   POST /v1/images/generations      图像生成（Seedream 4.5，同步约 20s；size/ratio/n）
 *   POST /v1/videos/generations      视频生成（Seedance，异步轮询至完成，约 3-6 分钟）
 *   GET  /v1/videos/status           按会话查询视频任务（?conversation_id=）
 *
 * 账号选择（SessionBox 页面 = 账号）:
 *   x-session-page 头 > Authorization: Bearer <pageId>（命中页面 id 时）> body.page_id > 自动（open 的优先）
 *
 * 环境变量: DOLA_PORT(19204) SESSIONBOX_API_URL(127.0.0.1:19100) SESSIONBOX_API_TOKEN
 */
import { createServer } from 'node:http';
import { appendFileSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBridgeClient } from './sessionbox.mjs';
import { createAccountManager, SessionBoxAccountError } from './accounts.mjs';
import { MODELS, messagesToPrompt, IMAGE_RATIOS } from '../api-client.mjs';

const DEFAULT_MODEL = 'dola';
const ALL_MODELS = MODELS;
const LOG_FILE = new URL('./service.log', import.meta.url);
const LOG_MAX_BYTES = 5 * 1024 * 1024;

/** 服务日志：stdout（由插件 main.js 转发到主进程日志）+ service.log 双写，超 5MB 截断 */
const log = (...args) => {
  const line = `${new Date().toISOString()} ${args.join(' ')}`;
  console.log(`DOLA_API ${line}`);
  try {
    if (statSync(LOG_FILE).size > LOG_MAX_BYTES) {
      const tail = readFileSync(LOG_FILE, 'utf8').slice(-LOG_MAX_BYTES / 2);
      writeFileSync(LOG_FILE, tail.slice(tail.indexOf('\n') + 1));
    }
  } catch { /* 文件不存在时忽略 */ }
  try { appendFileSync(LOG_FILE, `${line}\n`); } catch { /* 日志失败不中断服务 */ }
};
const mask = (s) => (s ? `${String(s).slice(0, 8)}...` : '-');

export async function startServer({ port = 0, host = '127.0.0.1', bridgeUrl, bridgeToken = '' } = {}) {
  const bridge = createBridgeClient({ baseUrl: bridgeUrl, token: bridgeToken });
  const accounts = createAccountManager({ bridge, onLog: log });

  /** 从请求解析账号选择，返回 { page, entry } */
  async function pickAccount(req, body = {}) {
    let explicit = req.headers['x-session-page'] || body.page_id || body.session_page || '';
    const auth = String(req.headers.authorization || '');
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!explicit && bearer) {
      const pages = await accounts.listDolaPages();
      if (pages.some((p) => p.id === bearer)) explicit = bearer; // api key 形式传 pageId
    }
    return accounts.pick(explicit || undefined);
  }

  async function runWithAccount(req, body, fn) {
    const { page, entry } = await pickAccount(req, body);
    log(`account page=${page.id}(${page.name})`);
    return accounts.withClient(page.id, fn);
  }

  const server = createServer((req, res) => {
    const started = Date.now();
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;

    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'authorization, content-type, x-session-page');
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
          const cause = err.cause ? ` cause=${String(err.cause?.message || err.cause).slice(0, 120)}` : '';
          log(`${req.method} ${path} -> ${status} (${Date.now() - started}ms) error=${err.code || ''} ${String(err.message).slice(0, 300)}${cause}`);
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
      return json(200, { status: 'ok', service: 'dola-api', ts: Date.now() });
    }

    if (req.method === 'GET' && path === '/v1/models') {
      return json(200, {
        object: 'list',
        data: ALL_MODELS.map((m) => ({
          id: m.id, object: 'model', created: 0, owned_by: 'dola/chat',
          meta: { label: m.label, need_deep_think: m.needDeepThink, kind: m.kind || 'chat', ...(m.kind === 'image' ? { ratios: IMAGE_RATIOS } : {}) },
        })),
      });
    }

    if (req.method === 'GET' && path === '/v1/sessionbox/pages') {
      const pages = await accounts.listDolaPages();
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
      for (const p of await accounts.listDolaPages()) accounts.invalidate(p.id);
      log('账号缓存已清空');
      return json(200, { refreshed: true });
    }

    if (req.method === 'POST' && path === '/v1/chat/completions') {
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!messages.length) return json(400, errPayload('messages 不能为空', 'invalid_request_error'));
      const model = ALL_MODELS.find((m) => m.id === body.model) || ALL_MODELS.find((m) => m.id === DEFAULT_MODEL);
      if (body.model && !ALL_MODELS.some((m) => m.id === body.model)) {
        log(`未知模型 ${body.model}，回退 ${DEFAULT_MODEL}`);
      }
      const prompt = messagesToPrompt(messages);
      const created = Math.floor(Date.now() / 1000);
      const responseModel = model.id;
      const stream = body.stream === true;

      // 会话 id 透传（可选）：body.conversation_id 复用 dola 服务端会话暂不支持（无状态实现），忽略

      if (!stream) {
        const result = await runWithAccount(req, body, (api) => api.chat({ prompt, needDeepThink: model.needDeepThink }));
        log(`chat done conv=${mask(result.conversationId)} text=${result.text.length}ch think=${result.thinking.length}ch`);
        return json(200, {
          id: `chatcmpl-${result.conversationId || Date.now()}`,
          object: 'chat.completion', created, model: responseModel,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: result.text, reasoning_content: result.thinking || undefined },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          dola_conversation_id: result.conversationId || undefined,
        });
      }

      // 流式：SSE
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      const id = `chatcmpl-${Date.now()}`;
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      send({ id, object: 'chat.completion.chunk', created, model: responseModel, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] });

      let textLen = 0;
      let thinkLen = 0;
      try {
        const result = await runWithAccount(req, body, (api) => api.chat({
          prompt,
          needDeepThink: model.needDeepThink,
          signal: req.socket ? undefined : undefined,
          onChunk: (t) => { textLen += t.length; send({ id, object: 'chat.completion.chunk', created, model: responseModel, choices: [{ index: 0, delta: { content: t }, finish_reason: null }] }); },
          onThinkChunk: (t) => { thinkLen += t.length; send({ id, object: 'chat.completion.chunk', created, model: responseModel, choices: [{ index: 0, delta: { reasoning_content: t }, finish_reason: null }] }); },
        }));
        send({ id, object: 'chat.completion.chunk', created, model: responseModel, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
        if (result.conversationId) {
          send({ id, object: 'chat.completion.chunk', created, model: responseModel, dola_conversation_id: result.conversationId, choices: [{ index: 0, delta: {}, finish_reason: null }] });
        }
        log(`chat(stream) done conv=${mask(result.conversationId)} text=${textLen}ch think=${thinkLen}ch`);
      } catch (err) {
        // 已开始流式输出，错误以 data: {"error":...} 形式给出（OpenAI 惯例）
        log(`chat(stream) error=${err.code || ''} ${String(err.message).slice(0, 200)}`);
        send({ error: { message: String(err.message).slice(0, 500), type: 'api_error', code: err.code || '' } });
      }
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    if (req.method === 'POST' && path === '/v1/images/generations') {
      if (!body.prompt) return json(400, errPayload('prompt 不能为空', 'invalid_request_error'));
      const ratio = toRatio(body.size || body.ratio || body.aspect_ratio);
      const n = Math.max(1, Math.min(Number(body.n) || 1, 4));
      // dola 单次对话默认出 4 张；n<4 时取前 n 张
      const result = await runWithAccount(req, body, (api) => api.generateImage({ prompt: body.prompt, ratio }));
      const picked = result.images.slice(0, n);
      log(`image gen ratio=${ratio} n=${picked.length}/${result.images.length} conv=${mask(result.conversationId)}`);
      if (body.response_format === 'b64_json') {
        const encoded = [];
        for (const img of picked) {
          const res = await fetch(img.url, { signal: AbortSignal.timeout(60_000) });
          if (!res.ok) throw Object.assign(new Error(`下载图片失败 ${res.status}`), { code: 'IMG_DOWNLOAD', status: 502 });
          encoded.push(Buffer.from(await res.arrayBuffer()).toString('base64'));
        }
        return json(200, { created: Math.floor(Date.now() / 1000), data: encoded.map((b64) => ({ b64_json: b64 })) });
      }
      return json(200, {
        created: Math.floor(Date.now() / 1000),
        data: picked.map((img) => ({ url: img.url, thumb: img.thumb, revised_prompt: undefined })),
        dola: { conversation_id: result.conversationId, images: picked },
      });
    }

    if (req.method === 'POST' && path === '/v1/videos/generations') {
      if (!body.prompt) return json(400, errPayload('prompt 不能为空', 'invalid_request_error'));
      const timeoutMs = Math.min(Number(body.timeout_ms) || 600_000, 1_200_000);
      const result = await runWithAccount(req, body, (api) => api.generateVideo({
        prompt: body.prompt,
        timeoutMs,
        onStatus: (s) => log(`video status: ${s}`),
      }));
      log(`video gen vid=${result.video.vid} dur=${result.video.duration}s conv=${mask(result.conversationId)}`);
      return json(200, {
        created: Math.floor(Date.now() / 1000),
        data: [{
          video_url: result.video.download_url,
          url: result.video.download_url,
          cover_url: result.video.cover,
          duration: result.video.duration,
          width: result.video.width, height: result.video.height,
        }],
        dola: { conversation_id: result.conversationId, vid: result.video.vid, submit_text: result.text },
      });
    }

    if (req.method === 'GET' && path === '/v1/videos/status') {
      const conversationId = url.searchParams.get('conversation_id') || '';
      if (!conversationId) return json(400, errPayload('缺少 conversation_id 参数', 'invalid_request_error'));
      const data = await runWithAccount(req, {}, (api) => api.pollCreations(conversationId));
      const videos = (data.creations || []).filter((c) => c.video);
      const done = videos.find((c) => Number(c.video.status) === 3 && c.video.download_url);
      return json(200, {
        conversation_id: conversationId,
        status: done ? 'completed' : videos.length ? 'generating' : 'unknown',
        video: done ? done.video : (videos[0]?.video || null),
        latest_text: data.latestText,
      });
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(errPayload(`未知路由 ${req.method} ${path}`, 'not_found')));
  }

  await new Promise((r) => server.listen(port, host, r));
  log(`dola-api 服务已启动 ${host}:${server.address().port} bridge=${bridgeUrl}`);
  return {
    server,
    port: server.address().port,
    close: () => new Promise((r) => server.close(r)),
  };
}

function parseJsonBody(req, rawBody) {
  if (!rawBody.length || !(req.headers['content-type'] || '').includes('application/json')) return {};
  let parsed;
  try { parsed = JSON.parse(rawBody.toString('utf8')); } catch {
    throw Object.assign(new Error(`请求体不是合法 JSON: ${rawBody.toString('utf8').slice(0, 60)}`), { code: 'INVALID_JSON', status: 400 });
  }
  return parsed && typeof parsed === 'object' ? parsed : {};
}

/** OpenAI size（1024x1024 等）或原生比例（16:9）→ dola 支持的比例（就近匹配） */
function toRatio(size) {
  if (!size) return '1:1';
  if (IMAGE_RATIOS.includes(size)) return size;
  const m = String(size).match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
  if (!m) return '1:1';
  const target = Number(m[1]) / Number(m[2]);
  let best = '1:1';
  let bestDiff = Infinity;
  for (const r of IMAGE_RATIOS) {
    const [w, h] = r.split(':').map(Number);
    const diff = Math.abs(w / h - target);
    if (diff < bestDiff) { bestDiff = diff; best = r; }
  }
  return best;
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
  const port = Number(process.env.DOLA_PORT || 19204);
  startServer({ port, bridgeUrl, bridgeToken: process.env.SESSIONBOX_API_TOKEN || '' })
    .then(({ port: actual }) => console.log(`dola-api listening on http://127.0.0.1:${actual}`))
    .catch((err) => { console.error(err); process.exit(1); });
}
