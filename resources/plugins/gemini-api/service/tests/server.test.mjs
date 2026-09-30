/**
 * gemini-api 服务端到端测试（全 mock，不打真实上游）
 *
 * mock 范围:
 *   - SessionBox bridge: /api/v1/pages, /api/v1/pages/:id/cookies
 *   - Gemini 上游: /app 初始化页、batchexecute(otAQ7b) 模型发现、StreamGenerate 流式生成、
 *     content-push 上传、lh3 媒体（图片直下；视频先 206 后 200）
 *
 * 运行: node --test service/tests/
 */
import test from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import * as mod from '../../api-client.mjs';

// ---------- Google 流帧编码工具（与 api-client 解码对偶） ----------

/** 单帧: `<marker>\n<json>\n`，marker = len('\n'+json+'\n')（换行计入，与真实响应一致） */
function encodeFrames(payload) {
  const json = JSON.stringify(payload);
  return `${json.length + 2}\n${json}\n`;
}

const ANTI_XSSI = ")]}'\n";

/** 构造 StreamGenerate / batchexecute 响应体 */
function googleResponse(parts) {
  return ANTI_XSSI + parts.map((p) => encodeFrames([p])).join('');
}

/** 构造一个候选（candidate） */
function makeCandidate({ rcid = 'rc_1', text = '', indicator = 2, images = [], videos = [], thoughts = '' } = {}) {
  const candidate = new Array(40).fill(null);
  candidate[0] = rcid;
  candidate[1] = [text];
  candidate[8] = [indicator];
  if (thoughts) candidate[37] = [[thoughts]];
  if (images.length || videos.length) {
    // [12][7] = [[img, ...]]，img[0][3][3] = url；[12][59] = [[[videoInfo]]]，videoInfo[0][7] = [thumb, url]
    const rich = new Array(60).fill(null);
    if (images.length) {
      rich[7] = [images.map(({ url, alt = 'image' }) => [[null, null, null, [null, null, alt, url]], [null, 'img-id-1']])];
    }
    if (videos.length) {
      // [12][59] = [[[videoInfoArray]]]，videoInfo[0][7] = [thumb, url]
      rich[59] = [[[videos.map((v) => [null, null, null, null, null, null, null, [v.thumbnail || '', v.url]])]]];
    }
    candidate[12] = rich;
  }
  return candidate;
}

/** 构造 StreamGenerate 的 part（part[1]=rpcid, part[2] 为 inner JSON 字符串） */
function makePart({ candidates, final = true }) {
  const inner = new Array(30).fill(null);
  inner[1] = ['cid_1', 'rid_1'];
  inner[4] = candidates;
  if (final) inner[25] = '';
  return [null, 'wrb.fr', JSON.stringify(inner), null, null, null, 'generic'];
}

// ---------- mock servers ----------

async function startMockBridge() {
  const pages = [
    { id: 'page-a', name: '谷歌大号', url: 'https://gemini.google.com/app', open: true },
    { id: 'page-b', name: '谷歌小号', url: 'https://gemini.google.com/app', open: false },
    { id: 'page-x', name: '其他站点', url: 'https://example.com', open: true },
  ];
  const cookies = {
    'page-a': [
      { name: '__Secure-1PSID', value: 'PSID_AAA', domain: '.google.com' },
      { name: '__Secure-1PSIDTS', value: 'PSIDTS_AAA', domain: '.google.com' },
      { name: 'NID', value: 'nid-aaa', domain: '.google.com' },
    ],
    'page-b': [{ name: 'NID', value: 'only-nid', domain: '.google.com' }], // 未登录
  };
  const server = createServer((req, res) => {
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
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

/**
 * mock Gemini 上游（gemini.google.com + content-push + 媒体，按 path 分发）
 * state 可变: { generates: [], uploads: [], models: [...] }
 */
async function startMockGemini() {
  const state = {
    generates: [],
    uploads: [],
    videoPolls: 0,
    videoReadyAfter: 2, // 前 2 次媒体请求返回 206
    models: [
      ['mid-flash-001', 'flash'],
      ['mid-image-001', 'flash image'],
      ['mid-veo-001', 'veo'],
    ],
    // 每次生成的脚本: (body) => parts 数组（makePart 结果）
    script: null,
  };
  let base = '';
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      const url = new URL(req.url, 'http://x');
      const path = url.pathname;

      // 媒体直链（图片 / 视频轮询）
      if (path.startsWith('/media/')) {
        if (path.endsWith('.mp4')) {
          state.videoPolls++;
          if (state.videoPolls <= state.videoReadyAfter) {
            res.writeHead(206, { 'content-type': 'video/mp4' });
            res.end();
            return;
          }
          res.writeHead(200, { 'content-type': 'video/mp4' });
          res.end(Buffer.from('fake-mp4-bytes'));
          return;
        }
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(Buffer.from(path.includes('fullsize') ? 'full-size-png-bytes!' : 'fake-png-bytes'));
        return;
      }

      // content-push 上传
      if (path === '/upload') {
        state.uploads.push({ headers: req.headers, body: body.slice(0, 200) });
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('/contrib_service/ttl_1d/uploaded-file-1');
        return;
      }

      // 初始化页
      if (path === '/app') {
        if (!/PSID_/.test(req.headers.cookie || '')) {
          res.writeHead(302, { location: 'https://accounts.google.com/ServiceLogin' });
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<script>WIZ_global_data = {"SNlM0e":"AT_TOKEN_1","cfb2h":"boq_assistant-bard-web-server.20260930","FdrFJe":"FSID_1","TuX5cc":"en","qKIAYe":"feeds/mockpush"};</script>');
        return;
      }

      // RPC: 模型发现(otAQ7b) / 全尺寸图片(c8o8Fe)
      if (path.endsWith('/batchexecute')) {
        const rpcid = url.searchParams.get('rpcids');
        assert.ok(['otAQ7b', 'c8o8Fe'].includes(rpcid), 'rpcid 应已知: ' + rpcid);
        assert.ok(req.headers.cookie.includes('PSID_AAA'), '应带登录 cookie');
        res.writeHead(200, { 'content-type': 'application/json' });
        if (rpcid === 'c8o8Fe') {
          state.fullSizeRpcs = (state.fullSizeRpcs || 0) + 1;
          // 全尺寸原始 URL 指回 mock 自身（两层文本跳转可达）
          res.end(googleResponse([[null, 'c8o8Fe', JSON.stringify([`http://${req.headers.host}/fs-original`]), null, 'generic']]));
          return;
        }
        const bodyArr = new Array(18).fill(null);
        bodyArr[14] = 1000; // 账号状态正常
        bodyArr[15] = state.models;
        bodyArr[16] = [];
        bodyArr[17] = [];
        res.end(googleResponse([[null, 'otAQ7b', JSON.stringify(bodyArr), null, 'generic']]));
        return;
      }

      // 全尺寸两层文本跳转: fs-original(=d-I) → fs-hop2 → 媒体直链
      if (path.startsWith('/fs-original') || path === '/fs-hop2') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end(path.startsWith('/fs-original') ? `http://${req.headers.host}/fs-hop2` : `${base}/media/fullsize1.png`);
        return;
      }

      // 生成
      if (path.endsWith('/StreamGenerate')) {
        state.generates.push({ url: req.url, body, headers: req.headers });
        const params = new URLSearchParams(body);
        const fReq = JSON.parse(params.get('f.req'));
        const inner = JSON.parse(fReq[1]);
        state.lastInner = inner;
        const parts = state.script
          ? state.script(inner)
          : [makePart({ candidates: [makeCandidate({ text: 'Hello from Gemini!' })] })];
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(ANTI_XSSI + parts.map((p) => encodeFrames([p])).join(''));
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unknown path ' + path }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  return { server, state, urls: { baseUrl: base, uploadUrl: `${base}/upload` }, mediaBase: base };
}

async function jsonOf(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

// ---------- 单元测试 ----------

test('单元: 流帧解析（UTF-16 长度 / 多帧 / 分块 / 前缀）', () => {
  const { StreamFrameParser } = mod;
  const parser = new StreamFrameParser();
  // 两帧 + 中文（marker = len('\n'+json+'\n')，换行计入 units，与真实响应一致）
  const frame1 = JSON.stringify([['a', '中文内容']]);
  const frame2 = JSON.stringify([['b']]);
  const payload = `)]}'\n${frame1.length + 2}\n${frame1}\n${frame2.length + 2}\n${frame2}\n`;
  // 按 3 字节分块喂入，验证增量解析
  const chunks = [];
  for (let i = 0; i < payload.length; i += 3) chunks.push(payload.slice(i, i + 3));
  let frames = [];
  for (const c of chunks) frames = frames.concat(parser.feed(c));
  assert.equal(frames.length, 2);
  assert.equal(frames[0][1], '中文内容');
  assert.equal(frames[1][0], 'b');
});

test('单元: JSPB 稀疏 bundle 字段读取', () => {
  const { getField } = mod;
  // 位置槽
  assert.equal(getField([null, null, 'pos'], 2), 'pos');
  // 稀疏 bundle: field 7 → key "8"
  const bundle = { 8: ['from-bundle'] };
  assert.deepEqual(getField([null, null, null, null, null, null, null, null, bundle], 7), ['from-bundle']);
  // field 59 → key "60"
  assert.deepEqual(getField([null, bundle59()], 59), ['sparse-59']);
  function bundle59() {
    return { 60: ['sparse-59'] };
  }
  assert.equal(getField([], 7, 'fallback'), 'fallback');
});

test('单元: 文本增量（前缀追加 / 中间修改）', () => {
  const { textDelta } = mod;
  assert.deepEqual(textDelta('你好世界', '你好', false), { delta: '世界', full: '你好世界' });
  assert.deepEqual(textDelta('abc', 'abc', true), { delta: '', full: 'abc' });
  // 中间修改: 公共前缀 ab，重发 c!
  assert.deepEqual(textDelta('abc!', 'abd'), { delta: 'c!', full: 'abc!' });
  // 尾部 \n``` 清理
  assert.deepEqual(textDelta('code\n```', 'code', false), { delta: '', full: 'code' });
});

// ---------- 端到端 ----------

test('服务: 模型发现 / 账号发现 / 对话 / 流式 / 生图 / 生视频 / 账号选择', async (t) => {
  const bridge = await startMockBridge();
  const gemini = await startMockGemini();
  t.after(() => { bridge.server.close(); gemini.server.close(); });

  const { startServer } = await import('../server.mjs');
  const svc = await startServer({ port: 0, bridgeUrl: bridge.url, urls: gemini.urls, temporary: true });
  t.after(() => svc.close());
  const base = `http://127.0.0.1:${svc.port}`;

  // health
  const health = await jsonOf(await fetch(`${base}/health`));
  assert.equal(health.status, 'ok');

  // 模型列表（动态发现，图片/视频模型分类）
  const models = await jsonOf(await fetch(`${base}/v1/models`));
  const ids = models.data.map((m) => m.id);
  assert.ok(ids.includes('gemini-flash'));
  assert.ok(models.data.find((m) => m.id === 'gemini-flash-image' && m.meta.type === 'image'));
  assert.ok(models.data.find((m) => m.id === 'gemini-veo' && m.meta.type === 'video'));

  // 账号页面发现（page-b 未登录 → 未就绪）
  const pages = await jsonOf(await fetch(`${base}/v1/sessionbox/pages`));
  assert.deepEqual(pages.pages.map((p) => p.id), ['page-a', 'page-b']);
  assert.equal(pages.pages[0].ready, true);
  assert.equal(pages.pages[1].ready, false);
  assert.match(pages.pages[1].reason, /__Secure-1PSID/);

  // 非流式对话（多轮 + system）
  const chat = await jsonOf(await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-flash',
      messages: [
        { role: 'system', content: '你是测试助手' },
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '你好！' },
        { role: 'user', content: '介绍自己' },
      ],
    }),
  }));
  assert.equal(chat.object, 'chat.completion');
  assert.equal(chat.choices[0].message.content, 'Hello from Gemini!');
  assert.equal(chat.choices[0].finish_reason, 'stop');
  assert.ok(chat.usage.total_tokens > 0);
  // 请求体: ChatML 拼接 + 临时会话标志 + 模型头
  const inner = gemini.state.lastInner;
  assert.equal(inner[45], 1, 'temporary 标志位');
  assert.match(inner[0][0], /<\|im_start\|>system\n你是测试助手\n<\|im_end\|>/);
  assert.match(inner[0][0], /<\|im_start\|>assistant\n$/);
  const modelHeader = gemini.state.generates.at(-1).headers['x-goog-ext-525001261-jspb'];
  const parsedHeader = JSON.parse(modelHeader);
  assert.equal(parsedHeader[4], 'mid-flash-001');
  assert.equal(parsedHeader[14], 1); // model_number
  assert.equal(typeof parsedHeader.at(-1), 'string'); // clientSessionId
  assert.equal(inner[79], 1); // model_number 镜像

  // 流式对话（SSE 增量）
  gemini.state.script = () => [
    makePart({ candidates: [makeCandidate({ text: '你好' })], final: false }),
    makePart({ candidates: [makeCandidate({ text: '你好，世界' })] }),
  ];
  const sse = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gemini-flash', stream: true, messages: [{ role: 'user', content: 'hi' }] }),
  });
  assert.ok(sse.headers.get('content-type').includes('text/event-stream'));
  const sseText = await sse.text();
  const rawEvents = sseText.split('\n\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6));
  assert.equal(rawEvents.at(-1), '[DONE]');
  const events = rawEvents.filter((e) => e !== '[DONE]').map((e) => JSON.parse(e));
  const deltas = events.filter((e) => e?.choices?.[0]?.delta?.content).map((e) => e.choices[0].delta.content);
  assert.equal(deltas.join(''), '你好，世界');
  assert.ok(events.some((e) => e?.choices?.[0]?.finish_reason === 'stop'));
  gemini.state.script = null;

  // 多模态: image_url(dataURL) → content-push 上传
  const pngB64 = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
  gemini.state.script = () => [makePart({ candidates: [makeCandidate({ text: '图里是一只猫' })] })];
  const vision = await jsonOf(await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-flash',
      messages: [{ role: 'user', content: [
        { type: 'text', text: '这是什么' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${pngB64}` } },
      ] }],
    }),
  }));
  assert.equal(vision.choices[0].message.content, '图里是一只猫');
  assert.equal(gemini.state.uploads.length, 1, '应上传一张图片');
  assert.equal(gemini.state.uploads[0].headers['push-id'], 'feeds/mockpush');
  assert.equal(gemini.state.uploads[0].headers['x-tenant-id'], 'bard-storage');
  assert.deepEqual(gemini.state.lastInner[0][3], [[['/contrib_service/ttl_1d/uploaded-file-1'], 'input_0.png']]);
  gemini.state.script = null;

  // 文生图: 响应带 generated images → OpenAI images 格式
  gemini.state.script = () => [makePart({
    candidates: [makeCandidate({ text: '', images: [{ url: `${gemini.mediaBase}/media/img1.png` }] })],
  })];
  const img = await jsonOf(await fetch(`${base}/v1/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: '一只橘猫' }),
  }));
  assert.equal(img.data.length, 1);
  // url 模式: gg-dl 直链调用方无法直接访问，应返回本服务中转地址且可下载
  assert.ok(/\/v1\/files\/[a-f0-9]+$/.test(img.data[0].url), `应返回本服务中转地址: ${img.data[0].url}`);
  const proxied = await fetch(img.data[0].url);
  assert.equal(proxied.status, 200);
  assert.equal(await proxied.text(), 'full-size-png-bytes!', '生图应经 c8o8Fe 全尺寸链路下载');
  assert.ok(gemini.state.fullSizeRpcs >= 1, '应发起全尺寸 RPC');
  // b64_json 模式: 下载转 base64
  const imgB64 = await jsonOf(await fetch(`${base}/v1/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: '一只橘猫', response_format: 'b64_json' }),
  }));
  assert.equal(Buffer.from(imgB64.data[0].b64_json, 'base64').toString(), 'full-size-png-bytes!', 'b64 也应走全尺寸链路');
  // 生图指令注入（body 为 urlencoded）
  assert.match(decodeURIComponent(gemini.state.generates.at(-1).body).replace(/\+/g, ' '), /IMAGE GENERATION ENABLED/);
  gemini.state.script = null;

  // 生视频: 视频候选 → 206 轮询 → 200 就绪
  gemini.state.script = () => [makePart({
    candidates: [makeCandidate({ text: '', videos: [{ url: `${gemini.mediaBase}/media/veo1.mp4`, thumbnail: `${gemini.mediaBase}/media/thumb1.jpg` }] })],
  })];
  const video = await jsonOf(await fetch(`${base}/v1/videos/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: '猫奔跑', poll_interval: 20 }),
  }));
  assert.ok(/\/v1\/files\/[a-f0-9]+$/.test(video.data[0].url), '视频应返回本服务中转地址');
  assert.equal(video.meta.size, 'fake-mp4-bytes'.length, '视频应轮询到 200 并校验大小');
  assert.ok(gemini.state.videoPolls >= 3, '应经历 206 轮询');
  // 视频请求用普通会话（非 temporary）
  const videoInner = gemini.state.generates.find((g, i) => i === gemini.state.generates.length - 1);
  const videoInnerParsed = JSON.parse(JSON.parse(new URLSearchParams(videoInner.body).get('f.req'))[1]);
  assert.notEqual(videoInnerParsed[45], 1, '视频生成不走临时会话');
  gemini.state.script = null;

  // 账号选择: x-session-page 指定 page-b（未登录）→ 401
  const loginRequired = await fetch(`${base}/v1/models`, { headers: { 'x-session-page': 'page-b' } });
  assert.equal(loginRequired.status, 401);
  const loginErr = await jsonOf(loginRequired);
  assert.equal(loginErr.error.code, 'NOT_LOGGED_IN');

  // 指定不存在页面 → 400
  const notFound = await fetch(`${base}/v1/models`, { headers: { 'x-session-page': 'page-nope' } });
  assert.equal(notFound.status, 400);
  assert.equal((await jsonOf(notFound)).error.code, 'PAGE_NOT_FOUND');
});

test('客户端: cookie 校验 / 服务端错误码翻译', async (t) => {
  const { createGeminiClient, GeminiWebError } = mod;
  assert.throws(() => createGeminiClient({ cookies: [{ name: 'NID', value: 'x' }] }), GeminiWebError);

  const gemini = await startMockGemini();
  t.after(() => gemini.server.close());
  const client = createGeminiClient({
    cookies: [{ name: '__Secure-1PSID', value: 'PSID_AAA' }],
    urls: gemini.urls,
  });
  await client.init();
  assert.equal(client.models.length, 3);
  // 名称解析（别名 / 去前缀）
  assert.equal(client.resolveModel('gemini-flash').modelId, 'mid-flash-001');
  assert.equal(client.resolveModel('flash').modelId, 'mid-flash-001');
  assert.equal(client.resolveModel('gemini-flash-image').modelId, 'mid-image-001');
  assert.equal(client.resolveModel('不存在的模型'), null);

  // 用量超限错误码翻译
  gemini.state.script = () => {
    const part = new Array(6).fill(null);
    part[5] = [null, null, [[null, [1037]]]];
    return [part];
  };
  await assert.rejects(
    () => client.generateOnce({ prompt: 'x', temporary: true }),
    (err) => err.code === 'USAGE_LIMIT_EXCEEDED' && /上限/.test(err.message),
  );
});

