#!/usr/bin/env node
/**
 * l0veyou-api 服务：把 SessionBox 管理的 l0veyou.com 账号暴露为 OpenAI 兼容 API（零依赖）
 *
 * 端点:
 *   GET  /health                     存活检查
 *   GET  /v1/models                  图片模型列表
 *   GET  /v1/sessionbox/pages        列出 l0veyou 账号页面（凭据就绪状态）
 *   POST /v1/sessionbox/refresh      清空凭据缓存
 *   GET  /v1/sessionbox/account      当前账号信息（balance/concurrency）
 *   GET  /v1/tasks                   历史任务列表（?limit=10 截断）
 *   GET  /v1/tasks/:taskId           任务详情直通
 *   POST /v1/images/generations      文生图 / 图生图（参考图 image/refs/images 字段，dataURL 或 http url）
 *   POST /v1/images/edits            OpenAI 兼容 multipart（image 文件作参考图）
 *
 * 账号选择（SessionBox 页面 = 账号）:
 *   x-session-page 头 > Authorization: Bearer <pageId>（命中页面 id 时）> body.page_id > 自动（open 的优先）
 *
 * 环境变量: LOVEYOU_PORT(19202) SESSIONBOX_API_URL(127.0.0.1:19100) SESSIONBOX_API_TOKEN
 */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createBridgeClient } from './sessionbox.mjs';
import { createAccountManager } from './accounts.mjs';
import { MODELS, ASPECT_RATIOS } from '../api-client.mjs';
import {
  createLogger, createMask, str, errPayload, toErrorResponse, parseJsonBody, parseForm,
  createPickAccount, createRunWithAccount, createRequestHandler,
} from '../../_shared/server-kit.mjs';

const DEFAULT_MODEL = 'gpt-image-2';
const ALL_MODELS = MODELS.image;
const LOG_FILE = new URL('./service.log', import.meta.url);
const log = createLogger({ prefix: 'L0VEYOU_API', logFile: LOG_FILE });
const mask = createMask(8);

/** OpenAI size（1024x1024、1536x1024 等）或原生比例（16:9）→ l0veyou aspect_ratio */
function toRatio(size) {
  if (!size) return '1:1';
  if (ASPECT_RATIOS.includes(size)) return size;
  const m = String(size).match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
  if (!m) return '1:1';
  const target = Number(m[1]) / Number(m[2]);
  let best = '1:1';
  let bestDiff = Infinity;
  for (const r of ASPECT_RATIOS) {
    const [w, h] = r.split(':').map(Number);
    const diff = Math.abs(w / h - target);
    if (diff < bestDiff) { bestDiff = diff; best = r; }
  }
  return best;
}

/** http(s) 图片 url → dataURL（上游参考图只收 dataURL）；data: 开头原样返回 */
async function toDataUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw Object.assign(new Error(`下载参考图失败 ${res.status}: ${url.slice(0, 120)}`), { code: 'REF_DOWNLOAD', status: 400 });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) throw Object.assign(new Error('参考图超过 8MiB 上限'), { code: 'REF_TOO_LARGE', status: 400 });
  return `data:${res.headers.get('content-type')?.split(';')[0] || 'image/png'};base64,${buf.toString('base64')}`;
}

export async function startServer({ port = 0, host = '127.0.0.1', bridgeUrl, bridgeToken = '', baseUrl, pollIntervalMs = 3000 } = {}) {
  const bridge = createBridgeClient({ baseUrl: bridgeUrl, token: bridgeToken });
  const accounts = createAccountManager({ bridge, baseUrl, onLog: log });

  const pickAccount = createPickAccount({ accounts, listPages: () => accounts.listL0veyouPages() });
  const runWithAccount = createRunWithAccount({ pickAccount, accounts, log, describeEntry: (entry) => ` token=${mask(entry.creds.token)}` });

  const server = createServer(createRequestHandler({
    handle,
    log,
    allowHeaders: 'authorization, content-type, x-session-page, x-filename',
  }));

  async function handle(req, res, path, url, rawBody) {
    const body = parseJsonBody(req, rawBody);
    const json = (status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };

    if (req.method === 'GET' && path === '/health') {
      return json(200, { status: 'ok', service: 'l0veyou-api', ts: Date.now() });
    }

    if (req.method === 'GET' && path === '/v1/models') {
      return json(200, {
        object: 'list',
        data: ALL_MODELS.map((m) => ({
          id: m.id, object: 'model', created: 0, owned_by: 'l0veyou/image',
          meta: { label: m.label, maxRefs: m.maxRefs, maxNum: m.maxNum, aspect_ratios: ASPECT_RATIOS },
        })),
      });
    }

    if (req.method === 'GET' && path === '/v1/sessionbox/pages') {
      const pages = await accounts.listL0veyouPages();
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
      for (const p of await accounts.listL0veyouPages()) accounts.invalidate(p.id);
      log('凭据缓存已清空');
      return json(200, { refreshed: true });
    }

    if (req.method === 'GET' && path === '/v1/sessionbox/account') {
      const data = await runWithAccount(req, {}, (api) => api.getMe());
      return json(200, {
        userId: data.id, email: data.email, role: data.role, status: data.status,
        balance: data.balance, frozen_balance: data.frozen_balance,
        concurrency: data.concurrency, multi_reference_enabled: data.multi_reference_enabled,
      });
    }

    if (req.method === 'GET' && path === '/v1/tasks') {
      const tasks = await runWithAccount(req, {}, (api) => api.listTasks());
      // 上游返回乱序（实测同一响应内 created_at 无序），先按时间倒序再截断
      const sorted = [...tasks].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      const limit = Number(url.searchParams.get('limit')) || 10;
      return json(200, { total: tasks.length, data: sorted.slice(0, limit) });
    }

    const taskMatch = path.match(/^\/v1\/tasks\/([^/]+)$/);
    if (req.method === 'GET' && taskMatch) {
      const data = await runWithAccount(req, {}, (api) => api.getTask(decodeURIComponent(taskMatch[1])));
      return json(200, data);
    }

    if (req.method === 'POST' && path === '/v1/images/generations') {
      requireModel(body);
      const model = ALL_MODELS.find((m) => m.id === body.model);
      const num = Math.min(Number(body.n) || Number(body.num) || 1, model.maxNum);
      if (num > 1 && model.maxNum < 2) {
        return json(400, errPayload(`模型 ${model.id} 不支持多张生成（n>1 仅 gpt-image-2-5-* 支持）`, 'UNSUPPORTED_NUM'));
      }
      if (!body.prompt) return json(400, errPayload('prompt 不能为空', 'invalid_request_error'));

      const refInputs = [body.image, ...(Array.isArray(body.refs) ? body.refs : []), ...(Array.isArray(body.images) ? body.images : [])].filter(Boolean);
      if (refInputs.length > model.maxRefs) {
        return json(400, errPayload(`模型 ${model.id} 最多 ${model.maxRefs} 张参考图（收到 ${refInputs.length} 张）`, 'TOO_MANY_REFS'));
      }
      const refs = [];
      for (const r of refInputs) refs.push(await toDataUrl(r));

      const task = await runWithAccount(req, body, (api) => api.generateImage({
        prompt: body.prompt, model: body.model, aspect_ratio: toRatio(body.size || body.aspect_ratio), num, images: refs,
      }));
      log(`task create model=${body.model} ratio=${toRatio(body.size || body.aspect_ratio)} refs=${refs.length} taskId=${task.id}`);

      const result = await runWithAccount(req, body, (api) => api.waitForTask(task.id, { timeoutMs: 300000, intervalMs: pollIntervalMs }));
      const imageUrls = result.image_urls || [];
      if (body.response_format === 'b64_json') {
        const encoded = [];
        for (const u of imageUrls) encoded.push(Buffer.from(await (await fetch(u)).arrayBuffer()).toString('base64'));
        return json(200, { created: Math.floor(Date.now() / 1000), data: encoded.map((b64) => ({ b64_json: b64 })) });
      }
      return json(200, { created: Math.floor(Date.now() / 1000), data: imageUrls.map((u) => ({ url: u })) });
    }

    if (req.method === 'POST' && path === '/v1/images/edits') {
      // OpenAI images/edits: multipart/form-data（image 文件 + prompt），mask 忽略（上游未暴露局部重绘）
      const form = await parseForm(req, rawBody);
      const body2 = { model: str(form.get('model')), prompt: str(form.get('prompt')) };
      requireModel(body2);
      const model = ALL_MODELS.find((m) => m.id === body2.model);
      if (form.get('mask')) log('images/edits 收到 mask，已忽略（上游未暴露局部重绘参数）');

      const imageFiles = [...form.getAll('image'), ...form.getAll('image[]'), ...form.getAll('images')].filter((f) => f && typeof f === 'object');
      if (imageFiles.length === 0) {
        return json(400, errPayload('multipart 表单缺少 image 文件字段', 'invalid_request_error'));
      }
      if (imageFiles.length > model.maxRefs) {
        return json(400, errPayload(`模型 ${model.id} 最多 ${model.maxRefs} 张参考图（收到 ${imageFiles.length} 张）`, 'TOO_MANY_REFS'));
      }
      const refs = [];
      for (const file of imageFiles.slice(0, model.maxRefs)) {
        const buf = Buffer.from(await file.arrayBuffer());
        refs.push(`data:${file.type || 'image/png'};base64,${buf.toString('base64')}`);
      }

      const task = await runWithAccount(req, body2, (api) => api.generateImage({
        prompt: body2.prompt || '', model: body2.model, aspect_ratio: toRatio(str(form.get('size'))), num: 1, images: refs,
      }));
      log(`task create(edits) model=${body2.model} refs=${refs.length} taskId=${task.id}`);
      const result = await runWithAccount(req, body2, (api) => api.waitForTask(task.id, { timeoutMs: 300000, intervalMs: pollIntervalMs }));
      const imageUrls = result.image_urls || [];
      if (str(form.get('response_format')) === 'b64_json') {
        const encoded = [];
        for (const u of imageUrls) encoded.push(Buffer.from(await (await fetch(u)).arrayBuffer()).toString('base64'));
        return json(200, { created: Math.floor(Date.now() / 1000), data: encoded.map((b64) => ({ b64_json: b64 })) });
      }
      return json(200, { created: Math.floor(Date.now() / 1000), data: imageUrls.map((u) => ({ url: u })) });
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(errPayload(`未知路由 ${req.method} ${path}`, 'not_found')));
  }

  function requireModel(body) {
    if (!body.model) body.model = DEFAULT_MODEL;
    const model = ALL_MODELS.find((m) => m.id === body.model);
    if (!model) {
      const err = new Error(`未知模型 ${body.model}。可用模型见 GET /v1/models（共 ${ALL_MODELS.length} 个）`);
      err.code = 'UNKNOWN_MODEL';
      err.status = 400;
      throw err;
    }
  }

  await new Promise((r) => server.listen(port, host, r));
  log(`l0veyou-api 服务已启动 ${host}:${server.address().port} bridge=${bridgeUrl}`);
  return {
    server,
    port: server.address().port,
    close: () => new Promise((r) => server.close(r)),
  };
}

// ---------- main ----------
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const bridgeUrl = process.env.SESSIONBOX_API_URL || 'http://127.0.0.1:19100';
  const port = Number(process.env.LOVEYOU_PORT || 19202);
  startServer({ port, bridgeUrl, bridgeToken: process.env.SESSIONBOX_API_TOKEN || '', baseUrl: process.env.LOVEYOU_API_BASE })
    .then(({ port: actual }) => console.log(`l0veyou-api listening on http://127.0.0.1:${actual}`))
    .catch((err) => { console.error(err); process.exit(1); });
}
