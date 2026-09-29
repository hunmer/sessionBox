/**
 * liblib-api 服务端到端测试（全 mock，不打真实上游）
 *
 * mock 范围:
 *   - SessionBox bridge: /api/v1/pages, /api/v1/pages/:id/cookies
 *   - liblib 上游: account / task create / task progress / pre-sign / oss put
 *
 * 运行: node --test service/tests/
 */
import test from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';

const LIBLIB_HOST_RE = /liblib\./i;

/** mock sessionbox bridge */
async function startMockBridge() {
  const state = { requests: [] };
  const pages = [
    { id: 'page-a', name: 'liblib 主号', url: 'https://www.liblib.tv/canvas', open: true },
    { id: 'page-b', name: 'liblib 小号', url: 'https://www.liblib.tv', open: false },
    { id: 'page-x', name: '其他站点', url: 'https://example.com', open: true },
  ];
  const cookies = {
    'page-a': [
      { name: 'usertoken', value: 'TOKEN_AAA', domain: '.liblib.tv' },
      { name: 'webid', value: 'WEBID_AAA', domain: '.liblib.tv' },
      { name: 'useruuid', value: 'UUID_AAA', domain: '.liblib.tv' },
    ],
    'page-b': [
      { name: 'usertoken', value: 'TOKEN_BBB', domain: '.liblib.tv' },
      { name: 'webid', value: 'WEBID_BBB', domain: '.liblib.tv' },
    ],
  };
  const server = createServer((req, res) => {
    state.requests.push({ method: req.method, url: req.url });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/v1/pages') {
      res.end(JSON.stringify({ pages }));
      return;
    }
    const m = req.url.match(/^\/api\/v1\/pages\/([^/]+)\/cookies/);
    if (m) {
      const list = cookies[m[1]];
      if (!list) { res.statusCode = 500; res.end(JSON.stringify({ error: `页面 ${m[1]} 当前没有打开的标签页` })); return; }
      res.end(JSON.stringify({ pageId: m[1], cookies: list }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, state, url: `http://127.0.0.1:${server.address().port}` };
}

/** mock liblib 全部上游（同 host，不同 path 区分） */
async function startMockLiblib() {
  const state = { taskCreates: [], progressCalls: 0, accountCalls: [], presigns: [], ossPuts: 0 };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let json = {};
      try { json = body ? JSON.parse(body) : {}; } catch { /* PUT 等二进制 body */ }
      const headers = { token: req.headers.token, webid: req.headers.webid };
      res.setHeader('content-type', 'application/json');
      if (req.url.startsWith('/api/www/member/account')) {
        state.accountCalls.push(headers);
        res.end(JSON.stringify({ code: 0, data: { name: 'mock用户', ownerUuid: 'UUID_AUTO', userId: 1, attr: { usablePower: 100 } } }));
      } else if (req.url === '/api/task/generation/create') {
        state.taskCreates.push({ headers, body: json });
        res.end(JSON.stringify({ code: 0, data: { taskId: 'task-1', power: 1 } }));
      } else if (req.url === '/api/task/generation/progress') {
        state.progressCalls++;
        const taskResult = json.taskIds[0] === 'task-1'
          ? { texts: [{ content: '回复：好' }], images: [{ url: 'https://cdn.liblib.art/img.png', previewPath: 'https://cdn.liblib.art/img.png' }], audios: [{ previewPath: 'https://cdn.liblib.art/a.wav' }], videos: [{ previewPath: 'https://cdn.liblib.art/v.mp4' }] }
          : null;
        res.end(JSON.stringify({ code: 0, data: { progresses: [{ taskId: json.taskIds[0], status: 2, taskResult: JSON.stringify(taskResult) }] } }));
      } else if (req.url.endsWith('/pre-sign/4')) {
        state.presigns.push({ headers, body: json });
        res.end(JSON.stringify({ code: 0, data: { cdnUrl: `https://cdn.liblib.art/${json.path}`, ossUrl: `http://127.0.0.1:${server.address().port}/oss-mock/${encodeURIComponent(json.path)}` } }));
      } else if (req.url.startsWith('/oss-mock/')) {
        state.ossPuts++;
        res.statusCode = 200;
        res.end('ok');
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ code: 1, msg: 'unknown path ' + req.url }));
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, state, urls: { tv: base, www: base, account: base, bridge: `${base}/api/oss/pre-sign/4` } };
}

async function jsonOf(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

test('服务: 模型列表 / 账号发现 / 聊天生成 / 账号选择 / 图片 / 上传', async (t) => {
  const bridge = await startMockBridge();
  const lib = await startMockLiblib();
  t.after(() => { bridge.server.close(); lib.server.close(); });

  const { startServer } = await import('../server.mjs');
  const svc = await startServer({ port: 0, bridgeUrl: bridge.url, urls: lib.urls, liblibHostRe: LIBLIB_HOST_RE });
  t.after(() => svc.close());
  const base = `http://127.0.0.1:${svc.port}`;

  // health
  const health = await jsonOf(await fetch(`${base}/health`));
  assert.equal(health.status, 'ok');

  // 模型列表
  const models = await jsonOf(await fetch(`${base}/v1/models`));
  assert.ok(Array.isArray(models.data) && models.data.length >= 50, '应包含全部模型');
  assert.ok(models.data.some((m) => m.id === 'qwen-3-vl-flash'));

  // 账号发现
  const pages = await jsonOf(await fetch(`${base}/v1/sessionbox/pages`));
  const ids = pages.pages.map((p) => p.id);
  assert.deepEqual([...ids].sort(), ['page-a', 'page-b']);
  assert.equal(pages.pages.find((p) => p.id === 'page-a').open, true);

  // 默认账号
  lib.state.taskCreates.length = 0;
  const chat = await jsonOf(await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'qwen-3-vl-flash', messages: [{ role: 'user', content: '回复：好' }] }),
  }));
  assert.equal(chat.choices[0].message.content, '回复：好');
  assert.equal(chat.model, 'qwen-3-vl-flash');
  assert.equal(lib.state.taskCreates[0].headers.token, 'TOKEN_AAA', '默认应选中 open 的 page-a');
  assert.equal(lib.state.taskCreates[0].body.taskType, 'text');
  assert.ok(lib.state.taskCreates[0].body.params.prompt.includes('回复：好'));

  // x-session-page
  lib.state.taskCreates.length = 0;
  const chatB = await jsonOf(await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-session-page': 'page-b' },
    body: JSON.stringify({ model: 'qwen-3-vl-flash', messages: [{ role: 'user', content: 'hi' }] }),
  }));
  assert.equal(chatB.choices[0].message.content, '回复：好');
  assert.equal(lib.state.taskCreates[0].headers.token, 'TOKEN_BBB', 'x-session-page 应切换账号');
  assert.equal(lib.state.taskCreates[0].headers.webid, 'WEBID_BBB');

  // 图片生成
  const img = await jsonOf(await fetch(`${base}/v1/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'z-image', prompt: '一只猫', size: '1024x1024' }),
  }));
  assert.equal(img.data[0].url, 'https://cdn.liblib.art/img.png');
  const imgCreate = lib.state.taskCreates.at(-1);
  assert.equal(imgCreate.body.taskType, 'image');
  assert.equal(imgCreate.body.params.ratio, '1:1', 'size 1024x1024 应映射 1:1');
  assert.equal(imgCreate.body.params.model, 'z-image');

  // 指定不存在
  const bad = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-session-page': 'no-such' },
    body: JSON.stringify({ model: 'qwen-3-vl-flash', messages: [{ role: 'user', content: 'x' }] }),
  });
  assert.equal(bad.status, 400);

  // 上传
  const up = await jsonOf(await fetch(`${base}/v1/files`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: 'a.png', content_base64: Buffer.from('pngdata').toString('base64') }),
  }));
  assert.ok(up.url.startsWith('https://cdn.liblib.art/upload-images/UUID_AAA/'), 'useruuid 应取自 cookie');
  assert.equal(lib.state.ossPuts, 1);

  // 音频
  const audio = await jsonOf(await fetch(`${base}/v1/audio/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'seed-audio-1.0', prompt: '你好' }),
  }));
  assert.equal(audio.data[0].url, 'https://cdn.liblib.art/a.wav');

  // 视频
  const video = await jsonOf(await fetch(`${base}/v1/video/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'MiniMax-Hailuo-o2', prompt: '猫在跑' }),
  }));
  assert.equal(video.data[0].url, 'https://cdn.liblib.art/v.mp4');

  // 进度查询
  const prog = await jsonOf(await fetch(`${base}/v1/tasks/task-1`));
  assert.equal(prog.progresses[0].taskId, 'task-1');
});
