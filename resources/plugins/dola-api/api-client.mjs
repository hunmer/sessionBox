/**
 * dola.com（Doubao 海外版）chat API 客户端（逆向验证版）
 *
 * 关键结论（2026-09-30，js-reverse 实测）:
 *   - 认证为字节 passport cookie（sessionid/sid_tt 等），无 Authorization 头
 *   - POST https://www.dola.com/chat/completion（samantha 协议），响应 text/event-stream
 *   - query 不带 msToken/a_bogus 即可调通，但**仅限浏览器网络栈**：
 *     Node/undici 直连（即使补全 msToken+浏览器头）被风控拒绝
 *     （710022003 country restricted，TLS 指纹识别），因此所有上游请求
 *     必须在 dola.com 页面内 fetch，经 SessionBox bridge /execute 驱动
 *   - SSE 事件：SSE_ACK（conversation_id）/ STREAM_CHUNK（正文增量）/
 *     STREAM_ERROR（error_code，710022002/710022004 为风控）/ SSE_REPLY_END（结束）
 *   - 模型档位：option.need_deep_think 0=快捷 1=深度思考 2=自动 3=专家
 *
 * 流式实现：页面脚本把 SSE 增量写入 window.__dolaTasks[id].chunks，
 * 服务端轮询读取（bridge /execute），从而绕开单次 execute 需等待整个
 * Promise 的限制，也避免长流被 HTTP requestTimeout 截断。
 */

export const DEFAULT_BOT_ID = '7339470689562525703';
export const SITE_URL = 'https://www.dola.com/chat/';

export const MODELS = [
  { id: 'dola', label: 'Dola（快捷问答）', needDeepThink: 0 },
  { id: 'dola-turbo', label: 'Dola Turbo（快捷问答）', needDeepThink: 0 },
  { id: 'dola-think', label: 'Dola 深度思考', needDeepThink: 1 },
  { id: 'dola-auto', label: 'Dola 自动思考', needDeepThink: 2 },
  { id: 'dola-expert', label: 'Dola 专家模式', needDeepThink: 3 },
  { id: 'dola-seedream', label: 'Seedream 4.5 图像生成', needDeepThink: 0, kind: 'image' },
  { id: 'dola-seedance', label: 'Seedance 视频生成', needDeepThink: 0, kind: 'video' },
];

/** 图像生成比例（页面比例选择器实测值）；ratio 追加在 prompt 尾部（非 1:1 时） */
export const IMAGE_RATIOS = ['1:1', '2:3', '3:4', '4:3', '9:16', '16:9'];

/** 生成类请求的 prompt 前缀（服务端语义路由，实测自页面技能按钮行为） */
export const IMAGE_PROMPT_PREFIX = '生成图片：';
export const VIDEO_PROMPT_PREFIX = '生成视频：';

export const RISK_ERROR_CODES = new Set([710022002, 710022004, 710022003]);

export class DolaApiError extends Error {
  constructor(message, { status = 0, code = '', body = null } = {}) {
    super(message);
    this.name = 'DolaApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
  get isAuth() {
    return this.status === 401 || /登录|auth|session|country restricted/i.test(`${this.code} ${this.message}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 在页面内发起 chat/completion 并解析 SSE（增量入 window.__dolaTasks[id].chunks），立即返回任务 id */
export function startChatCode({ prompt, needDeepThink = 0, botId = DEFAULT_BOT_ID, conversationId = '', sectionId = '' }) {
  const p = JSON.stringify({ prompt, needDeepThink, botId, conversationId, sectionId });
  // 注意：模板内是页面执行的 ES5 兼容脚本，不使用反引号/模板字符串
  return `(function(){
var P = ${p};
var T = window.__dolaTasks;
if (!T) T = window.__dolaTasks = {};
var id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2);
var task = { chunks: [], done: false, error: null, conversationId: '', sectionId: '', aborted: false };
T[id] = task;
function uuid(){ return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'u' + Date.now().toString(16) + Math.random().toString(16).slice(2); }
var reuse = !!P.conversationId;
var body = {
  client_meta: { local_conversation_id: 'local_' + Date.now(), conversation_id: P.conversationId || '', bot_id: P.botId, last_section_id: P.sectionId || '', last_message_index: null },
  messages: [{
    local_message_id: uuid(),
    content_block: [{
      block_type: 10000,
      content: { text_block: { text: P.prompt, icon_url: '', icon_url_dark: '', summary: '' }, pc_event_block: '' },
      block_id: uuid(), parent_id: '', meta_info: [], append_fields: [],
      is_finish: true, patch_type: 2,
    }],
    message_status: 0,
  }],
  option: {
    send_message_scene: '', create_time_ms: Date.now(), collect_id: '', is_audio: false,
    answer_with_suggest: false, tts_switch: false, need_deep_think: P.needDeepThink,
    click_clear_context: false, from_suggest: false, is_regen: false, is_replace: false,
    disable_sse_cache: false, select_text_action: '', resend_for_regen: false, scene_type: 0,
    unique_key: uuid(), start_seq: 0, need_create_conversation: !reuse,
    conversation_init_option: { need_ack_conversation: true },
    regen_query_id: [], edit_query_id: [], regen_instruction: '', no_replace_for_regen: false,
    message_from: 0, shared_app_name: '', sse_recv_event_options: { support_chunk_delta: true },
    is_ai_playground: false,
  },
  ext: { use_deep_think: String(P.needDeepThink), sub_conv_firstmet_type: '1', is_finish: '1', commerce_credit_config_enable: '0' },
};
var q = new URLSearchParams({ aid: '495671', device_platform: 'web', language: 'zh', region: 'JP', samantha_web: '1', version_code: '20800', web_platform: 'browser' });
    var inThink = false;
    function slimImage(img){
      if (!img) return null;
      return {
        status: img.status || 0,
        key: img.key || '',
        url: (img.image_ori && img.image_ori.url) || (img.image_preview && img.image_preview.url) || '',
        thumb: (img.image_thumb && img.image_thumb.url) || '',
        width: (img.image_ori && img.image_ori.width) || 0,
        height: (img.image_ori && img.image_ori.height) || 0,
        tips: img.tips || '',
      };
    }
    function slimVideo(v){
      if (!v) return null;
      return {
        status: v.status || 0,
        vid: v.vid || '',
        duration: v.duration || 0,
        video_type: v.video_type || '',
        download_url: v.download_url || '',
        cover: (v.cover && v.cover.image_preview && v.cover.image_preview.url) || '',
        width: v.width || 0,
        height: v.height || 0,
      };
    }
    function push(kind, v){ task.chunks.push({ t: kind, v: v }); }
    function handleBlockItem(cb){
      var bt = cb.block_type || 0;
      var c = cb.content || {};
      if (bt === 10040) { inThink = !inThink; push(inThink ? 'think_start' : 'think_end', ''); return; }
      if (bt === 10000) { var tb = c.text_block || {}; if (tb.text) push(inThink ? 'think' : 'text', tb.text); return; }
      if (bt === 2074) {
        var creations = (c.creation_block && c.creation_block.creations) || [];
        for (var gi = 0; gi < creations.length; gi++) {
          var cr = creations[gi];
          push('creation', { type: cr.type, id: cr.id, image: slimImage(cr.image), video: slimVideo(cr.video) });
        }
        return;
      }
      if (bt === 10101) { var tl = (c.loading_block || {}).text_loading || {}; if (tl.text) push('status', tl.text); return; }
      if (bt === 10024) { var gt = c.generic_tool_block || {}; if (gt.title) push('status', '[tool] ' + gt.title); return; }
      if (bt === 10025) { var sq = c.search_query_result_block || {}; if (sq.summary) push('status', '[search] ' + sq.summary); return; }
    }
function handleBlock(block){
  var ev = '', data = '';
  var lines = block.split('\\n');
  for (var i = 0; i < lines.length; i++) {
    var L = lines[i];
    if (L.indexOf('event:') === 0) ev = L.slice(6).trim();
    else if (L.indexOf('data:') === 0) data += L.slice(5).trim();
  }
  if (!data) return;
  var obj; try { obj = JSON.parse(data); } catch (e) { return; }
  if (ev === 'gateway-error') { task.error = 'gateway-error: ' + (obj.message || obj.msg || data); task.done = true; return; }
  if (ev === 'SSE_ACK') { var ack = obj.ack_client_meta || {}; if (ack.conversation_id) task.conversationId = String(ack.conversation_id); if (ack.section_id) task.sectionId = String(ack.section_id); return; }
  if (ev === 'STREAM_ERROR' || obj.error_code) { push('error', JSON.stringify({ code: obj.error_code || 0, msg: obj.error_msg || obj.message || '' })); return; }
  if (ev === 'SSE_REPLY_END') { task.done = true; return; }
  if (typeof obj.text === 'string' && !obj.error_code) { push(inThink ? 'think' : 'text', obj.text); return; }
  var patches = obj.patch_op || [];
  for (var pi = 0; pi < patches.length; pi++) {
    var pv = patches[pi].patch_value || {};
    var cbs = pv.content_block || [];
    for (var ci = 0; ci < cbs.length; ci++) handleBlockItem(cbs[ci]);
    if (typeof pv.content === 'string' && pv.content) {
      try { var co = JSON.parse(pv.content); if (co && typeof co.text === 'string' && co.text) push(inThink ? 'think' : 'text', co.text); } catch (e) {}
    }
  }
  var dc = obj.content;
  if (dc && typeof dc === 'object' && Array.isArray(dc.content_block)) {
    for (var di = 0; di < dc.content_block.length; di++) handleBlockItem(dc.content_block[di]);
  }
}
fetch('https://www.dola.com/chat/completion?' + q, {
  method: 'POST', credentials: 'include',
  headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
  body: JSON.stringify(body),
}).then(function(res){
  if (res.status !== 200) {
    return res.text().then(function(t){ throw new Error('HTTP ' + res.status + ': ' + t.slice(0, 300)); });
  }
  var ct = res.headers.get('content-type') || '';
  if (ct.indexOf('event-stream') < 0) {
    return res.text().then(function(t){ throw new Error('non-sse response: ' + t.slice(0, 300)); });
  }
  var reader = res.body.getReader();
  var dec = new TextDecoder();
  var buf = '';
  function pump(){
    return reader.read().then(function(r){
      if (task.aborted) { try { reader.cancel(); } catch (e) {} task.done = true; return; }
      if (r.done) { task.done = true; return; }
      buf += dec.decode(r.value, { stream: true });
      var idx;
      while ((idx = buf.indexOf('\\n\\n')) >= 0) {
        var block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        handleBlock(block);
        if (task.done) { try { reader.cancel(); } catch (e) {} return; }
      }
      return pump();
    });
  }
  return pump();
}).catch(function(e){
  task.error = (e && e.message) ? e.message : String(e);
  task.done = true;
});
return id;
})()`;
}

/** 读取任务增量（读后清空；done 后自动清理任务） */
export function pollChatCode(taskId) {
  const id = JSON.stringify(taskId);
  return `(function(){
var T = window.__dolaTasks || {};
var task = T[${id}];
if (!task) return JSON.stringify({ missing: true });
var out = { chunks: task.chunks, done: !!task.done, error: task.error || null, conversationId: task.conversationId || '', sectionId: task.sectionId || '' };
task.chunks = [];
if (task.done) delete T[${id}];
return JSON.stringify(out);
})()`;
}

/** 中止任务（页面内 reader.cancel） */
export function abortChatCode(taskId) {
  const id = JSON.stringify(taskId);
  return `(function(){
var T = window.__dolaTasks || {};
var task = T[${id}];
if (task) { task.aborted = true; task.done = true; }
return true;
})()`;
}

/**
 * 拉取会话最近消息（POST /im/chain/single，视频等异步任务的完成通道）。
 * 返回精简的 creation 列表（按消息倒序，最新在前）与最新一条文本。
 */
export function pollChainCode(conversationId) {
  const cid = JSON.stringify(conversationId);
  return `(function(){
function slimImage(img){
  if (!img) return null;
  return { status: img.status || 0, key: img.key || '',
    url: (img.image_ori && img.image_ori.url) || (img.image_preview && img.image_preview.url) || '',
    thumb: (img.image_thumb && img.image_thumb.url) || '',
    width: (img.image_ori && img.image_ori.width) || 0, height: (img.image_ori && img.image_ori.height) || 0, tips: img.tips || '' };
}
function slimVideo(v){
  if (!v) return null;
  return { status: v.status || 0, vid: v.vid || '', duration: v.duration || 0, video_type: v.video_type || '',
    download_url: v.download_url || '',
    cover: (v.cover && v.cover.image_preview && v.cover.image_preview.url) || '',
    width: v.width || 0, height: v.height || 0 };
}
var body = { cmd: 3100,
  uplink_body: { pull_singe_chain_uplink_body: {
    conversation_id: ${cid}, anchor_index: 9007199254740991, conversation_type: 3, direction: 1, limit: 20,
    ext: {}, filter: { index_list: [] }, evaluate_ab_params: '', evaluate_common_params: '', option: { lazy_load_strategy: 0 } } },
  sequence_id: 'q' + Date.now() + Math.random().toString(36).slice(2), channel: 2, version: '1' };
var q = new URLSearchParams({ aid: '495671', device_platform: 'web', language: 'zh', region: 'JP', samantha_web: '1', version_code: '20800', web_platform: 'browser' });
return fetch('https://www.dola.com/im/chain/single?' + q, {
  method: 'POST', credentials: 'include',
  headers: { 'content-type': 'application/json; encoding=utf-8', accept: 'application/json, text/plain, */*', 'agw-js-conv': 'str' },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(30000),
}).then(function(res){
  if (res.status !== 200) throw new Error('HTTP ' + res.status);
  return res.json();
}).then(function(data){
  var pull = (data.downlink_body && data.downlink_body.pull_singe_chain_downlink_body) || {};
  var msgs = pull.messages || [];
  var creations = [];
  var latestText = '';
  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i];
    if (typeof m.content !== 'string' || !m.content) continue;
    var blocks;
    try { blocks = JSON.parse(m.content); } catch (e) { continue; }
    if (!Array.isArray(blocks)) continue;
    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];
      if (b.block_type === 2074) {
        var cs = (b.content && b.content.creation_block && b.content.creation_block.creations) || [];
        for (var ci = 0; ci < cs.length; ci++) {
          var cr = cs[ci];
          creations.push({ messageId: String(m.message_id), type: cr.type, id: cr.id,
            image: slimImage(cr.image), video: slimVideo(cr.video) });
        }
      } else if (b.block_type === 10000 && i === 0) {
        var tb = (b.content && b.content.text_block) || {};
        if (tb.text) latestText = tb.text;
      }
    }
  }
  return JSON.stringify({ creations: creations, latestText: latestText, messageCount: msgs.length });
}).catch(function(e){
  return JSON.stringify({ error: (e && e.message) ? e.message : String(e) });
});
})()`;
}

/** 检查页面是否在 dola.com 且 localStorage 标记已登录（cookie 检查见 accounts.mjs：HttpOnly 的 sessionid 需经 bridge getCookies 读） */
export const CHECK_LOGIN_CODE = `(function(){
return JSON.stringify({
  hasLogin: localStorage.getItem('flow_web_has_login') === 'true',
  href: location.href,
  onDola: /(^|\\.)dola\\.com$/.test(location.hostname),
});
})()`;

/**
 * 创建 dola 客户端。所有请求经 bridge 在指定页面内执行。
 * @param {object} opts
 *   bridge        SessionBox bridge 客户端（sessionbox.mjs）
 *   pageId        SessionBox 页面 id（=账号）
 */
export function createClient({ bridge, pageId }) {
  async function execute(code) {
    return bridge.execute(pageId, code);
  }

  /**
   * 发送一条消息并返回聚合结果。
   * @param {object} opts
   *   prompt          用户消息文本（生成类调用方自行拼接 IMAGE/VIDEO_PROMPT_PREFIX）
   *   needDeepThink   0|1|2|3 模型档位
   *   botId           默认 DEFAULT_BOT_ID
   *   conversationId/sectionId  传入则复用会话（need_create_conversation=false），如自动确认场景
   *   timeoutMs       总超时（默认 300s）
   *   intervalMs      轮询间隔（默认 300ms）
   *   signal          AbortSignal
   *   onChunk(text) / onThinkChunk(text) / onStatus(text)   增量回调
   * @returns {Promise<{text, thinking, conversationId, sectionId, statuses: string[], creations: object[]}>}
   */
  async function chat({
    prompt,
    needDeepThink = 0,
    botId = DEFAULT_BOT_ID,
    conversationId = '',
    sectionId = '',
    timeoutMs = 300_000,
    intervalMs = 300,
    signal,
    onChunk,
    onThinkChunk,
    onStatus,
  } = {}) {
    const taskId = await execute(startChatCode({ prompt, needDeepThink, botId, conversationId, sectionId }));
    if (typeof taskId !== 'string' || !taskId.startsWith('t')) {
      throw new DolaApiError(`页面任务创建失败（页面可能不在 dola.com）: ${String(taskId).slice(0, 200)}`, { code: 'TASK_START' });
    }
    const deadline = Date.now() + timeoutMs;
    let text = '';
    let thinking = '';
    let convId = conversationId || '';
    let sectId = sectionId || '';
    const statuses = [];
    const creations = new Map(); // id -> 最新 creation
    let streamError = null;
    try {
      for (;;) {
        if (signal?.aborted) throw new DolaApiError('已中止', { code: 'ABORTED' });
        const raw = await execute(pollChatCode(taskId));
        let data;
        try { data = JSON.parse(raw); } catch {
          throw new DolaApiError(`轮询结果解析失败: ${String(raw).slice(0, 120)}`, { code: 'POLL_PARSE' });
        }
        if (data.missing) throw new DolaApiError('页面任务丢失（页面可能已导航或刷新）', { code: 'TASK_LOST' });
        if (data.conversationId) convId = data.conversationId;
        if (data.sectionId) sectId = data.sectionId;
        for (const ch of data.chunks || []) {
          if (ch.t === 'text') { text += ch.v; onChunk?.(ch.v); }
          else if (ch.t === 'think') { thinking += ch.v; onThinkChunk?.(ch.v); }
          else if (ch.t === 'status') { statuses.push(ch.v); onStatus?.(ch.v); }
          else if (ch.t === 'creation' && ch.v?.id) { creations.set(ch.v.id, ch.v); }
          else if (ch.t === 'think_start' || ch.t === 'think_end') { /* 状态标记，无需透传 */ }
          else if (ch.t === 'error') {
            let parsed = {};
            try { parsed = JSON.parse(ch.v); } catch { /* 非 JSON */ }
            streamError = new DolaApiError(
              `[${parsed.code}] ${parsed.msg || 'STREAM_ERROR'}`,
              { code: String(parsed.code || 'STREAM_ERROR'), body: parsed },
            );
          }
        }
        if (data.error) throw new DolaApiError(`页面请求失败: ${data.error}`, { code: 'PAGE_FETCH' });
        if (streamError) throw streamError;
        if (data.done) break;
        if (Date.now() > deadline) throw new DolaApiError(`对话超时（${timeoutMs}ms）`, { code: 'TIMEOUT' });
        await sleep(intervalMs);
      }
    } catch (err) {
      await execute(abortChatCode(taskId)).catch(() => {});
      throw err;
    }
    return { text, thinking, conversationId: convId, sectionId: sectId, statuses, creations: [...creations.values()] };
  }

  /** 页面登录态检查：{ hasLogin, href, onDola } */
  async function checkLogin() {
    const raw = await execute(CHECK_LOGIN_CODE);
    let parsed;
    try { parsed = JSON.parse(raw); } catch {
      throw new DolaApiError(`登录态检查失败（页面可能不在 dola.com）: ${String(raw).slice(0, 120)}`, { code: 'LOGIN_CHECK' });
    }
    if (!parsed.onDola) {
      throw new DolaApiError(`页面不在 dola.com（当前 ${parsed.href}），无法执行 dola 请求`, { code: 'NOT_ON_SITE' });
    }
    return parsed;
  }

  /**
   * 图像生成（Seedream 4.5，同步：SSE 内直接返回结果，实测约 20s）。
   * @param {object} opts
   *   prompt     图像描述
   *   ratio      1:1|2:3|3:4|4:3|9:16|16:9（默认 1:1；非 1:1 时追加到 prompt 尾部）
   *   timeoutMs  默认 180s
   * @returns {Promise<{images: object[], text, conversationId}>}
   *   images: [{ id, url(2048 下载版), thumb, width, height, key }]
   */
  async function generateImage({ prompt, ratio = '1:1', timeoutMs = 180_000, signal, onStatus } = {}) {
    const finalPrompt = IMAGE_PROMPT_PREFIX + prompt + (ratio && ratio !== '1:1' ? `，${ratio}` : '');
    const result = await chat({ prompt: finalPrompt, timeoutMs, signal, onStatus });
    const images = result.creations
      .map((c) => c.image ? { id: c.id, ...c.image } : null)
      .filter(Boolean)
      .filter((img) => img.url); // 过滤未出图的占位（status=1 无 url）
    if (!images.length) {
      throw new DolaApiError(`图像生成未返回结果（回复: ${result.text.slice(0, 150)}）`, { code: 'NO_IMAGE', body: { text: result.text } });
    }
    return { images, text: result.text, conversationId: result.conversationId };
  }

  /** 轮询会话 creations（视频异步完成通道），返回 { creations, latestText } */
  async function pollCreations(conversationId) {
    const raw = await execute(pollChainCode(conversationId));
    let data;
    try { data = JSON.parse(raw); } catch {
      throw new DolaApiError(`会话轮询结果解析失败: ${String(raw).slice(0, 120)}`, { code: 'POLL_CHAIN_PARSE' });
    }
    if (data.error) throw new DolaApiError(`会话轮询失败: ${data.error}`, { code: 'POLL_CHAIN' });
    return data;
  }

  /** 确认类文案（dola 对不支持的时长等参数会发问"是否继续？"挂起任务） */
  const CONFIRM_PATTERNS = [/是否继续/, /继续吗[？?]/, /请确认/, /请回复.{0,6}(继续|确认)/];

  /**
   * 视频生成（Seedance，异步：提交后轮询 /im/chain/single 直至 video.status===3）。
   * 遇到"是否继续？"类确认提问时自动回复"继续"（最多 2 次，防循环）。
   * @param {object} opts
   *   prompt          视频描述（时长请写 4-15 秒）
   *   timeoutMs       总超时（默认 600s）
   *   pollIntervalMs  轮询间隔（默认 5s）
   *   onStatus(text)  进度回调（提交确认/自动确认等）
   * @returns {Promise<{video, text, conversationId}>}
   *   video: { vid, download_url, cover, duration, width, height }
   */
  async function generateVideo({ prompt, timeoutMs = 600_000, pollIntervalMs = 5_000, signal, onStatus } = {}) {
    const submit = await chat({ prompt: VIDEO_PROMPT_PREFIX + prompt, timeoutMs: 60_000, signal, onStatus });
    if (!submit.conversationId) {
      throw new DolaApiError(`视频任务提交未返回会话 id（回复: ${submit.text.slice(0, 150)}）`, { code: 'NO_CONVERSATION' });
    }
    const deadline = Date.now() + timeoutMs;
    let confirms = 0;
    let lastSectionId = submit.sectionId || '';
    let consecutiveErrors = 0; // 轮询网络失败容错（连续 6 次≈30s 才放弃）
    for (;;) {
      if (signal?.aborted) throw new DolaApiError('已中止', { code: 'ABORTED' });
      if (Date.now() > deadline) {
        throw new DolaApiError(`视频生成超时（${timeoutMs}ms），可用 conversation_id=${submit.conversationId} 稍后查询`, { code: 'TIMEOUT', body: { conversationId: submit.conversationId } });
      }
      await sleep(pollIntervalMs);
      let data;
      try {
        data = await pollCreations(submit.conversationId);
        consecutiveErrors = 0;
      } catch (err) {
        if (!/fetch failed|network|TIMEOUT|abort/i.test(`${err.code || ''} ${err.message}`) || ++consecutiveErrors >= 6) throw err;
        onStatus?.(`[poll-retry ${consecutiveErrors}] ${String(err.message).slice(0, 80)}`);
        continue;
      }
      // 视频完成消息在会话最新一条（messages 倒序），取第一个 status===3 的 video
      const video = (data.creations || []).map((c) => c.video).find((v) => v && Number(v.status) === 3 && v.download_url);
      if (video) return { video, text: submit.text, conversationId: submit.conversationId };
      for (const c of data.creations || []) {
        if (c.video && Number(c.video.status) !== 1 && Number(c.video.status) !== 3) {
          throw new DolaApiError(`视频生成失败（status=${c.video.status}）: ${c.video.tips || data.latestText.slice(0, 120)}`, { code: 'VIDEO_FAILED' });
        }
      }
      // 无 video 任务且模型在等确认 → 同会话自动回复"继续"
      const pendingConfirm = (data.creations || []).every((c) => !c.video)
        && CONFIRM_PATTERNS.some((re) => re.test(data.latestText || ''));
      if (pendingConfirm && confirms < 2) {
        confirms++;
        onStatus?.(`[auto-confirm #${confirms}] ${data.latestText.slice(0, 80)} → 继续`);
        const ack = await chat({
          prompt: '继续，按最接近的支持参数生成',
          conversationId: submit.conversationId,
          sectionId: lastSectionId,
          timeoutMs: 60_000,
          signal,
        });
        lastSectionId = ack.sectionId || lastSectionId;
      }
    }
  }

  return { chat, generateImage, generateVideo, pollCreations, checkLogin, pageId };
}

/** OpenAI messages → dola 单条 prompt（无状态：每次请求创建新对话，历史拼入文本） */
export function messagesToPrompt(messages = []) {
  if (!messages.length) return '';
  const fmt = (m) => {
    const c = Array.isArray(m.content)
      ? m.content.map((p) => (p.type === 'text' ? p.text : '')).filter(Boolean).join('\n')
      : String(m.content ?? '');
    return c;
  };
  const last = messages[messages.length - 1];
  const history = messages.slice(0, -1);
  if (!history.length) return fmt(last);
  const lines = [];
  for (const m of history) {
    const role = m.role === 'system' ? '系统指令' : m.role === 'assistant' ? '助手' : '用户';
    lines.push(`${role}: ${fmt(m)}`);
  }
  lines.push(`用户: ${fmt(last)}`);
  const sysHint = '（以上为历史对话记录，请延续上下文回答最后一条用户消息）';
  return `${lines.join('\n\n')}\n\n${sysHint}`;
}
