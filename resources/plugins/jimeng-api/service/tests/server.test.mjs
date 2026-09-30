/**
 * jimeng-api 服务端到端测试（全 mock，不打真实上游）
 *
 * mock 范围:
 *   - SessionBox bridge: /api/v1/pages, /api/v1/pages/:id/cookies
 *   - 即梦上游: passport / commerce / mweb（生成、轮询、上传凭证）/ ImageX 上传
 *
 * 运行: node --test service/tests/
 */
import test from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';

const JIMENG_HOST_RE = /jimeng\.jianying\.com|dreamina\.capcut\.com/i;

/** mock sessionbox bridge */
async function startMockBridge() {
  const state = { requests: [] };
  const pages = [
    { id: 'page-a', name: '大号', url: 'https://jimeng.jianying.com/ai-tool/generate', open: true },
    { id: 'page-b', name: '小号', url: 'https://jimeng.jianying.com/ai-tool/home', open: false },
    { id: 'page-x', name: '其他站点', url: 'https://example.com', open: true },
  ];
  const cookies = {
    'page-a': [{ name: 'sessionid', value: 'SID_AAA', domain: '.jianying.com' }],
    'page-b': [{ name: 'sessionid', value: 'SID_BBB', domain: '.jianying.com' }],
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

/** mock 即梦全部上游（passport/commerce/mweb/ImageX 同 host，path + query 区分） */
async function startMockJimeng() {
  const state = { generates: [], uploads: 0, credits: [], cookies: new Set() };
  let historySeq = 0;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let json = {};
      try { json = body ? JSON.parse(body) : {}; } catch { /* 二进制 body */ }
      const url = new URL(req.url, 'http://x');
      const path = url.pathname;
      if (req.headers.cookie) state.cookies.add(req.headers.cookie);
      res.setHeader('content-type', 'application/json');
      const ok = (data) => res.end(JSON.stringify({ ret: '0', errmsg: '', data }));

      if (path === '/passport/account/info/v2') {
        // passport 无 ret，直接返回整体
        res.end(JSON.stringify({ data: { user_id: 2186000000000001, name: 'mock用户' } }));
      } else if (path === '/commerce/v1/benefits/user_credit') {
        state.credits.push({ url: req.url });
        ok({ credit: { gift_credit: 30, purchase_credit: 0, vip_credit: 1080 } });
      } else if (path === '/commerce/v1/benefits/credit_receive') {
        ok({ receive_quota: 60 });
      } else if (path === '/mweb/v1/get_upload_token') {
        ok({ access_key_id: 'AK', secret_access_key: 'SK', session_token: 'ST', service_id: 'tb4s082cfz' });
      } else if (url.searchParams.get('Action') === 'ApplyImageUpload') {
        // ImageX 响应格式：Result 顶层，无 ret/data 包装
        res.end(JSON.stringify({ Result: { UploadAddress: { StoreInfos: [{ Auth: 'upload-auth', StoreUri: 'tos/store-uri-1' }], UploadHosts: [`http://127.0.0.1:${server.address().port}`], SessionKey: 'session-key' } } }));
      } else if (path.startsWith('/upload/v1/')) {
        state.uploads++;
        assert.equal(req.headers['content-crc32'].length, 8, '上传需带 8 位 CRC32');
        res.statusCode = 200;
        res.end('ok');
      } else if (url.searchParams.get('Action') === 'CommitImageUpload') {
        res.end(JSON.stringify({ Result: { Results: [{ UriStatus: 2000, Uri: 'tos/committed-uri-1' }], PluginResult: [{ ImageWidth: 800, ImageHeight: 600, ImageFormat: 'png' }] } }));
      } else if (path === '/mweb/v1/aigc_draft/generate') {
        historySeq++;
        state.generates.push({ body: json, headers: req.headers });
        const isVideo = json.draft_content.includes('video_base_component');
        ok({ aigc_data: { history_record_id: `hist-${isVideo ? 'v' : ''}${historySeq}` } });
      } else if (path === '/mweb/v1/get_history_by_ids') {
        const id = json.history_ids[0];
        if (id.startsWith('hist-v')) {
          ok({ [id]: { status: 10, item_list: [{ item_id: `item-${id}`, video: { play_url: `https://mock.jimeng.com/${id}.mp4` } }] } });
        } else {
          ok({ [id]: { status: 10, item_list: json2draft(id) } });
        }
      } else if (path === '/mweb/v1/get_local_item_list') {
        const hqUrl = `https://mock.jimeng.com/hq-${json.item_id_list[0]}.mp4`;
        ok({
          item_list: [{
            item_id: json.item_id_list[0],
            video: { video_model: JSON.stringify({ video_list: { video_1: { main_url: Buffer.from(hqUrl).toString('base64') } } }) },
          }],
        });
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ ret: '404', errmsg: 'unknown path ' + path }));
      }
    });
  });
  const json2draft = (id) => {
    const n = Number(id.replace(/\D/g, '')) || 1;
    return Array.from({ length: 4 }, (_, i) => ({ image: { large_images: [{ image_url: `https://mock.jimeng.com/${id}-${i}.webp?x-sign\\u0026sig=${i * n}` }] } }));
  };
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, state, urls: { baseUrl: base, commerceUrl: base, imagexUrl: base } };
}

async function jsonOf(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

test('服务: 模型列表 / 账号发现 / 账号积分 / 文生图 / 图生图 / 视频 / 账号选择', async (t) => {
  const bridge = await startMockBridge();
  const jimeng = await startMockJimeng();
  t.after(() => { bridge.server.close(); jimeng.server.close(); });

  const { startServer } = await import('../server.mjs');
  const svc = await startServer({ port: 0, bridgeUrl: bridge.url, urls: jimeng.urls, jimengHostRe: JIMENG_HOST_RE });
  t.after(() => svc.close());
  const base = `http://127.0.0.1:${svc.port}`;

  // health
  const health = await jsonOf(await fetch(`${base}/health`));
  assert.equal(health.status, 'ok');

  // 模型列表
  const models = await jsonOf(await fetch(`${base}/v1/models`));
  assert.ok(models.data.some((m) => m.id === 'jimeng-4.5' && m.meta.type === 'image'));
  assert.ok(models.data.some((m) => m.id === 'seedance-2.5' && m.meta.type === 'video' && m.meta.internal === 'dreamina_seedance_45_pro'));

  // 账号页面发现（仅 jimeng 页面，open 优先）
  const pages = await jsonOf(await fetch(`${base}/v1/sessionbox/pages`));
  assert.deepEqual(pages.pages.map((p) => p.id), ['page-a', 'page-b']);
  assert.equal(pages.pages[0].ready, true);

  // 账号信息 + 积分（自动选 page-a）
  const account = await jsonOf(await fetch(`${base}/v1/sessionbox/account`));
  assert.equal(account.userId, 2186000000000001);
  assert.equal(account.credit.totalCredit, 1110);
  assert.ok(jimeng.state.credits.length >= 1);

  // 文生图
  const img = await jsonOf(await fetch(`${base}/v1/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'jimeng-4.5', prompt: '一只橘猫', ratio: '16:9', resolution: '1k' }),
  }));
  assert.equal(img.data.length, 4);
  assert.ok(img.data[0].url.startsWith('https://mock.jimeng.com/'));
  const gen = jimeng.state.generates.at(-1);
  assert.ok(gen, '应有生成请求');
  assert.equal(gen.body.extend.root_model, 'high_aes_general_v40l');
  assert.ok(gen.headers.sign, '应带 Sign 头');
  assert.ok(gen.headers.cookie.includes('SID_AAA'), '应带 sessionid cookie');
  const draft = JSON.parse(gen.body.draft_content);
  assert.equal(draft.component_list[0].generate_type, 'generate');
  const core = draft.component_list[0].abilities.generate.core_param;
  assert.equal(core.model, 'high_aes_general_v40l');
  assert.equal(core.large_image_info.width, 1024); // 1k 16:9
  assert.equal(core.large_image_info.height, 576);
  assert.equal(core.image_ratio, 3);
  assert.ok(gen.body.metrics_extra.includes('ImageBasicGenerate'));
  assert.ok(/benefitCount\\":4/.test(gen.body.metrics_extra), 'metrics_extra 内层 sceneOptions 应含 benefitCount:4');

  // size → ratio 映射（OpenAI 风格）
  const img2 = await jsonOf(await fetch(`${base}/v1/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: '竖图', size: '1080x1920' }),
  }));
  assert.equal(img2.data.length, 4);
  const draft2 = JSON.parse(jimeng.state.generates.at(-1).body.draft_content);
  assert.equal(draft2.component_list[0].abilities.generate.core_param.image_ratio, 5, '9:16');

  // 图生图（dataURL → 上传 → blend）
  const pngB64 = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
  const comp = await jsonOf(await fetch(`${base}/v1/images/compositions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: '水彩风格', images: [`data:image/png;base64,${pngB64}`], sample_strength: 0.7 }),
  }));
  assert.equal(comp.data.length, 4);
  assert.equal(jimeng.state.uploads, 1, '应上传一张参考图');
  const gen3 = jimeng.state.generates.at(-1);
  const draft3 = JSON.parse(gen3.body.draft_content);
  assert.equal(draft3.component_list[0].generate_type, 'blend');
  assert.equal(draft3.component_list[0].abilities.blend.ability_list[0].image_uri_list[0], 'tos/committed-uri-1');
  assert.ok(draft3.component_list[0].abilities.blend.core_param.prompt.startsWith('##'), '图生图 prompt 前缀 ##');
  assert.equal(draft3.component_list[0].abilities.blend.core_param.sample_strength, 0.7);

  // 图生视频（文生视频，mock 高清 URL 提取）
  const video = await jsonOf(await fetch(`${base}/v1/videos/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'seedance-2.5', prompt: '猫奔跑', ratio: '16:9', duration: 5 }),
  }));
  assert.ok(video.data[0].url.startsWith('https://mock.jimeng.com/hq-item-'), '应返回高清无水印 URL');
  const vgen = jimeng.state.generates.find((g) => {
    const d = JSON.parse(g.body.draft_content);
    return d.component_list[0].type === 'video_base_component';
  });
  assert.ok(vgen, '应有视频生成请求');
  const vdraft = JSON.parse(vgen.body.draft_content);
  const params = vdraft.component_list[0].abilities.gen_video.text_to_video_params;
  assert.equal(params.model_req_key, 'dreamina_seedance_45_pro');
  assert.equal(params.video_gen_inputs[0].duration_ms, 5000);
  assert.equal(params.video_aspect_ratio, '16:9');
  assert.equal(vgen.body.extend.m_video_commerce_info.benefit_type, 'seedance_25_720p_output');

  // 账号选择: x-session-page 指定 page-b
  const accountB = await jsonOf(await fetch(`${base}/v1/sessionbox/account`, { headers: { 'x-session-page': 'page-b' } }));
  assert.equal(accountB.userId, 2186000000000001);
  assert.ok([...jimeng.state.cookies].some((c) => c.includes('SID_BBB')), 'page-b 请求应带 SID_BBB');

  // 指定不存在页面 → 400
  const notFound = await jsonOf(await fetch(`${base}/v1/sessionbox/account`, { headers: { 'x-session-page': 'page-nope' } }));
  const notFoundRes = await fetch(`${base}/v1/sessionbox/account`, { headers: { 'x-session-page': 'page-nope' } });
  assert.equal(notFoundRes.status, 400);
  assert.equal(notFound.error.code, 'PAGE_NOT_FOUND');

  // 未知模型 → 400
  const badModelRes = await fetch(`${base}/v1/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o', prompt: 'x' }),
  });
  assert.equal(badModelRes.status, 400);
  const badModel = await jsonOf(badModelRes);
  assert.equal(badModel.error.code, 'UNKNOWN_MODEL');

  // 收积分
  const receive = await jsonOf(await fetch(`${base}/v1/token/receive`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(receive.received, 60);
  assert.equal(receive.credit.totalCredit, 1110);
});

test('客户端: 认证头 / 错误码 / sessionid 缺失', async () => {
  const { createClient, JimengApiError, crc32hex, aws4Signature } = await import('../../api-client.mjs');
  assert.throws(() => createClient({}), JimengApiError);
  assert.equal(crc32hex(Buffer.from('123456789')).length, 8);
  assert.equal(crc32hex(Buffer.from('123456789')), 'cbf43926'); // CRC32 标准测试向量
  const sig = aws4Signature('GET', 'https://example.com/?Action=Apply&ServiceId=x', { 'x-amz-date': '20260930T000000Z' }, 'AK', 'SK', 'ST');
  assert.ok(sig.startsWith('AWS4-HMAC-SHA256 Credential=AK/20260930/cn-north-1/imagex/aws4_request'));
  assert.ok(sig.includes('SignedHeaders=x-amz-date;x-amz-security-token'));
});
