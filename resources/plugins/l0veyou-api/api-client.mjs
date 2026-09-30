#!/usr/bin/env node
/**
 * l0veyou.com 图片生成 API 客户端（逆向验证版，零依赖 Node 18+）
 *
 * 凭据来源（浏览器登录后 localStorage，同源键）:
 *   - token:         localStorage `auth_token`（JWT，约 24h）
 *   - refresh_token: localStorage `refresh_token`（rt_ 前缀，刷新时旋转）
 *   - expires_at:    localStorage `token_expires_at`（毫秒时间戳）
 *
 * 用法:
 *   1. 模块: import { createClient, MODELS } from './api-client.mjs'
 *      const api = createClient({ token, refreshToken, onTokensRotated })  // 多账号每账号一实例
 *   2. CLI（凭据取环境变量 LOVEYOU_TOKEN）:
 *      LOVEYOU_TOKEN=xxx node api-client.mjs whoami | tasks | gen --prompt "..." --model gpt-image-2
 *
 * 已验证结论（2026-09-30，js-reverse 实测 + 前端源码还原）:
 *   - 认证仅需 Authorization: Bearer <auth_token>；X-Admin/User-UI-Request 头可省略
 *   - GET 请求带 ?timezone= 参数（可省略）
 *   - 响应统一包裹 {code:0, message:"success", data:...}；code!==0 即业务错误
 *   - /v1/*（OpenAI 兼容 API key 体系）与 web JWT 是两套凭据，不互通
 *   - 参考图为 base64 dataURL 直接放请求体 images 数组（无上传接口，PNG/JPEG/WebP/GIF ≤8MiB）
 */

export const MODELS = {
  image: [
    { id: 'gpt-image-2', label: 'GPT Image 2', maxRefs: 1, maxNum: 1 },
    { id: 'gpt-image-2-5-flare', label: 'GPT Image 2.5 极速版', maxRefs: 2, maxNum: 2 },
    { id: 'gpt-image-2-5-full', label: 'GPT Image 2.5 满血版', maxRefs: 2, maxNum: 2 },
  ],
};

export const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'];

/** token 过期前多少毫秒视为需要刷新 */
export const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export class L0veyouApiError extends Error {
  constructor(message, { status = 0, code = '', body = null } = {}) {
    super(message);
    this.name = 'L0veyouApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
  get isAuth() {
    return this.status === 401 || /unauthorized|token|登录|鉴权/i.test(`${this.code} ${this.message}`);
  }
}

export function createClient({
  baseUrl = 'https://l0veyou.com/api/v1',
  token = '',
  refreshToken = '',
  expiresAt = 0,
  timezone = 'Asia/Shanghai',
  fetchImpl = fetch,
  onTokensRotated = null,
} = {}) {
  const root = baseUrl.replace(/\/$/, '');

  async function request(method, path, body) {
    const url = `${root}${path}${method === 'GET' ? `?timezone=${encodeURIComponent(timezone)}` : ''}`;
    let res;
    try {
      res = await fetchImpl(url, {
        method,
        headers: {
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          'accept-language': 'zh',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new L0veyouApiError(`网络请求失败 ${method} ${path}: ${err.message}`, { code: 'NETWORK' });
    }
    let data = null;
    try { data = await res.json(); } catch { /* 非 JSON */ }
    if (!res.ok || (data && typeof data === 'object' && 'code' in data && data.code !== 0)) {
      const message = (data && (data.message || data.error)) || res.statusText || `HTTP ${res.status}`;
      const code = (data && (data.code ?? data.error)) || `HTTP_${res.status}`;
      throw new L0veyouApiError(`${method} ${path} 失败: ${message}`, { status: res.status, code: String(code), body: data });
    }
    return (data && typeof data === 'object' && 'data' in data) ? data.data : data;
  }

  const api = {
    get token() { return token; },
    get refreshToken() { return refreshToken; },
    get expiresAt() { return expiresAt; },
    get needsRefresh() { return !!refreshToken && Number(expiresAt) > 0 && Number(expiresAt) - Date.now() < TOKEN_EXPIRY_MARGIN_MS; },

    /** 账号信息（balance/concurrency/multi_reference_enabled 等） */
    getMe: () => request('GET', '/auth/me'),

    /**
     * 创建图片生成任务
     * @param {object} opts
     *   prompt        必填
     *   model         gpt-image-2 | gpt-image-2-5-flare | gpt-image-2-5-full
     *   aspect_ratio  1:1|16:9|9:16|4:3|3:4（默认 1:1）
     *   num           生成张数，仅 2.5 系列支持 >1（max 2）
     *   images        参考图 dataURL 数组（多张仅 2.5 系列；PNG/JPEG/WebP/GIF ≤8MiB）
     */
    generateImage: ({ prompt, model, aspect_ratio = '1:1', num, images }) =>
      request('POST', '/images/generate', {
        prompt, model, aspect_ratio,
        ...(num > 1 ? { num } : {}),
        ...(images?.length ? { images } : {}),
      }),

    /** 任务详情: {id, prompt, aspect_ratio, status: pending|completed|failed, image_urls[], error, created_at, updated_at} */
    getTask: (id) => request('GET', `/images/tasks/${encodeURIComponent(id)}`),

    /** 历史任务列表（无分页参数，返回全量，注意量大时截断使用） */
    listTasks: () => request('GET', '/images/tasks'),

    /**
     * 轮询直至 completed/failed（前端节奏：3s 间隔 / 180s 超时）
     * @returns completed 任务对象；failed 时抛错（message 取任务 error 字段）
     */
    async waitForTask(id, { intervalMs = 3000, timeoutMs = 180000, signal } = {}) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        if (signal?.aborted) throw new L0veyouApiError('aborted', { code: 'ABORTED' });
        const task = await api.getTask(id);
        if (task.status === 'completed') return task;
        if (task.status === 'failed') throw new L0veyouApiError(task.error || '图片生成失败', { code: 'TASK_FAILED', body: task });
        if (Date.now() > deadline) throw new L0veyouApiError(`任务 ${id} 超时（${timeoutMs}ms）`, { code: 'TASK_TIMEOUT' });
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    },

    /**
     * 用 refresh_token 换新 token（POST /auth/refresh，refresh_token 旋转）
     * @returns {access_token, refresh_token, expires_in, token_type}
     */
    async refreshTokens() {
      if (!refreshToken) throw new L0veyouApiError('无 refresh_token，无法刷新', { code: 'NO_REFRESH_TOKEN' });
      const data = await request('POST', '/auth/refresh', { refresh_token: refreshToken });
      token = data.access_token;
      refreshToken = data.refresh_token || refreshToken;
      expiresAt = Date.now() + (data.expires_in || 86400) * 1000;
      if (onTokensRotated) { try { await onTokensRotated({ token, refreshToken, expiresAt }); } catch { /* 写回失败不中断 */ } }
      return data;
    },
  };
  return api;
}

// ---------- CLI ----------
const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (invokedDirectly) {
  const [, , cmd, ...args] = process.argv;
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) opts[args[i].slice(2)] = args[++i];
  }
  const token = process.env.LOVEYOU_TOKEN;
  if (!token) {
    console.error('缺少凭据: 设置环境变量 LOVEYOU_TOKEN（页面 localStorage auth_token）');
    process.exit(1);
  }
  const api = createClient({ token, refreshToken: process.env.LOVEYOU_REFRESH_TOKEN || '' });
  try {
    if (cmd === 'whoami') {
      console.log(JSON.stringify(await api.getMe(), null, 2));
    } else if (cmd === 'tasks') {
      const tasks = await api.listTasks();
      console.log(JSON.stringify(tasks.slice(0, Number(opts.limit) || 10), null, 2));
    } else if (cmd === 'task') {
      console.log(JSON.stringify(await api.getTask(opts.id), null, 2));
    } else if (cmd === 'gen') {
      if (!opts.prompt) { console.error('用法: gen --prompt "..." [--model gpt-image-2] [--ratio 16:9] [--num 2] [--ref file.png] [--wait 0]'); process.exit(1); }
      const { readFile } = await import('node:fs/promises');
      const refs = [];
      for (const f of (opts.ref || '').split(',').filter(Boolean)) {
        const buf = await readFile(f);
        const mime = /\.jpe?g$/i.test(f) ? 'image/jpeg' : /\.webp$/i.test(f) ? 'image/webp' : /\.gif$/i.test(f) ? 'image/gif' : 'image/png';
        refs.push(`data:${mime};base64,${buf.toString('base64')}`);
      }
      const task = await api.generateImage({
        prompt: opts.prompt, model: opts.model || 'gpt-image-2', aspect_ratio: opts.ratio || '1:1',
        num: Number(opts.num) || 1, images: refs,
      });
      console.log('task:', JSON.stringify(task, null, 2));
      if (opts.wait !== '0') {
        const done = await api.waitForTask(task.id, { timeoutMs: Number(opts.timeout) || 180000 });
        console.log('result:', JSON.stringify({ status: done.status, image_urls: done.image_urls, error: done.error }, null, 2));
      }
    } else if (cmd === 'refresh') {
      console.log(JSON.stringify(await api.refreshTokens(), null, 2));
    } else {
      console.error('子命令: whoami | tasks | task --id x | gen --prompt ... | refresh');
      process.exit(1);
    }
  } catch (err) {
    console.error(`[${err.code || err.name}] ${err.message}`);
    process.exit(1);
  }
}
