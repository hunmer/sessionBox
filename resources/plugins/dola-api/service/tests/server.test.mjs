/**
 * dola-api 最小测试（node:test，全 mock bridge）
 *   node --test service/tests/server.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient, messagesToPrompt, startChatCode, pollChatCode, pollChainCode, MODELS, IMAGE_PROMPT_PREFIX, VIDEO_PROMPT_PREFIX } from '../../api-client.mjs';

/** mock bridge：execute 按脚本顺序返回 */
function mockBridge(scripts) {
  let i = 0;
  return {
    calls: [],
    execute: async (pageId, code) => {
      calls.push(code.slice(0, 60));
      const step = scripts[Math.min(i, scripts.length - 1)];
      i++;
      return typeof step === 'function' ? step(code) : step;
    },
    listPages: async () => [{ id: 'p1', name: 'a', url: 'https://www.dola.com/chat/', open: true }],
    getCookies: async () => [{ name: 'sessionid', value: 'x' }],
    openPage: async () => ({}),
  };
}

test('messagesToPrompt：单条 user 原样返回', () => {
  assert.equal(messagesToPrompt([{ role: 'user', content: '你好' }]), '你好');
});

test('messagesToPrompt：多角色拼接并保留最后一条 user', () => {
  const out = messagesToPrompt([
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'Q1' },
    { role: 'assistant', content: 'A1' },
    { role: 'user', content: 'Q2' },
  ]);
  assert.ok(out.includes('系统指令: SYS'));
  assert.ok(out.includes('用户: Q1'));
  assert.ok(out.includes('助手: A1'));
  assert.ok(out.includes('用户: Q2'));
  assert.ok(out.endsWith('（以上为历史对话记录，请延续上下文回答最后一条用户消息）'));
});

test('messagesToPrompt：content 数组取 text 部件', () => {
  const out = messagesToPrompt([{ role: 'user', content: [{ type: 'text', text: '多模态' }, { type: 'image_url' }] }]);
  assert.equal(out, '多模态');
});

test('chat：轮询聚合 text/think 并提取 conversationId', async () => {
  let pollCount = 0;
  const bridge = mockBridge([
    () => 'tpoll-returned-later', // 首次 execute 返回 taskId 占位（下面重写）
  ]);
  // 自定义脚本：第一次返回任务 id，之后返回轮询增量
  let call = 0;
  bridge.execute = async () => {
    call++;
    if (call === 1) return 'tabc123';
    pollCount++;
    if (pollCount === 1) return JSON.stringify({ chunks: [{ t: 'text', v: '你' }, { t: 'think', v: '嗯' }], done: false, error: null, conversationId: '42' });
    return JSON.stringify({ chunks: [{ t: 'text', v: '好' }], done: true, error: null, conversationId: '42' });
  };
  const api = createClient({ bridge, pageId: 'p1' });
  const seen = [];
  const result = await api.chat({ prompt: 'hi', onChunk: (t) => seen.push(t) });
  assert.equal(result.text, '你好');
  assert.equal(result.thinking, '嗯');
  assert.equal(result.conversationId, '42');
  assert.deepEqual(seen, ['你', '好']);
});

test('chat：页面请求错误（data.error）抛 DolaApiError', async () => {
  const bridge = mockBridge([]);
  let call = 0;
  bridge.execute = async () => {
    call++;
    if (call === 1) return 'tx';
    return JSON.stringify({ chunks: [], done: true, error: 'HTTP 403: forbidden', conversationId: '' });
  };
  const api = createClient({ bridge, pageId: 'p1' });
  await assert.rejects(() => api.chat({ prompt: 'hi' }), (err) => err.code === 'PAGE_FETCH');
});

test('chat：STREAM_ERROR 风控码透传', async () => {
  const bridge = mockBridge([]);
  let call = 0;
  bridge.execute = async () => {
    call++;
    if (call === 1) return 'tx';
    return JSON.stringify({ chunks: [{ t: 'error', v: '{"code":710022002,"msg":"验证失败"}' }], done: true, error: null, conversationId: '' });
  };
  const api = createClient({ bridge, pageId: 'p1' });
  await assert.rejects(() => api.chat({ prompt: 'hi' }), (err) => err.code === '710022002');
});

test('checkLogin：非 dola 页面报 NOT_ON_SITE', async () => {
  const bridge = mockBridge([]);
  bridge.execute = async () => JSON.stringify({ hasLogin: false, href: 'https://example.com/', onDola: false });
  const api = createClient({ bridge, pageId: 'p1' });
  await assert.rejects(() => api.checkLogin(), (err) => err.code === 'NOT_ON_SITE');
});

test('startChatCode：生成的页面脚本语法可解析且注入了参数', () => {
  const code = startChatCode({ prompt: 'P@测试"引号"', needDeepThink: 3 });
  assert.ok(code.startsWith('(function(){'));
  new Function(code); // 语法检查
  assert.ok(code.includes('"needDeepThink":3'));
  assert.ok(code.includes('P@测试'));
});

test('pollChatCode：taskId 注入为 JSON 字符串字面量', () => {
  const code = pollChatCode('t"evil');
  new Function(code);
  assert.ok(code.includes('"t\\"evil"'));
});

test('MODELS：档位覆盖 0-3 且 id 唯一', () => {
  assert.deepEqual([...new Set(MODELS.map((m) => m.id))].length, MODELS.length);
  assert.deepEqual(new Set(MODELS.map((m) => m.needDeepThink)), new Set([0, 1, 2, 3]));
});

test('MODELS：包含图像与视频模型', () => {
  assert.ok(MODELS.some((m) => m.id === 'dola-seedream' && m.kind === 'image'));
  assert.ok(MODELS.some((m) => m.id === 'dola-seedance' && m.kind === 'video'));
});

test('startChatCode：页面脚本含 2074 creation 解析且语法可解析', () => {
  const code = startChatCode({ prompt: '画猫', needDeepThink: 0 });
  new Function(code);
  assert.ok(code.includes('bt === 2074'));
  assert.ok(code.includes('slimVideo'));
});

test('chat：creation 增量按 id 聚合（占位→结果去重）', async () => {
  const bridge = mockBridge([]);
  let call = 0;
  bridge.execute = async () => {
    call++;
    if (call === 1) return 'tx';
    if (call === 2) {
      return JSON.stringify({ chunks: [{ t: 'creation', v: { type: 1, id: 'A', image: { status: 1, url: '' } } }], done: false, error: null, conversationId: '42' });
    }
    return JSON.stringify({ chunks: [{ t: 'creation', v: { type: 1, id: 'A', image: { status: 2, url: 'https://img' } } }, { t: 'creation', v: { type: 1, id: 'B', image: { status: 2, url: 'https://img2' } } }], done: true, error: null, conversationId: '42' });
  };
  const api = createClient({ bridge, pageId: 'p1' });
  const result = await api.chat({ prompt: 'hi' });
  assert.equal(result.creations.length, 2);
  assert.deepEqual(result.creations.find((c) => c.id === 'A').image, { status: 2, url: 'https://img' });
});

test('generateImage：拼前缀/ratio 并聚合出图', async () => {
  const bridge = mockBridge([]);
  let capturedPrompt = '';
  let call = 0;
  bridge.execute = async (pageId, code) => {
    call++;
    if (call === 1) {
      const m = code.match(/"prompt":"((?:[^"\\]|\\.)*)"/);
      capturedPrompt = JSON.parse(`"${m[1]}"`);
      return 'tx';
    }
    return JSON.stringify({ chunks: [
      { t: 'creation', v: { type: 1, id: 'A', image: { status: 1, url: '' } } },
      { t: 'creation', v: { type: 1, id: 'A', image: { status: 2, url: 'https://ori', thumb: 'https://th', width: 2048, height: 1152 } } },
    ], done: true, error: null, conversationId: '42' });
  };
  const api = createClient({ bridge, pageId: 'p1' });
  const result = await api.generateImage({ prompt: '一轮明月', ratio: '16:9' });
  assert.equal(capturedPrompt, `${IMAGE_PROMPT_PREFIX}一轮明月，16:9`);
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].url, 'https://ori');
  assert.equal(result.images[0].width, 2048);
});

test('generateImage：ratio 1:1 不追加', async () => {
  const bridge = mockBridge([]);
  let capturedPrompt = '';
  let call = 0;
  bridge.execute = async (pageId, code) => {
    call++;
    if (call === 1) {
      const m = code.match(/"prompt":"((?:[^"\\]|\\.)*)"/);
      capturedPrompt = JSON.parse(`"${m[1]}"`);
      return 'tx';
    }
    return JSON.stringify({ chunks: [{ t: 'creation', v: { type: 1, id: 'A', image: { status: 2, url: 'https://ori' } } }], done: true, error: null, conversationId: '42' });
  };
  const api = createClient({ bridge, pageId: 'p1' });
  await api.generateImage({ prompt: '猫', ratio: '1:1' });
  assert.equal(capturedPrompt, `${IMAGE_PROMPT_PREFIX}猫`);
});

test('generateImage：无结果时报 NO_IMAGE', async () => {
  const bridge = mockBridge([]);
  let call = 0;
  bridge.execute = async () => {
    call++;
    if (call === 1) return 'tx';
    return JSON.stringify({ chunks: [{ t: 'text', v: '额度不足' }], done: true, error: null, conversationId: '42' });
  };
  const api = createClient({ bridge, pageId: 'p1' });
  await assert.rejects(() => api.generateImage({ prompt: '猫' }), (err) => err.code === 'NO_IMAGE');
});

test('generateVideo：提交（视频前缀）→ 轮询 chain 直至 status=3', async () => {
  const bridge = mockBridge([]);
  let call = 0;
  let capturedPrompt = '';
  let chainCalls = 0;
  let capturedChainCid = '';
  bridge.execute = async (pageId, code) => {
    call++;
    if (call === 1) {
      const m = code.match(/"prompt":"((?:[^"\\]|\\.)*)"/);
      capturedPrompt = JSON.parse(`"${m[1]}"`);
      return 'tx';
    }
    if (call === 2) {
      // 提交 chat 的轮询：完成
      return JSON.stringify({ chunks: [{ t: 'text', v: '预计5分钟' }], done: true, error: null, conversationId: 'conv9' });
    }
    // pollChainCode
    chainCalls++;
    const m = code.match(/conversation_id:\s*"([^"]+)"/);
    if (m) capturedChainCid = m[1];
    if (chainCalls === 1) {
      return JSON.stringify({ creations: [{ type: 2, id: 'V1', video: { status: 1, vid: 'v1', download_url: '' } }], latestText: '生成中', messageCount: 1 });
    }
    return Promise.resolve(JSON.stringify({ creations: [{ type: 2, id: 'V1', video: { status: 3, vid: 'v1', download_url: 'https://mp4', cover: 'https://cover', duration: 10.08 } }], latestText: '你的视频生成好了。', messageCount: 2 }));
  };
  const api = createClient({ bridge, pageId: 'p1' });
  const result = await api.generateVideo({ prompt: '橘猫伸懒腰', pollIntervalMs: 1 });
  assert.equal(capturedPrompt, `${VIDEO_PROMPT_PREFIX}橘猫伸懒腰`);
  assert.equal(capturedChainCid, 'conv9');
  assert.equal(result.video.download_url, 'https://mp4');
  assert.equal(result.video.duration, 10.08);
  assert.ok(chainCalls >= 2);
});

test('pollChainCode：页面脚本语法可解析且注入 conversation_id', () => {
  const code = pollChainCode('conv"1');
  new Function(code);
  assert.ok(code.includes('"conv\\"1"'));
  assert.ok(code.includes('/im/chain/single'));
});

test('generateVideo：确认提问时自动回复继续（会话复用）', async () => {
  const bridge = mockBridge([]);
  const prompts = [];
  let chainCalls = 0;
  
  bridge.execute = async (pageId, code) => {
    const pm = code.match(/"prompt":"((?:[^"\\]|\\.)*)"/);
    if (pm) prompts.push(JSON.parse(`"${pm[1]}"`));
    if (code.includes('/im/chain/single')) {
      chainCalls++;
      if (chainCalls === 1) {
        return JSON.stringify({ creations: [], latestText: '视频生成支持 4 到 15 秒。是否继续？', messageCount: 1 });
      }
      return JSON.stringify({ creations: [{ type: 2, id: 'V1', video: { status: 3, vid: 'v1', download_url: 'https://mp4' } }], latestText: '完成', messageCount: 3 });
    }
    if (code.includes('window.__dolaTasks || {}')) {
      // chat 轮询：两次（提交 + 确认）都立即完成
      return JSON.stringify({ chunks: [], done: true, error: null, conversationId: 'convA', sectionId: 'secB' });
    }
    return 'tx'; // startChatCode → 任务 id
  };
  const api = createClient({ bridge, pageId: 'p1' });
  const statuses = [];
  const result = await api.generateVideo({ prompt: '3秒', pollIntervalMs: 1, onStatus: (s) => statuses.push(s) });
  assert.equal(result.video.download_url, 'https://mp4');
  assert.equal(prompts.length, 2);
  assert.equal(prompts[0], `${VIDEO_PROMPT_PREFIX}3秒`);
  assert.ok(prompts[1].includes('继续'));
  assert.ok(statuses.some((s) => s.includes('auto-confirm')));
});
