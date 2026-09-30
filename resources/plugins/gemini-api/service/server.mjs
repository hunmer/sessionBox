#!/usr/bin/env node
/**
 * gemini-api 服务：把 SessionBox 管理的 Gemini 账号暴露为 OpenAI 兼容 API（零依赖）
 *
 * 端点:
 *   GET  /health                     存活检查
 *   GET  /v1/models                  模型列表（chat/image/video 三类；?refresh=1 重新发现）
 *   GET  /v1/sessionbox/pages        列出 Gemini 账号页面（凭据就绪状态）
 *   POST /v1/sessionbox/refresh      清空凭据缓存
 *   POST /v1/chat/completions        文本对话（stream 支持；多模态 image_url；生图模型自动生图）
 *   POST /v1/images/generations      文生图（prompt → 图片模型，返回 url 或 b64_json）
 *   POST /v1/images/edits            OpenAI 兼容图生图（multipart image 文件 + prompt）
 *   POST /v1/videos/generations      文/图生视频（image 为参考图；同步轮询直到视频就绪）
 *   GET  /v1/admin/logs              最近服务日志
 *
 * 账号选择（SessionBox 页面 = 账号）:
 *   x-session-page 头 > Authorization: Bearer <pageId>（命中页面 id 时）> body.page_id > 自动（open 的优先）
 *
 * 环境变量: GEMINI_PORT(19205) SESSIONBOX_API_URL(127.0.0.1:19100) SESSIONBOX_API_TOKEN
 *           GEMINI_TEMPORARY(默认 1：临时会话，不污染账号网页历史；视频请求始终用普通会话)
 *           GEMINI_PROXY(http://127.0.0.1:7890，需 Node ≥ 24 配合 NODE_USE_ENV_PROXY=1 使用)
 *
 * 独立调试: NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 \
 *           node --max-http-header-size=262144 service/server.mjs
 *           （gemini.google.com 首页 set-cookie 极多，默认 16KB 响应头会溢出）
 */
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createBridgeClient } from './sessionbox.mjs';
import { createAccountManager, SessionBoxAccountError } from './accounts.mjs';
import { fetchBinary, pollMediaUrl } from '../api-client.mjs';

const LOG_FILE = new URL('./service.log', import.meta.url);
const LOG_MAX_BYTES = 5 * 1024 * 1024;

/** 服务日志：stdout（由插件 main.js 转发到主进程日志）+ service.log 双写，超 5MB 截断 */
const log = (...args) => {
  const line = `${new Date().toISOString()} ${args.join(' ')}`;
  console.log(`GEMINI_API ${line}`);
  try {
    if (statSync(LOG_FILE).size > LOG_MAX_BYTES) {
      const tail = readFileSync(LOG_FILE, 'utf8').slice(-LOG_MAX_BYTES / 2);
      writeFileSync(LOG_FILE, tail.slice(tail.indexOf('\n') + 1));
    }
  } catch { /* 文件不存在时忽略 */ }
  try { appendFileSync(LOG_FILE, `${line}\n`); } catch { /* 日志失败不中断服务 */ }
};
const mask = (s) => (s ? `${String(s).slice(0, 6)}...` : '-');

// 生图指令（移植自 Gemini-FastAPI _build_image_generation_instruction）
const IMAGE_INSTRUCTION = [
  'IMAGE GENERATION ENABLED: When an image is requested, you MUST return a real generated image directly.',
  '1. For new requests, generate new images matching the description immediately.',
  '2. For edits to existing images, apply changes and return a new generated version.',
  '3. CRITICAL: Provide ZERO text explanation, prologue, or apologies. Do not describe the creation process.',
  '4. NEVER send placeholder text or descriptions like \'Generating image...\' without an actual image attachment.',
].join('\n');

const estimateTokens = (s) => (s ? Math.ceil(s.length / 3) : 0);

function modelType(name) {
  const n = String(name).toLowerCase();
  if (/image|banana|imagen/.test(n)) return 'image';
  if (/veo|video/.test(n)) return 'video';
  return 'chat';
}

/** 多轮 messages 拼接为 ChatML prompt（无状态多轮，末尾开放 assistant 标签） */
function buildPrompt(messages) {
  const parts = [];
  for (const msg of messages) {
    const role = msg.role === 'developer' ? 'system' : msg.role;
    let text = '';
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content.filter((c) => c && c.type === 'text').map((c) => c.text || '').join('\n');
    }
    parts.push(`<|im_start|>${role}\n${text}\n<|im_end|>`);
  }
  parts.push('<|im_start|>assistant\n');
  return parts.join('\n');
}

/** 从 OpenAI 消息里抽取图片（image_url 数组），返回 [{ url }] */
function extractImageRefs(messages) {
  const refs = [];
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue;
    for (const item of msg.content) {
      const url = item?.type === 'image_url' && item.image_url?.url;
      if (url) refs.push({ url });
    }
  }
  return refs;
}

/** url / dataURL → { buffer, filename } */
async function loadImage(url, index) {
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;]+);base64,(.*)$/s);
    if (!m) throw Object.assign(new Error('无效的 dataURL'), { code: 'INVALID_IMAGE', status: 400 });
    const ext = (m[1].split('/')[1] || 'png').replace('jpeg', 'jpg');
    return { buffer: Buffer.from(m[2], 'base64'), filename: `input_${index}.${ext}` };
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw Object.assign(new Error(`参考图下载失败（HTTP ${res.status}）`), { code: 'IMAGE_DOWNLOAD_FAILED', status: 400 });
  const buffer = Buffer.from(await res.arrayBuffer());
  const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || `input_${index}`);
  const ext = /\.[a-z0-9]{2,5}$/i.test(name) ? '' : guessExt(res.headers.get('content-type'));
  return { buffer, filename: `${name}${ext}`.slice(0, 80) };
}

function guessExt(contentType) {
  const map = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4' };
  return map[String(contentType || '').split(';')[0]] || '.png';
}

export async function startServer({ port = 0, host = '127.0.0.1', bridgeUrl, bridgeToken = '', temporary, urls } = {}) {
  const bridge = createBridgeClient({ baseUrl: bridgeUrl, token: bridgeToken });
  const accounts = createAccountManager({ bridge, onLog: log, urls });
  const useTemporary = temporary ?? (process.env.GEMINI_TEMPORARY !== '0');

  // gg-dl/lh3 二段重定向（work.fife.usercontent.google.com）需要的独立域 cookie，按页面缓存 1h
  const FIFE_URL = 'https://work.fife.usercontent.google.com';
  const fifeCookieCache = new Map(); // pageId -> { header, at }
  async function fifeCookieHeader(pageId) {
    const hit = fifeCookieCache.get(pageId);
    if (hit && Date.now() - hit.at < 3600_000) return hit.header;
    const cookies = await bridge.getCookies(pageId, FIFE_URL);
    const header = (cookies || []).map((c) => `${c.name}=${c.value}`).join('; ');
    fifeCookieCache.set(pageId, { header, at: Date.now() });
    return header;
  }

  async function pickAccount(req, body = {}) {
    let explicit = req.headers['x-session-page'] || body.page_id || body.session_page || '';
    const auth = String(req.headers.authorization || '');
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!explicit && bearer && !bearer.startsWith('sk-') && !bearer.startsWith('gsk_')) {
      const pages = await accounts.listGeminiPages();
      if (pages.some((p) => p.id === bearer)) explicit = bearer; // api key 形式传 pageId
    }
    return accounts.pick(explicit || undefined);
  }

  /** 非流式账号调用 */
  async function runWithAccount(req, body, fn) {
    const { page, entry } = await pickAccount(req, body);
    log(`account page=${page.id}(${page.name}) 1psid=${mask(entry.creds.cookies.find((c) => c.name === '__Secure-1PSID')?.value)}`);
    return accounts.withClient(page.id, fn);
  }

  /** 收集一个完整 chat 输出（供 images / videos 端点复用） */
  async function generateForMedia(req, { prompt, images = [], model, temporary: tmp }) {
    const { page } = await pickAccount(req, {});
    return accounts.withClient(page.id, async (client) => {
      await client.init();
      const files = [];
      let index = 0;
      for (const img of images) {
        const loaded = await loadImage(img, index++);
        files.push({ url: await client.uploadFile(loaded), filename: loaded.filename });
      }
      const fullPrompt = `<|im_start|>user\n${prompt}\n<|im_end|>\n<|im_start|>assistant\n`;
      const output = await client.generateOnce({
        prompt: fullPrompt,
        files,
        model,
        temporary: tmp ?? useTemporary,
      });
      return { output, cookieHeader: client.cookieHeader, redirectCookieHeader: await fifeCookieHeader(page.id) };
    });
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
      return json(200, { status: 'ok', service: 'gemini-api', ts: Date.now() });
    }

    if (req.method === 'GET' && path === '/v1/models') {
      const data = await runWithAccount(req, {}, async (client) => {
        await client.init();
        if (url.searchParams.get('refresh') === '1') await client.fetchModels();
        return client.models;
      });
      return json(200, {
        object: 'list',
        data: (data || []).map((m) => ({
          id: m.modelName,
          object: 'model',
          created: 0,
          owned_by: 'google',
          meta: { type: modelType(m.modelName), model_id: m.modelId, display_name: m.displayName, description: m.description },
        })),
      });
    }

    if (req.method === 'GET' && path === '/v1/sessionbox/pages') {
      const pages = await accounts.listGeminiPages();
      const out = [];
      for (const p of pages) {
        let ready = false;
        let reason = '';
        try {
          const entry = await accounts.resolve(p.id);
          await entry.client.init();
          ready = true;
        } catch (err) { reason = String(err.message).slice(0, 200); }
        out.push({ id: p.id, name: p.name, url: p.url, open: !!p.open, ready, reason });
      }
      return json(200, { pages: out });
    }

    if (req.method === 'POST' && path === '/v1/sessionbox/refresh') {
      for (const p of await accounts.listGeminiPages()) accounts.invalidate(p.id);
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

    const fileMatch = path.match(/^\/v1\/files\/([a-f0-9]+)$/);
    if (req.method === 'GET' && fileMatch) {
      const entry = fileStore.get(fileMatch[1]);
      if (!entry || entry.expiresAt < Date.now()) {
        fileStore.delete(fileMatch[1]);
        return json(404, errPayload('文件不存在或已过期', 'not_found'));
      }
      res.writeHead(200, {
        'content-type': entry.contentType,
        'content-length': entry.buffer.length,
        'cache-control': 'private, max-age=1800',
      });
      res.end(entry.buffer);
      return;
    }

    if (req.method === 'POST' && path === '/v1/chat/completions') {
      return handleChatCompletions(req, res, body);
    }

    if (req.method === 'POST' && path === '/v1/images/generations') {
      const prompt = String(body.prompt || '');
      if (!prompt) return json(400, errPayload('缺少 prompt', 'invalid_request_error'));
      const model = body.model || '';
      const { output, cookieHeader, redirectCookieHeader } = await generateForMedia(req, { prompt: `${IMAGE_INSTRUCTION}\n\n${prompt}`, model });
      log(`images/generations model=${model || 'auto'} images=${output.images.length}`);
      if (!output.images.length) {
        return json(502, errPayload(`模型未返回图片${output.text ? `（回复: ${String(output.text).slice(0, 200)}）` : ''}`, 'NO_IMAGE'));
      }
      return json(200, await toImageData(output.images.map((i) => i.url), body.response_format, body.n, cookieHeader, redirectCookieHeader, req));
    }

    if (req.method === 'POST' && path === '/v1/images/edits') {
      // OpenAI 兼容: multipart/form-data（image 文件 + prompt）
      const form = await parseForm(req, rawBody);
      const str = (v) => (v == null ? undefined : String(v));
      const prompt = str(form.get('prompt')) || '';
      if (!prompt) return json(400, errPayload('缺少 prompt', 'invalid_request_error'));
      const imageFiles = [...form.getAll('image'), ...form.getAll('image[]'), ...form.getAll('images')].filter((f) => f && typeof f === 'object');
      if (imageFiles.length === 0) {
        return json(400, errPayload('multipart 表单缺少 image 文件字段', 'invalid_request_error'));
      }
      const { page } = await pickAccount(req, {});
      const { output, cookieHeader, redirectCookieHeader } = await accounts.withClient(page.id, async (client) => {
        await client.init();
        const files = [];
        let i = 0;
        for (const file of imageFiles.slice(0, 8)) {
          const filename = file.name || `input_${i}.png`;
          const buffer = Buffer.from(await file.arrayBuffer());
          files.push({ url: await client.uploadFile({ buffer, filename }), filename });
          i++;
        }
        return {
          output: await client.generateOnce({
            prompt: `<|im_start|>user\n${IMAGE_INSTRUCTION}\n\n${prompt}\n<|im_end|>\n<|im_start|>assistant\n`,
            files,
            model: str(form.get('model')) || undefined,
            temporary: useTemporary,
          }),
          cookieHeader: client.cookieHeader,
          redirectCookieHeader: await fifeCookieHeader(page.id),
        };
      });
      log(`images/edits images=${output.images.length}`);
      if (!output.images.length) {
        return json(502, errPayload(`模型未返回图片${output.text ? `（回复: ${String(output.text).slice(0, 200)}）` : ''}`, 'NO_IMAGE'));
      }
      return json(200, await toImageData(output.images.map((i) => i.url), str(form.get('response_format')), undefined, cookieHeader, redirectCookieHeader, req));
    }

    if (req.method === 'POST' && path === '/v1/videos/generations') {
      const prompt = String(body.prompt || '');
      if (!prompt) return json(400, errPayload('缺少 prompt', 'invalid_request_error'));
      const images = [
        ...(Array.isArray(body.images) ? body.images : []),
        body.image,
      ].filter(Boolean).flat().slice(0, 3);
      // 视频生成需要普通会话（临时会话无历史可恢复，且部分能力受限）
      const { output, cookieHeader, redirectCookieHeader } = await generateForMedia(req, { prompt, images, model: body.model || '', temporary: false });
      log(`videos/generations model=${body.model || 'auto'} videos=${output.videos.length}`);
      if (!output.videos.length) {
        return json(502, errPayload(`模型未返回视频${output.text ? `（回复: ${String(output.text).slice(0, 200)}）` : ''}`, 'NO_VIDEO'));
      }
      const video = output.videos[0];
      const timeoutMs = Math.min(Number(body.poll_timeout) || 300000, 1200000);
      const { buffer, contentType } = await pollMediaUrl(video.url, {
        timeoutMs,
        intervalMs: Number(body.poll_interval) || 10000,
        onProgress: (status) => log(`video polling status=${status}`),
        cookieHeader,
        redirectCookieHeader,
      });
      if (body.response_format === 'b64_json') {
        return json(200, {
          created: Math.floor(Date.now() / 1000),
          data: [{ b64_json: buffer.toString('base64'), revised_prompt: prompt }],
        });
      }
      // gg-dl/lh3 直链要求登录态且会过期，url 模式返回本服务中转地址
      return json(200, {
        created: Math.floor(Date.now() / 1000),
        data: [{ url: serveFile(req, buffer, contentType || 'video/mp4'), revised_prompt: prompt, thumbnail_url: video.thumbnail || undefined }],
        meta: { size: buffer.length, cid: output.cid },
      });
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(errPayload(`未知路由 ${req.method} ${path}`, 'not_found')));
  }

  /** POST /v1/chat/completions（流式 / 非流式） */
  async function handleChatCompletions(req, res, body) {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify(errPayload('缺少 messages', 'invalid_request_error')));
      return;
    }
    const model = body.model || '';
    const type = modelType(model);
    const imageRefs = extractImageRefs(messages);

    // system 消息（含生图指令）前置注入
    const systemTexts = messages.filter((m) => m.role === 'system' || m.role === 'developer').map((m) => {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) return m.content.filter((c) => c?.type === 'text').map((c) => c.text || '').join('\n');
      return '';
    }).filter(Boolean);
    if (type === 'image') systemTexts.push(IMAGE_INSTRUCTION);
    const chatMessages = [
      ...(systemTexts.length ? [{ role: 'system', content: systemTexts.join('\n\n') }] : []),
      ...messages.filter((m) => m.role !== 'system' && m.role !== 'developer'),
    ];
    const prompt = buildPrompt(chatMessages);

    const completionId = `chatcmpl-${Math.random().toString(36).slice(2, 14)}`;
    const created = Math.floor(Date.now() / 1000);
    const modelName = model || 'gemini-default';
    const stream = body.stream === true;

    const { page } = await pickAccount(req, body);
    const result = await accounts.withClient(page.id, async (client) => {
      await client.init();
      const files = [];
      let index = 0;
      for (const ref of imageRefs.slice(0, 8)) {
        const loaded = await loadImage(ref.url, index++);
        files.push({ url: await client.uploadFile(loaded), filename: loaded.filename });
      }

      if (!stream) {
        const output = await client.generateOnce({ prompt, files, model, temporary: useTemporary, extendedThinking: !!body.reasoning_effort || undefined });
        return { output, cookieHeader: client.cookieHeader };
      }

      // 流式：SSE
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      const sentImages = [];
      let lastText = '';
      try {
        for await (const chunk of client.generateContent({ prompt, files, model, temporary: useTemporary, extendedThinking: !!body.reasoning_effort || undefined })) {
          if (chunk.thoughtsDelta) {
            send({ id: completionId, object: 'chat.completion.chunk', created, model: modelName, choices: [{ index: 0, delta: { reasoning_content: chunk.thoughtsDelta }, finish_reason: null }] });
          }
          if (chunk.textDelta) {
            lastText = chunk.text;
            send({ id: completionId, object: 'chat.completion.chunk', created, model: modelName, choices: [{ index: 0, delta: { content: chunk.textDelta }, finish_reason: null }] });
          }
          for (const img of chunk.images) {
            if (!sentImages.some((s) => s.url === img.url)) {
              sentImages.push(img);
              const md = `\n![image](${img.url})\n`;
              lastText += md;
              send({ id: completionId, object: 'chat.completion.chunk', created, model: modelName, choices: [{ index: 0, delta: { content: md }, finish_reason: null }] });
            }
          }
          for (const vid of chunk.videos) {
            const md = `\n[video](${vid.url})\n`;
            lastText += md;
            send({ id: completionId, object: 'chat.completion.chunk', created, model: modelName, choices: [{ index: 0, delta: { content: md }, finish_reason: null }] });
          }
        }
      } catch (err) {
        send({ error: { message: String(err.message).slice(0, 500), type: 'api_error', code: err.code || 'api_error' } });
        res.write('data: [DONE]\n\n');
        res.end();
        throw err;
      }
      const usage = {
        prompt_tokens: estimateTokens(prompt),
        completion_tokens: estimateTokens(lastText),
        total_tokens: estimateTokens(prompt) + estimateTokens(lastText),
      };
      send({ id: completionId, object: 'chat.completion.chunk', created, model: modelName, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage });
      res.write('data: [DONE]\n\n');
      res.end();
      return null;
    });

    if (!stream) {
      // 图片/视频直链要求登录态，下载后转本服务中转地址（视频仅附直链文本，需轮询不在此展开）
      const { output, cookieHeader } = result;
      const redirectCookieHeader = await fifeCookieHeader(page.id).catch(() => '');
      const mediaMd = [];
      for (const img of output.images) {
        try {
          const { buffer, contentType } = await fetchBinary(img.url, 120000, cookieHeader, redirectCookieHeader);
          mediaMd.push(`\n![image](${serveFile(req, buffer, contentType || 'image/png')})`);
        } catch { mediaMd.push(`\n![image](${img.url})`); }
      }
      // 生图时 Gemini 常返回 "_704" 之类占位闪烁文本，有图片时清掉
      const text = output.images.length && /^[_\s\d]*$/.test(output.text) ? '' : output.text;
      const content = text + mediaMd.join('') + output.videos.map((v) => `\n[video](${v.url})`).join('');
      const usage = {
        prompt_tokens: estimateTokens(prompt),
        completion_tokens: estimateTokens(content) + estimateTokens(output.thoughts),
        total_tokens: 0,
        reasoning_tokens: estimateTokens(output.thoughts),
      };
      usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: completionId,
        object: 'chat.completion',
        created,
        model: modelName,
        choices: [{
          index: 0,
          message: { role: 'assistant', content, reasoning_content: output.thoughts || undefined },
          finish_reason: 'stop',
        }],
        usage,
      }));
    }
  }

  // ---------- 生成媒体中转（gg-dl/lh3 直链要求登录态且过期快，url 模式统一走本服务） ----------
  const fileStore = new Map(); // id -> { buffer, contentType, expiresAt }
  const FILE_TTL_MS = 30 * 60 * 1000;

  function serveFile(req, buffer, contentType) {
    const id = crypto.randomUUID().replace(/-/g, '');
    fileStore.set(id, { buffer, contentType, expiresAt: Date.now() + FILE_TTL_MS });
    if (fileStore.size > 200) {
      const now = Date.now();
      for (const [k, v] of fileStore) if (v.expiresAt < now) fileStore.delete(k);
    }
    const host = req.headers.host || `127.0.0.1:${server.address().port}`;
    return `http://${host}/v1/files/${id}`;
  }

  /** urls → OpenAI images 响应 data（url 走本服务中转，或 b64_json） */
  async function toImageData(urls, responseFormat, n, cookieHeader = '', redirectCookieHeader = '', req) {
    const list = typeof n === 'number' && n > 0 ? urls.slice(0, n) : urls;
    const downloads = await Promise.all(list.map(async (u) => {
      const { buffer, contentType } = await fetchBinary(u, 120000, cookieHeader, redirectCookieHeader);
      return { buffer, contentType };
    }));
    if (responseFormat === 'b64_json') {
      return { created: Math.floor(Date.now() / 1000), data: downloads.map((d) => ({ b64_json: d.buffer.toString('base64') })) };
    }
    return {
      created: Math.floor(Date.now() / 1000),
      data: downloads.map((d) => ({ url: serveFile(req, d.buffer, d.contentType || 'image/png') })),
    };
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
  log(`gemini-api 服务已启动 ${host}:${server.address().port} bridge=${bridgeUrl}`);
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
  const port = Number(process.env.GEMINI_PORT || 19205);
  startServer({ port, bridgeUrl, bridgeToken: process.env.SESSIONBOX_API_TOKEN || '' })
    .then(({ port: actual }) => console.log(`gemini-api listening on http://127.0.0.1:${actual}`))
    .catch((err) => { console.error(err); process.exit(1); });
}
