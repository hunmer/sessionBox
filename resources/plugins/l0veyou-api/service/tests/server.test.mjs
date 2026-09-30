/**
 * l0veyou-api 服务端到端测试（全 mock，不打真实上游）
 *
 * mock 范围:
 *   - SessionBox bridge: /api/v1/pages、/api/v1/pages/:id/execute（内嵌 localStorage 沙盒）
 *   - l0veyou 上游: auth/me、auth/refresh、images/generate、images/tasks(/:id)、CDN 图片下载
 *
 * 运行: node --test service/tests/
 */
import test from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';

/** 简版 localStorage 沙盒（供 mock bridge execute 使用） */
function createLocalStorage(initial) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    snapshot: () => ({ ...store }),
  };
}

/** mock sessionbox bridge（execute 在 localStorage 沙盒中执行页面脚本） */
async function startMockBridge({ localStorage: ls } = {}) {
  const state = { executes: [] };
  const pages = [
    { id: 'page-a', name: 'l0veyou 主号', url: 'https://l0veyou.com/chat', currentUrl: 'https://l0veyou.com/chat', open: true },
    { id: 'page-b', name: '其他站点', url: 'https://example.com', open: true },
  ];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/v1/pages') {
        res.end(JSON.stringify({ pages }));
        return;
      }
      const m = req.url.match(/^\/api\/v1\/pages\/([^/]+)\/execute$/);
      if (m) {
        const { code } = JSON.parse(body);
        state.executes.push({ pageId: m[1], code });
        try {
          const result = new Function('localStorage', `return (${code})`)(ls);
          res.end(JSON.stringify({ pageId: m[1], result: result === undefined ? null : result }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err.message) }));
        }
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not_found' }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, state, ls, url: `http://127.0.0.1:${server.address().port}` };
}

/**
 * mock l0veyou 上游（同 host 不同 path）
 * tokens.valid 集合内的 Bearer 才放行；refresh 收到 refresh_token 时旋转出新 token
 */
async function startMockUpstream() {
  const state = { generates: [], refreshes: [], meCalls: 0, taskPolls: [] };
  const tokens = { valid: new Set(['TOKEN_A']), refreshToken: 'RT_1' };
  // 任务状态机：pending 次数后 completed（预置 task-1 供详情直通测试）
  const tasks = new Map([['task-1', { pendingLeft: 0, body: {} }]]);
  let taskSeq = 0;

  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let json = {};
      try { json = body ? JSON.parse(body) : {}; } catch { /* CDN 二进制 */ }
      const auth = req.headers.authorization || '';
      const reply = (status, payload) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(payload)); };

      if (req.url.startsWith('/auth/refresh')) {
        state.refreshes.push(json);
        if (json.refresh_token !== tokens.refreshToken) return reply(401, { code: 'INVALID_REFRESH', message: 'refresh token 无效' });
        tokens.refreshToken = `RT_${tokens.refreshToken.length}_${Date.now()}`;
        tokens.valid.add('TOKEN_FRESH');
        return reply(200, { code: 0, message: 'success', data: { access_token: 'TOKEN_FRESH', refresh_token: tokens.refreshToken, expires_in: 86400, token_type: 'Bearer' } });
      }
      if (req.url.startsWith('/auth/me')) {
        if (!tokens.valid.has(auth.replace('Bearer ', ''))) return reply(401, { code: 'UNAUTHORIZED', message: 'token 无效' });
        state.meCalls++;
        return reply(200, { code: 0, message: 'success', data: { id: 3987, email: 'mock@x.invalid', role: 'user', balance: 999, frozen_balance: 0, concurrency: 5, multi_reference_enabled: true, status: 'active' } });
      }
      if (req.url === '/images/generate') {
        if (!tokens.valid.has(auth.replace('Bearer ', ''))) return reply(401, { code: 'UNAUTHORIZED', message: 'token 无效' });
        const id = `task-${++taskSeq}`;
        tasks.set(id, { pendingLeft: 2, body: json });
        state.generates.push({ auth, body: json });
        return reply(200, { code: 0, message: 'success', data: { id, prompt: json.prompt, aspect_ratio: json.aspect_ratio, status: 'pending', created_at: 'now', updated_at: 'now' } });
      }
      const m = req.url.match(/^\/images\/tasks\/([^/?]+)/);
      if (m) {
        if (!tokens.valid.has(auth.replace('Bearer ', ''))) return reply(401, { code: 'UNAUTHORIZED', message: 'token 无效' });
        const t = tasks.get(m[1]);
        if (!t) return reply(404, { code: 'NOT_FOUND', message: '任务不存在' });
        state.taskPolls.push(m[1]);
        if (t.pendingLeft-- > 0) return reply(200, { code: 0, message: 'success', data: { id: m[1], status: 'pending' } });
        return reply(200, { code: 0, message: 'success', data: { id: m[1], status: 'completed', image_urls: [`http://127.0.0.1:${server.address().port}/cdn/img1.png`], created_at: 'now', updated_at: 'now' } });
      }
      if (req.url.startsWith('/images/tasks')) {
        if (!tokens.valid.has(auth.replace('Bearer ', ''))) return reply(401, { code: 'UNAUTHORIZED', message: 'token 无效' });
        // 故意乱序：最新任务（09-30）在前，旧任务（09-28）在后，验证服务端按 created_at 倒序
        return reply(200, { code: 0, message: 'success', data: [
          { id: 'task-2', prompt: '较新', aspect_ratio: '1:1', status: 'completed', image_urls: [], created_at: '2026-09-30T12:00:00+08:00', updated_at: 'now' },
          { id: 'task-1', prompt: '历史', aspect_ratio: '1:1', status: 'completed', image_urls: [], created_at: '2026-09-28T00:00:00+08:00', updated_at: 'now' },
        ] });
      }
      if (req.url.startsWith('/cdn/')) {
        res.setHeader('content-type', 'image/png');
        res.end(Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')); // PNG 魔数片段
        return;
      }
      reply(404, { code: 'NOT_FOUND', message: 'unknown path ' + req.url });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    server, state, tokens,
    base: `http://127.0.0.1:${server.address().port}`,
    apiBase: `http://127.0.0.1:${server.address().port}`,
  };
}

async function jsonOf(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

/** 搭建一套完整 mock 环境（bridge + upstream + 被测服务） */
async function startStack({ localStorage = {} } = {}) {
  const ls = createLocalStorage({ auth_token: 'TOKEN_A', refresh_token: 'RT_1', token_expires_at: String(Date.now() + 86400_000), ...localStorage });
  const bridge = await startMockBridge({ localStorage: ls });
  const upstream = await startMockUpstream();
  const { startServer } = await import('../server.mjs');
  const svc = await startServer({ port: 0, bridgeUrl: bridge.url, baseUrl: upstream.apiBase, pollIntervalMs: 10 });
  return {
    svc, bridge, upstream, ls,
    base: `http://127.0.0.1:${svc.port}`,
    close: async () => { await svc.close(); bridge.server.close(); upstream.server.close(); },
  };
}

test('GET /health 与 /v1/models', async () => {
  const stack = await startStack();
  try {
    const health = await fetch(`${stack.base}/health`).then(jsonOf);
    assert.equal(health.service, 'l0veyou-api');
    const models = await fetch(`${stack.base}/v1/models`).then(jsonOf);
    assert.deepEqual(models.data.map((m) => m.id), ['gpt-image-2', 'gpt-image-2-5-flare', 'gpt-image-2-5-full']);
    assert.equal(models.data[1].meta.maxRefs, 2);
  } finally { await stack.close(); }
});

test('GET /v1/sessionbox/pages 区分就绪状态', async () => {
  const stack = await startStack();
  try {
    const out = await fetch(`${stack.base}/v1/sessionbox/pages`).then(jsonOf);
    assert.equal(out.pages.length, 1); // page-b（example.com）被过滤
    assert.equal(out.pages[0].id, 'page-a');
    assert.equal(out.pages[0].ready, true);
  } finally { await stack.close(); }
});

test('GET /v1/sessionbox/account 透出 balance', async () => {
  const stack = await startStack();
  try {
    const out = await fetch(`${stack.base}/v1/sessionbox/account`).then(jsonOf);
    assert.equal(out.balance, 999);
    assert.equal(out.concurrency, 5);
    assert.equal(stack.upstream.state.meCalls, 1);
  } finally { await stack.close(); }
});

test('POST /v1/images/generations 全流程（size 映射 + 轮询 + url 返回）', async () => {
  const stack = await startStack();
  try {
    const res = await fetch(`${stack.base}/v1/images/generations`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-2', prompt: '动漫角色设定图', size: '1792x1024' }),
    });
    const out = await jsonOf(res);
    assert.equal(res.status, 200);
    assert.equal(out.data.length, 1);
    assert.match(out.data[0].url, /\/cdn\/img1\.png$/);
    // size 1792x1024 ≈ 1.75 → 最近比例 16:9
    assert.equal(stack.upstream.state.generates[0].body.aspect_ratio, '16:9');
    assert.equal(stack.upstream.state.generates[0].body.model, 'gpt-image-2');
    assert.equal(stack.upstream.state.generates[0].body.prompt, '动漫角色设定图');
    // num=1 时不应携带 num 字段
    assert.equal(stack.upstream.state.generates[0].body.num, undefined);
    // 轮询：pending ×2 后 completed
    assert.equal(stack.upstream.state.taskPolls.length, 3);
  } finally { await stack.close(); }
});

test('POST /v1/images/generations http 参考图转 dataURL + b64_json 返回', async () => {
  const stack = await startStack();
  try {
    const res = await fetch(`${stack.base}/v1/images/generations`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-image-2-5-flare', prompt: '改成赛博朋克', aspect_ratio: '9:16', n: 2, response_format: 'b64_json',
        image: `${stack.upstream.base}/cdn/ref.png`,
      }),
    });
    const out = await jsonOf(res);
    assert.equal(res.status, 200);
    assert.match(out.data[0].b64_json, /^iVBORw0KGgo/); // PNG 魔数 base64
    const gen = stack.upstream.state.generates[0].body;
    assert.equal(gen.aspect_ratio, '9:16');
    assert.equal(gen.num, 2);
    assert.equal(gen.images.length, 1);
    assert.match(gen.images[0], /^data:image\/png;base64,/);
  } finally { await stack.close(); }
});

test('token 失效时自动 refresh 并写回页面 localStorage', async () => {
  // localStorage 里是已失效的 TOKEN_STALE；mock 上游只认 TOKEN_A/TOKEN_FRESH
  const stack = await startStack({ localStorage: { auth_token: 'TOKEN_STALE', token_expires_at: String(Date.now() + 86400_000) } });
  try {
    const res = await fetch(`${stack.base}/v1/sessionbox/account`, { headers: { 'x-session-page': 'page-a' } });
    const out = await jsonOf(res);
    assert.equal(res.status, 200);
    assert.equal(out.balance, 999);
    // refresh 恰好一次，且新 token 写回了 mock 页面 localStorage
    assert.equal(stack.upstream.state.refreshes.length, 1);
    assert.equal(stack.upstream.state.refreshes[0].refresh_token, 'RT_1');
    const snapshot = stack.ls.snapshot();
    assert.equal(snapshot.auth_token, 'TOKEN_FRESH');
    assert.equal(snapshot.refresh_token, stack.upstream.tokens.refreshToken);
    assert.ok(Number(snapshot.token_expires_at) > Date.now());
  } finally { await stack.close(); }
});

test('未知模型与超量参考图返回 400', async () => {
  const stack = await startStack();
  try {
    const unknown = await fetch(`${stack.base}/v1/images/generations`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'no-such-model', prompt: 'x' }),
    });
    assert.equal(unknown.status, 400);
    assert.match((await jsonOf(unknown)).error.message, /未知模型/);

    // gpt-image-2 只允许 1 张参考图
    const tooMany = await fetch(`${stack.base}/v1/images/generations`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-image-2', prompt: 'x',
        images: [`${stack.upstream.base}/cdn/a.png`, `${stack.upstream.base}/cdn/b.png`],
      }),
    });
    assert.equal(tooMany.status, 400);
    assert.match((await jsonOf(tooMany)).error.message, /最多 1 张参考图/);
  } finally { await stack.close(); }
});

test('POST /v1/images/edits multipart 参考图', async () => {
  const stack = await startStack();
  try {
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', '把背景换成雪山');
    form.append('size', '1024x1024');
    form.append('image', new File([new Uint8Array([1, 2, 3, 4])], 'ref.png', { type: 'image/png' }));
    const res = await fetch(`${stack.base}/v1/images/edits`, { method: 'POST', body: form });
    const out = await jsonOf(res);
    assert.equal(res.status, 200);
    assert.match(out.data[0].url, /\/cdn\/img1\.png$/);
    const gen = stack.upstream.state.generates[0].body;
    assert.equal(gen.model, 'gpt-image-2');
    assert.equal(gen.images.length, 1);
    assert.match(gen.images[0], /^data:image\/png;base64,/);
  } finally { await stack.close(); }
});

test('GET /v1/tasks 列表按时间倒序与 /v1/tasks/:id 直通', async () => {
  const stack = await startStack();
  try {
    const list = await fetch(`${stack.base}/v1/tasks`).then(jsonOf);
    assert.equal(list.total, 2);
    // mock 返回顺序为 [task-2(09-30), task-1(09-28)]，服务端排序后最新在前
    assert.equal(list.data[0].id, 'task-2');
    assert.equal(list.data[0].prompt, '较新');
    assert.equal(list.data[1].prompt, '历史');
    const detail = await fetch(`${stack.base}/v1/tasks/task-1`).then((r) => jsonOf(r));
    assert.equal(detail.id, 'task-1');
    assert.equal(detail.status, 'completed');
  } finally { await stack.close(); }
});

test('非法 JSON 请求体返回 400 INVALID_JSON 而非误报字段缺失', async () => {
  const stack = await startStack();
  try {
    const res = await fetch(`${stack.base}/v1/images/generations`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '[object Object]',
    });
    assert.equal(res.status, 400);
    const out = await jsonOf(res);
    assert.equal(out.error.code, 'INVALID_JSON');
    assert.match(out.error.message, /不是合法 JSON/);
  } finally { await stack.close(); }
});

test('未登录页面报 NOT_LOGGED_IN', async () => {
  const stack = await startStack({ localStorage: { auth_token: null, refresh_token: null } });
  try {
    const res = await fetch(`${stack.base}/v1/sessionbox/account`, { headers: { 'x-session-page': 'page-a' } });
    assert.equal(res.status, 401);
    const out = await jsonOf(res);
    assert.equal(out.error.code, 'NOT_LOGGED_IN');
  } finally { await stack.close(); }
});
