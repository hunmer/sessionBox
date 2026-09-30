#!/usr/bin/env node
/**
 * liblib.tv 画布 API 客户端（逆向验证版）
 *
 * 凭据来源（浏览器登录后）:
 *   - token: cookie `usertoken`
 *   - webid: cookie `webid`
 *
 * 两种用法:
 *   1. 作为模块: import { createClient, MODELS } from './api-client.mjs'
 *      const api = createClient({ token, webid })   // 多账号时每账号一个实例
 *   2. CLI（凭据取环境变量 LIBLIB_TOKEN / LIBLIB_WEBID）:
 *      LIBLIB_TOKEN=xxx LIBLIB_WEBID=yyy node api-client.mjs whoami
 *
 * 已验证结论:
 *   - riskControl.deviceToken / x-log-id 可省略
 *   - nodeKey / requestId 前端随机生成即可；nodes/batch 的 version 校验宽松（0 可用）
 *   - token = cookie usertoken; webid = cookie webid
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_URLS = {
  tv: 'https://api.liblib.tv',
  www: 'https://www.liblib.tv',
  bridge: 'https://bridge.liblib.art/gateway/oss-server-api/oss-service/api/oss/pre-sign/4',
  account: 'https://api2.liblib.art',
};

const nanoid = (n) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  for (let i = 0; i < n; i++) s += chars[bytes[i] % chars.length];
  return s;
};

/**
 * 已验证可用的模型（power 为 calculator 实测值，具体随参数档位浮动）
 * 来源: landing-activities id=182 官方配置的 modelKey，经 power/calculator 逐一验证
 */
export const MODELS = {
  text: [
    { id: 'qwen-3-vl-flash', provider: 'Qwen', label: 'Qwen 3 VL Flash', power: 1 },
    { id: 'aurora-3-lite', provider: 'aurora', label: 'GVLM 3.1 Flash', power: 2 },
    { id: 'aurora-3-prime', provider: 'aurora', label: 'GVLM 3.1（默认）', power: 6 },
    { id: 'cvlm-5.5', provider: 'aurora', label: 'CVLM 5.5', power: 20 },
  ],
  image: [
    { id: 'qwen-edit', provider: 'Qwen', label: 'Qwen Edit 编辑/图生图（默认）', power: 1 },
    { id: 'qwen', provider: 'Qwen', label: 'Qwen Image', power: 1 },
    { id: 'seedream-4', provider: 'Seedream', label: 'Seedream 4.0', power: 1 },
    { id: 'z-image', provider: 'Z-Image', label: 'Z-image Turbo 极速', power: 1 },
    { id: 'seedream-4.5', provider: 'Seedream', label: 'Seedream 4.5', power: 4 },
    { id: 'seedream-5', provider: 'Seedream', label: 'Seedream 5.0 Lite', power: 4 },
    { id: 'jimeng-4.6', provider: 'Seedream', label: 'Seedream 4.6', power: 4 },
    { id: 'qwen-image-3', provider: 'Qwen', label: 'Qwen image 3.0', power: 5 },
    { id: 'doubao-seedream-5-0-pro', provider: 'Seedream', label: 'Seedream 5.0 Pro', power: 7 },
    { id: 'seedream-5.0-pro-layer', provider: 'Seedream', label: 'Seedream 5.0 Pro Layer', power: 3 },
    { id: 'nebula-ultra', provider: 'nebula', label: 'General image Pro', power: 14 },
    { id: 'nebula-2-flash', provider: 'nebula', label: 'General image V2', power: 14 },
    { id: 'lib-image-2.5-s', provider: 'lib-image', label: 'Lib Image 2.5 Pro', power: 15 },
    { id: 'lib-image-2.5-f', provider: 'lib-image', label: 'Lib Image 2.5 Fast', power: 15 },
    { id: 'mj-v8.2', provider: 'Midjourney', label: 'Style Image V8.2', power: 15 },
    { id: 'mj-v8.1', provider: 'Midjourney', label: 'Style Image V8.1', power: 15 },
    { id: 'lib-image-2', provider: 'lib-image', label: 'Lib Image 2', power: 18 },
  ],
  audio: [
    { id: 'seed-audio-1.0', provider: 'seed-audio', label: 'Seed Audio 1.0（默认，多模态）', power: 1 },
    { id: 'speech-2.8-hd', provider: 'Minimax', label: 'Minimax Speech 2.8 HD TTS', power: 1 },
    { id: 'speech-2.8-turbo', provider: 'Minimax', label: 'Minimax Speech 2.8 Turbo TTS', power: 1 },
    { id: 'vocal-music', provider: 'Eleven', label: 'Eleven Music V3 音乐生成', power: 1 },
    { id: 'vocal-v3', provider: 'Eleven', label: 'Eleven V3 TTS', power: 19 },
    { id: 'mureka-8', provider: 'Mureka', label: 'Mureka V8 音乐生成', power: 60 },
  ],
  video: [
    { id: 'MiniMax-Hailuo-o2', provider: 'MiniMax', label: 'Hailuo 02（最便宜）', power: 8 },
    { id: 'kling-v2-5-turbo-pro', provider: 'Kling', label: 'Kling 2.5', power: 10 },
    { id: 'MiniMax-Hailuo-2.3', provider: 'MiniMax', label: 'Hailuo 2.3', power: 12 },
    { id: 'MiniMax-Hailuo-2.3-Fast', provider: 'MiniMax', label: 'Hailuo 2.3 Fast', power: 12 },
    { id: 'happy-horse-1.1', provider: 'HappyHorse', label: 'Happy Horse 1.1', power: 12 },
    { id: 'kling-video-o1', provider: 'Kling', label: 'Kling O1', power: 14 },
    { id: 'omnihuman-1.5', provider: 'OmniHuman', label: 'OmniHuman 1.5 数字人', power: 14 },
    { id: 'seedance-1.5-pro', provider: 'Seedance', label: 'Seedance 1.5 Pro（旧版仍可用）', power: 16 },
    { id: 'wanx3.0', provider: 'Wan', label: 'Wan 3.0 全模态参考（默认）', power: 16 },
    { id: 'wanx3.0-prime', provider: 'Wan', label: 'Wan 3.0 Prime 快速', power: 29 },
    { id: 'wanx2.7-video', provider: 'Wan', label: 'Wan 2.7', power: 16 },
    { id: 'wanxiang-v2-6', provider: 'Wan', label: 'Wan 2.6', power: 16 },
    { id: 'wanxiang-plus', provider: 'Wan', label: 'Wan 2.2', power: 16 },
    { id: 'wanxiang-preview', provider: 'Wan', label: 'Wan 2.5', power: 16 },
    { id: 'viduq2', provider: 'Vidu', label: 'Vidu Q2', power: 16 },
    { id: 'viduq2-pro', provider: 'Vidu', label: 'Vidu Q2 Pro', power: 16 },
    { id: 'viduq3-pro', provider: 'Vidu', label: 'Vidu Q3 Pro', power: 20 },
    { id: 'kling-v2-6', provider: 'Kling', label: 'Kling 2.6', power: 20 },
    { id: 'kling-v3-omni', provider: 'Kling', label: 'Kling O3 编辑', power: 22 },
    { id: 'kling-video-o3', provider: 'Kling', label: 'Kling 3.0', power: 22 },
    { id: 'kling-v3-turbo', provider: 'Kling', label: 'Kling 3.0 Turbo', power: 24 },
    { id: 'MiniMax-Hailuo-H3-Max', provider: 'MiniMax', label: 'Minimax H3 Max', power: 24 },
    { id: 'pixverse-v5.5', provider: 'Pixverse', label: 'Pixverse V5.5', power: 24 },
    { id: 'happy-horse-1', provider: 'HappyHorse', label: 'Happy Horse 1.0', power: 32 },
    { id: 'star-video2-mini', provider: 'Seedance', label: 'Seedance 2.0 Mini', power: 32 },
    { id: 'MiniMax-Hailuo-H3', provider: 'MiniMax', label: 'Minimax H3', power: 44 },
    { id: 'star-video2-fast', provider: 'Seedance', label: 'Seedance 2.0 Fast VIP', power: 44 },
    { id: 'star-video2', provider: 'Seedance', label: 'Seedance 2.0 VIP', power: 54 },
    { id: 'star-video2.5', provider: 'Seedance', label: 'Seedance 2.5', power: 78 },
    { id: 'star-video2.5-draft', provider: 'Seedance', label: 'Seedance 2.5 样片480P', power: 92 },
    { id: 'midjourney-video', provider: 'Midjourney', label: 'Style Video', power: 180 },
  ],
};

/** 解析 PNG/JPEG 尺寸（读文件头，无依赖） */
export function imageSize(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }; // PNG IHDR
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) { // JPEG: 扫 SOF 段
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/**
 * 创建绑定凭据的客户端实例（多账号时每账号一个）
 * @param {object} opts
 * @param {string} opts.token   cookie usertoken（必需）
 * @param {string} opts.webid   cookie webid（必需）
 * @param {string} [opts.useruuid] cookie useruuid；未传时 uploadFile 自动从 getAccount().ownerUuid 获取
 * @param {object} [opts.urls]  覆盖上游地址（测试注入用）
 * @param {function} [opts.onLog] 上游请求日志回调，入参单行文本（method path code 耗时）
 */
export function createClient({ token, webid, useruuid, urls = {}, onLog } = {}) {
  if (!token || !webid) throw new Error('缺少凭据: token(cookie usertoken) / webid(cookie webid)');
  const U = { ...DEFAULT_URLS, ...urls };

  const upstream = (method, url, code, ms) => {
    try { onLog?.(`upstream ${method} ${new URL(url).pathname} code=${code} ${ms}ms`); } catch { /* 日志异常不影响请求 */ }
  };

  async function call(method, url, body) {
    const started = Date.now();
    const res = await fetch(url, {
      method,
      headers: {
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json',
        'origin': `${U.www}`,
        'referer': `${U.www}/canvas`,
        'token': token,
        'webid': webid,
        'x-language': 'zh',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const json = await res.json();
    upstream(method, url, json.code, Date.now() - started);
    if (json.code !== 0) {
      const err = new Error(`API 错误 code=${json.code} msg=${json.msg} ${json.extra_msg || ''} (${url})`);
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  /** 创建新画布（含独立 space/folder），返回 { projectMeta, projectSpace } */
  function createCanvas(name = '画布 1') {
    return call('POST', `${U.www}/api/canvas/project/create-with-space`, { name });
  }

  /** 项目列表 */
  function listProjects({ pageNum = 1, pageSize = 20 } = {}) {
    return call('POST', `${U.www}/api/canvas/project/list`, { folderId: null, keyword: '', pageNum, pageSize });
  }

  /** 画布详情（含 nodeList / connectionList） */
  async function getProjectDetailBySpace(spaceId) {
    const json = await fetch(`${U.tv}/api/canvas/project/detail-by-space?spaceId=${spaceId}`, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'token': token,
        'webid': webid,
        'x-language': 'zh',
      },
      signal: AbortSignal.timeout(30000),
    }).then((r) => r.json());
    if (json.code !== 0) {
      const err = new Error(`API 错误 code=${json.code} msg=${json.msg}`);
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  /**
   * 向画布添加文本生成节点（UI 可见）
   * 返回 nodeKey。刷新画布页面即可看到节点卡片。
   */
  async function addTextNode({ projectId, name = 'API文本节点', prompt = '', x = 468, y = 480 }) {
    const nodeKey = 't-' + nanoid(10);
    const data = JSON.stringify({
      type: 'text', name, content: [], action: 'text_generate', generatorType: 'default',
      params: { prompt, model: 'aurora-3-prime', count: 1, textList: [], imageList: [], videoList: [], audioList: [] },
    });
    await call('POST', `${U.tv}/api/canvas/nodes/batch`, {
      projectUuid: projectId,
      nodes: { create: [{ nodeKey, projectUuid: projectId, type: 1, name, position: { positionX: String(x), positionY: String(y) }, parentKey: '', data }] },
      connections: {},
      version: 0,
      requestId: nanoid(16),
      sessionId: nanoid(19),
      timestamp: Date.now(),
    });
    return nodeKey;
  }

  /** 生成 metadata 字段；projectId 省略时不关联任何画布（任务仅挂靠账号） */
  function buildMetadata(projectId, prefix) {
    return projectId ? { node_id: prefix + nanoid(10), project_id: projectId } : undefined;
  }

  /** 解析参考文件列表: 本地路径自动上传，http(s) URL 直接使用 */
  async function resolveRefs(refs = []) {
    const out = [];
    for (const ref of refs) {
      if (/^https?:\/\//.test(ref)) out.push({ url: ref });
      else out.push({ url: (await uploadFile({ filePath: ref })).cdnUrl });
    }
    return out;
  }

  /** 创建文字生成任务（model 见 MODELS.text；refs 传参考图走多模态输入，projectId 可选） */
  async function createTextGeneration({ prompt, projectId, model = 'aurora-3-prime', count = 1, refs = [] }) {
    const entry = MODELS.text.find(m => m.id === model) || { provider: 'aurora' };
    const imageList = await resolveRefs(refs);
    return call('POST', `${U.tv}/api/task/generation/create`, {
      params: { prompt, model, count, textList: [], imageList, imageLabelList: [], videoList: [], audioList: [], infiniteSwitch: 0 },
      metadata: buildMetadata(projectId, 't-'),
      provider: entry.provider,
      model,
      taskType: 'text',
      requestId: nanoid(16),
    });
  }

  /** 创建音频生成任务（text2audio；refs 传参考音频做声音参考，projectId 可选） */
  async function createAudioGeneration({ prompt, projectId, model = 'seed-audio-1.0', scene = 'Music', speed = 1, pitch = 0, vol = 1, refs = [] }) {
    const entry = MODELS.audio.find(m => m.id === model) || { provider: 'seed-audio' };
    const audioList = await resolveRefs(refs);
    return call('POST', `${U.tv}/api/task/generation/create`, {
      params: {
        prompt, model, scene, count: 1, modeType: 'text2audio', language: 'zh',
        sample_rate: 24000, format: 'wav',
        voice_setting_speed: speed, voice_setting_pitch: pitch, voice_setting_vol: vol,
        textList: [], imageList: [], imageLabelList: [], videoList: [], audioList, infiniteSwitch: 0,
      },
      metadata: buildMetadata(projectId, 'a-'),
      provider: entry.provider, model, taskType: 'audio',
      requestId: nanoid(16),
    });
  }

  /** 创建图片生成任务；model 见 MODELS.image；refs 传参考图（本地路径或 URL，图生图） */
  async function createImageGeneration({ prompt, projectId, model = 'qwen-edit', quality = 'medium', resolution = '2K', ratio = '16:9', count = 1, refs = [] }) {
    const entry = MODELS.image.find(m => m.id === model) || { provider: 'lib-image' };
    const imageList = await resolveRefs(refs);
    return call('POST', `${U.tv}/api/task/generation/create`, {
      params: {
        prompt, model, count, modeType: imageList.length ? 'image2image' : 'text2image',
        quality, resolution, background: 'auto', ratio,
        textList: [], imageList, imageLabelList: [], videoList: [], audioList: [], infiniteSwitch: 0,
      },
      metadata: buildMetadata(projectId, 'i-'),
      provider: entry.provider, model, taskType: 'image',
      requestId: nanoid(16),
    });
  }

  /**
   * 创建视频生成任务
   * 参考模式（modeType）:
   *   - mixed2video  全能参考（默认，单图/多图均可）：参考图进 mixedList + imageListV2，prompt 用 {{Mixed 1}}/{{Mixed 2}} 引用素材
   *   - frames2video 首尾帧（显式传 mode 使用）：1张=首帧，2张=首尾帧，imageList 为纯 URL 字符串数组
   *   - text2video   纯文本（无参考图）
   */
  async function createVideoGeneration({ prompt, projectId, model = 'wanx3.0', ratio = '16:9', resolution = '720P', duration = 2, refs = [], enableSound = 'on', extendPrompt = 1, mode }) {
    const entry = MODELS.video.find(m => m.id === model) || { provider: 'Wan' };
    const urls = [];
    const v2 = [];
    for (const ref of refs) {
      if (/^https?:\/\//.test(ref)) {
        urls.push(ref); v2.push({ url: ref });
      } else {
        const { cdnUrl } = await uploadFile({ filePath: ref });
        const buf = await readFile(ref);
        const size = imageSize(buf) || {};
        urls.push(cdnUrl); v2.push({ url: cdnUrl, width: size.width, height: size.height });
      }
    }
    const modeType = mode || (urls.length === 0 ? 'text2video' : 'mixed2video');
    return call('POST', `${U.tv}/api/task/generation/create`, {
      params: {
        prompt, model, modeType, count: 1, ratio, resolution, duration, enableSound, extendPrompt,
        textList: [],
        imageList: modeType === 'mixed2video' ? [] : urls,
        imageLabelList: modeType === 'mixed2video' ? [] : urls.map(() => ''),
        videoList: [],
        imageListV2: v2,
        audioList: [],
        mixedList: modeType === 'mixed2video' ? urls.map((url) => ({ url, type: 'image' })) : [],
        infiniteSwitch: 0,
      },
      metadata: buildMetadata(projectId, 'v-'),
      provider: entry.provider, model, taskType: 'video',
      requestId: nanoid(16),
    });
  }

  /** 计算任务积分（零消耗，用于提交前估价） */
  function calcPower({ taskType, model, provider, params, projectId }) {
    return call('POST', `${U.tv}/api/task/generation/power/calculator`, {
      params, metadata: buildMetadata(projectId, 'x-'),
      provider, model, taskType, requestId: nanoid(16),
    });
  }

  /**
   * 获取用户账号信息（api2.liblib.art，仅需 token+webid）
   * 含 userId / ownerUuid(=上传用 useruuid) / 会员等级 / 积分 attr.usablePower / 到期时间
   */
  async function getAccount() {
    const url = `${U.account}/api/www/member/account?isApp=false`;
    const started = Date.now();
    const json = await fetch(url, {
      headers: { 'accept': 'application/json, text/plain, */*', 'token': token, 'webid': webid },
      signal: AbortSignal.timeout(30000),
    }).then((r) => r.json());
    upstream('GET', url, json.code, Date.now() - started);
    if (json.code !== 0) {
      const err = new Error(`API 错误 code=${json.code} msg=${json.msg}`);
      err.code = json.code;
      throw err;
    }
    return json.data;
  }

  /**
   * 上传文件到 libtv 公共资源（OSS）
   * 三段式: pre-sign 申请签名 URL -> PUT 直传 OSS -> 返回 cdnUrl
   * useruuid 优先取传入值，未设置时自动从账号信息获取（ownerUuid）；
   * 文件名用内容 SHA1（与官方前端一致的幂等去重）。
   */
  async function uploadFile({ filePath, useruuid: uuid = useruuid, contentType, buffer, filename }) {
    if (!uuid) {
      const acct = await getAccount();
      uuid = acct.ownerUuid;
    }
    const buf = buffer || await readFile(filePath);
    const name = filename || filePath;
    const ext = name.split('.').pop().toLowerCase();
    const type = contentType || ({
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
      mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm',
    }[ext] || 'application/octet-stream');
    const path = `upload-images/${uuid}/${createHash('sha1').update(buf).digest('hex')}.${ext}`;

    const presignStarted = Date.now();
    const presign = await fetch(U.bridge, {
      method: 'POST',
      headers: { 'accept': '*/*', 'content-type': 'application/json', 'token': token },
      body: JSON.stringify({ path, contentType: type }),
      signal: AbortSignal.timeout(30000),
    }).then((r) => r.json());
    upstream('POST', U.bridge, presign.code, Date.now() - presignStarted);
    if (presign.code !== 0) {
      const err = new Error(`pre-sign 失败 code=${presign.code} msg=${presign.msg}`);
      err.code = presign.code;
      throw err;
    }

    const put = await fetch(presign.data.ossUrl, {
      method: 'PUT',
      headers: { 'content-type': type },
      body: buf,
      signal: AbortSignal.timeout(120000),
    });
    if (!put.ok) throw new Error(`OSS PUT 失败 HTTP ${put.status}`);
    return { cdnUrl: presign.data.cdnUrl, ossUrl: presign.data.ossUrl };
  }

  /** 查询任务进度 */
  function getProgress(taskIds) {
    return call('POST', `${U.tv}/api/task/generation/progress`, { taskIds });
  }

  /** 轮询直到完成，返回 taskResult 解析后的对象 */
  async function waitForTask(taskId, { intervalMs = 3000, timeoutMs = 120000 } = {}) {
    const start = Date.now();
    for (;;) {
      const data = await getProgress([taskId]);
      const p = data.progresses && data.progresses[0];
      if (!p) throw new Error(`任务 ${taskId} 不存在`);
      if (p.status === 2) return JSON.parse(p.taskResult);
      if (p.status !== 0 && p.status !== 1) throw new Error(`任务 ${taskId} 异常状态: ${p.status} ${p.failedReason || ''}`);
      if (Date.now() - start > timeoutMs) throw new Error(`任务 ${taskId} 超时`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  return {
    createCanvas, listProjects, getProjectDetailBySpace, addTextNode,
    createTextGeneration, createAudioGeneration, createImageGeneration, createVideoGeneration,
    calcPower, getAccount, uploadFile, getProgress, waitForTask,
  };
}

// ---------- CLI（仅直接执行时运行；凭据取环境变量） ----------
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const TOKEN = process.env.LIBLIB_TOKEN;
  const WEBID = process.env.LIBLIB_WEBID;
  const USERUUID = process.env.LIBLIB_USERUUID;
  if (!TOKEN || !WEBID) {
    console.error('缺少环境变量 LIBLIB_TOKEN / LIBLIB_WEBID（取自浏览器 cookie: usertoken / webid）');
    process.exit(1);
  }
  const api = createClient({ token: TOKEN, webid: WEBID, useruuid: USERUUID });
  const {
    createCanvas, listProjects, getProjectDetailBySpace, addTextNode,
    createTextGeneration, createAudioGeneration, createImageGeneration, createVideoGeneration,
    getAccount, uploadFile, getProgress, waitForTask,
  } = api;

  const [cmd, ...rest] = process.argv.slice(2);
  const flag = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const flagAll = (name) => {
    const out = [];
    for (let i = 0; i < rest.length - 1; i++) if (rest[i] === name) out.push(rest[i + 1]);
    return out;
  };

  try {
    if (cmd === 'canvas') {
      const name = rest[0] || 'API画布';
      const data = await createCanvas(name);
      console.log(JSON.stringify({ id: data.projectMeta.id, uuid: data.projectMeta.uuid, name: data.projectMeta.name, spaceId: data.projectMeta.projectSpaceId }, null, 2));
    } else if (cmd === 'list') {
      const data = await listProjects({ pageSize: 10 });
      for (const p of data.projectMetaList || []) {
        console.log(`${p.uuid}  ${p.name}  (id=${p.id}, space=${p.projectSpaceId}, updated=${new Date(p.updatedAtMs).toISOString()})`);
      }
    } else if (cmd === 'add-node') {
      const project = flag('--project');
      if (!project) throw new Error('用法: add-node --project <uuid> [--name 名字] [--prompt "..."] [--x 900 --y 480]');
      const nodeKey = await addTextNode({
        projectId: project,
        name: flag('--name') || 'API文本节点',
        prompt: flag('--prompt') || '',
        x: Number(flag('--x') || 468),
        y: Number(flag('--y') || 480),
      });
      console.log(`已添加文本节点: ${nodeKey}（刷新画布页面可见）`);
    } else if (cmd === 'detail') {
      const space = flag('--space');
      if (!space) throw new Error('用法: detail --space <spaceId>');
      const data = await getProjectDetailBySpace(space);
      const pd = data.projectDetail || {};
      console.log(`项目: ${pd.projectMeta && pd.projectMeta.name} (${pd.projectMeta && pd.projectMeta.uuid})`);
      for (const n of pd.nodeList || []) {
        const d = JSON.parse(n.data || '{}');
        console.log(`  ${n.nodeKey}  ${n.name}  pos=(${n.position.positionX},${n.position.positionY})  prompt=${(d.params && d.params.prompt) || ''}`);
      }
    } else if (cmd === 'gen') {
      const prompt = flag('--prompt');
      if (!prompt) throw new Error('用法: gen --prompt "..." [--model <id>] [--project <uuid>]');
      const data = await createTextGeneration({ prompt, projectId: flag('--project'), model: flag('--model') || 'aurora-3-prime' });
      console.log(`taskId: ${data.taskId}, 等待结果...`);
      const result = await waitForTask(data.taskId);
      console.log(JSON.stringify(result, null, 2));
    } else if (cmd === 'whoami') {
      const a = await getAccount();
      const power = a.attr || {};
      console.log(`用户: ${a.name || '未命名'} (userId=${a.userId})`);
      console.log(`UUID: ${a.ownerUuid}`);
      console.log(`会员: ${a.accountLevelName || '无'} ${a.effective ? `有效至 ${a.endTime}` : '(已失效)'}`);
      console.log(`积分: 可用 ${power.usablePower ?? '?'} / 总量 ${power.totalPower ?? '?'} / 已用 ${power.usedPower ?? '?'} (并发任务上限 ${power.taskCanSubmit ?? '?'})`);
      console.log(`空间: 已用 ${((power.usedSpace || 0) / 1073741824).toFixed(2)}GB / 总量 ${((power.totalSpace || 0) / 1073741824).toFixed(0)}GB`);
      console.log(`上传用环境变量: LIBLIB_USERUUID=${a.ownerUuid}`);
    } else if (cmd === 'models') {
      for (const [type, list] of Object.entries(MODELS)) {
        console.log(`[${type}]`);
        for (const m of list) console.log(`  ${m.id}  (${m.power}power起)  ${m.label}`);
      }
    } else if (cmd === 'audio') {
      const prompt = flag('--prompt');
      if (!prompt) throw new Error('用法: audio --prompt "..." [--model <id>] [--ref <路径|URL>...] [--project <uuid>]');
      const data = await createAudioGeneration({ prompt, projectId: flag('--project'), model: flag('--model') || 'seed-audio-1.0', refs: flagAll('--ref') });
      console.log(`taskId: ${data.taskId}, 等待音频生成...`);
      const result = await waitForTask(data.taskId, { timeoutMs: 180000 });
      for (const a of result.audios || []) console.log(a.previewPath);
    } else if (cmd === 'image') {
      const prompt = flag('--prompt');
      if (!prompt) throw new Error('用法: image --prompt "..." [--model <id>] [--ref <路径|URL>...] [--ratio 16:9] [--quality medium] [--resolution 2K]');
      const data = await createImageGeneration({
        prompt, projectId: flag('--project'), model: flag('--model') || 'qwen-edit', refs: flagAll('--ref'),
        ratio: flag('--ratio') || '16:9',
        quality: flag('--quality') || 'medium',
        resolution: flag('--resolution') || '2K',
      });
      console.log(`taskId: ${data.taskId} (预扣 ${data.power} power), 等待图片生成...`);
      const result = await waitForTask(data.taskId, { timeoutMs: 180000 });
      for (const img of result.images || []) console.log(img.previewPath || img.url || JSON.stringify(img));
    } else if (cmd === 'video') {
      const prompt = flag('--prompt');
      if (!prompt) throw new Error('用法: video --prompt "..." [--model <id>] [--ref <路径|URL>...] [--ratio 16:9] [--resolution 720P] [--duration 2]');
      const data = await createVideoGeneration({
        prompt, projectId: flag('--project'), model: flag('--model') || 'wanx3.0', refs: flagAll('--ref'),
        ratio: flag('--ratio') || '16:9',
        resolution: flag('--resolution') || '720P',
        duration: Number(flag('--duration') || 2),
      });
      console.log(`taskId: ${data.taskId} (预扣 ${data.power} power), 等待视频生成（较慢）...`);
      const result = await waitForTask(data.taskId, { timeoutMs: 600000, intervalMs: 8000 });
      for (const v of result.videos || []) console.log(v.previewPath || v.url || JSON.stringify(v));
    } else if (cmd === 'upload') {
      const file = flag('--file');
      if (!file) throw new Error('用法: upload --file <本地路径>（需环境变量 LIBLIB_USERUUID）');
      const r = await uploadFile({ filePath: file });
      console.log(r.cdnUrl);
    } else if (cmd === 'progress') {
      const task = flag('--task');
      if (!task) throw new Error('用法: progress --task <taskId>');
      console.log(JSON.stringify(await getProgress([task]), null, 2));
    } else {
      console.log('子命令: whoami | models | canvas [名称] | list | detail --space <id> | add-node --project <uuid> | gen --prompt "..." [--model] | audio --prompt "..." [--model --ref ...] | image --prompt "..." [--model --ref ...] | video --prompt "..." [--model --ref ...] | upload --file <路径> | progress --task <id>');
    }
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }
}
