/**
 * SessionBox AI 网关插件共享：HTTP 服务骨架
 * （五家 server.mjs 共用；业务路由 handle 与各家专属函数保留在各自 server.mjs）
 *
 * 提供：日志工厂（stdout+service.log 双写截断）、mask/str、请求体解析、
 * 错误响应、账号选择/调用中间件、createServer 请求分发样板。
 */
import { appendFileSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { SessionBoxAccountError } from './accounts.mjs';

/** 服务日志：stdout（由插件 main.js 转发到主进程日志）+ service.log 双写，超 5MB 截断 */
export function createLogger({ prefix, logFile, maxBytes = 5 * 1024 * 1024 } = {}) {
  return (...args) => {
    const line = `${new Date().toISOString()} ${args.join(' ')}`;
    console.log(`${prefix} ${line}`);
    try {
      if (statSync(logFile).size > maxBytes) {
        const tail = readFileSync(logFile, 'utf8').slice(-maxBytes / 2);
        writeFileSync(logFile, tail.slice(tail.indexOf('\n') + 1));
      }
    } catch { /* 文件不存在时忽略 */ }
    try { appendFileSync(logFile, `${line}\n`); } catch { /* 日志失败不中断服务 */ }
  };
}

/** 凭据脱敏（各家前缀长度不同：jimeng/gemini 6 位，l0veyou/liblib 8 位） */
export function createMask(len = 8) {
  return (s) => (s ? `${String(s).slice(0, len)}...` : '-');
}

export const str = (v) => (v == null ? undefined : String(v));

export function errPayload(message, code, type = 'invalid_request_error') {
  return { error: { message, type, code } };
}

export function toErrorResponse(err) {
  if (err instanceof SessionBoxAccountError) {
    const status = err.code === 'NO_ACCOUNT' || err.code === 'PAGE_NOT_FOUND' ? 400 : 401;
    return { status, payload: errPayload(err.message, err.code, 'account_error') };
  }
  const status = Number(err.status) || 500;
  return { status, payload: errPayload(String(err.message).slice(0, 500), err.code || 'api_error', status >= 500 ? 'server_error' : 'invalid_request_error') };
}

/**
 * 解析 JSON 请求体。
 * strict=true（默认）：非法 JSON 抛 INVALID_JSON 400；非对象一律返回 {}（四家语义）。
 * strict=false（jimeng 语义）：非法 JSON 静默返回 {}；原始值（数组/null 等）原样返回。
 */
export function parseJsonBody(req, rawBody, { strict = true } = {}) {
  if (!rawBody.length || !(req.headers['content-type'] || '').includes('application/json')) return {};
  let parsed;
  try { parsed = JSON.parse(rawBody.toString('utf8')); } catch {
    if (strict) {
      // 明确报错而非静默返回 {}：否则字段校验会误报（如 body 实为 "[object Object]"）
      throw Object.assign(new Error(`请求体不是合法 JSON: ${rawBody.toString('utf8').slice(0, 60)}`), { code: 'INVALID_JSON', status: 400 });
    }
    return {};
  }
  if (strict) return parsed && typeof parsed === 'object' ? parsed : {};
  return parsed;
}

/** 解析 multipart/form-data（借助 Node 内置 Request.formData，零依赖） */
export async function parseForm(req, rawBody) {
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('multipart/form-data')) {
    throw Object.assign(new Error('content-type 需为 multipart/form-data'), { code: 'INVALID_CONTENT_TYPE', status: 400 });
  }
  const request = new Request('http://localhost', { method: 'POST', headers: { 'content-type': contentType }, body: rawBody });
  return request.formData();
}

/**
 * 从请求解析账号选择，返回 { page, entry }：
 *   x-session-page 头 > Authorization: Bearer <pageId>（命中页面 id 时）> body.page_id > 自动（open 的优先）
 * bearerExclude：Bearer 值命中已知 api key 前缀时跳过页面匹配（gemini: sk-/gsk_，jimeng: us-/hk-）
 */
export function createPickAccount({ accounts, listPages, bearerExclude } = {}) {
  return async function pickAccount(req, body = {}) {
    let explicit = req.headers['x-session-page'] || body.page_id || body.session_page || '';
    const auth = String(req.headers.authorization || '');
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!explicit && bearer && !(bearerExclude && bearerExclude(bearer))) {
      const pages = await listPages();
      if (pages.some((p) => p.id === bearer)) explicit = bearer; // api key 形式传 pageId
    }
    return accounts.pick(explicit || undefined);
  };
}

/** 账号调用中间件：pickAccount → 记账日志 → withClient；describeEntry 返回凭据摘要后缀（可为空） */
export function createRunWithAccount({ pickAccount, accounts, log, describeEntry = () => '' } = {}) {
  return async function runWithAccount(req, body, fn) {
    const { page, entry } = await pickAccount(req, body);
    log(`account page=${page.id}(${page.name})${describeEntry(entry)}`);
    return accounts.withClient(page.id, fn);
  };
}

/**
 * createServer 请求分发样板：CORS 三头 + OPTIONS 204 + 收包 + handle 分发 +
 * 统一错误响应（toErrorResponse）+ 请求耗时日志。
 * withCause：错误日志追加 err.cause 摘要（仅 dola 使用）。
 */
export function createRequestHandler({ handle, log, allowHeaders, withCause = false } = {}) {
  return (req, res) => {
    const started = Date.now();
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;

    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', allowHeaders);
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
          const cause = withCause && err.cause ? ` cause=${String(err.cause?.message || err.cause).slice(0, 120)}` : '';
          log(`${req.method} ${path} -> ${status} (${Date.now() - started}ms) error=${err.code || ''} ${String(err.message).slice(0, 300)}${cause}`);
        })
        .finally(() => {
          if (res.writableEnded) log(`${req.method} ${path} -> ${res.statusCode} (${Date.now() - started}ms)`);
        });
    });
  };
}
