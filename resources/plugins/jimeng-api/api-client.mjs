#!/usr/bin/env node
/**
 * 即梦（jimeng.jianying.com / dreamina.capcut.com）零依赖 API 客户端（Node 18+，内置 fetch）
 *
 * 移植自 github.com/iptag/jimeng-api（GPL-3.0，2026-07 归档）的 TypeScript 实现，
 * 2026-09-30 已用真实账号实测：账号信息、积分、文生图、图生图。
 *
 * 认证: 仅需浏览器 cookie 中的 sessionid（服务端按 cookie 鉴权）
 *   - 请求头 Sign = md5(`9e2c|${uri.slice(-7)}|7|8.4.0|${deviceTime}||11ac`)（固定盐，无 msToken/a_bogus）
 *   - commerce 接口不带默认 query 参数且需正确 Referer
 *
 * 用法（编程）: createClient({ sessionid, onLog })
 * 用法（CLI）:  JIMENG_SESSIONID=xxx node api-client.mjs <whoami|credit|receive|models|gen|compose|video|history>
 */
import crypto from 'node:crypto';

// ---------- 常量（来自 iptag/jimeng-api src/api/consts） ----------
const PLATFORM_CODE = '7';
const VERSION_CODE = '8.4.0';
const WEB_VERSION = '7.5.0';
const DA_VERSION = '3.3.28'; // 线上 2026-09 当前值（归档源码为 3.3.9）
const DRAFT_VERSION = '3.3.9';
const DRAFT_MIN_VERSION = '3.0.2';

const BASE_URL_CN = 'https://jimeng.jianying.com';
const AID_CN = 513695;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

/** 图片模型（用户名 → 内部 model_req_key，国内站） */
export const IMAGE_MODELS = {
  'jimeng-5.0': 'high_aes_general_v50',
  'jimeng-4.6': 'high_aes_general_v42',
  'jimeng-4.5': 'high_aes_general_v40l',
  'jimeng-4.1': 'high_aes_general_v41',
  'jimeng-4.0': 'high_aes_general_v40',
  'jimeng-3.1': 'high_aes_general_v30l_art_fangzhou:general_v3.0_18b',
  'jimeng-3.0': 'high_aes_general_v30l:general_v3.0_18b',
};

/**
 * 视频模型（用户名 → { key, benefit }）。
 * 2026-09-30 经 /mweb/v1/video_generate/get_common_config (scene=video_generate) 实测拉取：
 * 旧 1.0~3.5 系列模型已全部下线（ret=2061 模型已不可用），现行为 Seedance 2.0/2.5 + 第三方模型。
 */
export const VIDEO_MODELS = {
  'seedance-2.5': { key: 'dreamina_seedance_45_pro', benefit: 'seedance_25_720p_output' },
  'seedance-2.5-draft': { key: 'dreamina_seedance_45_pro_draft', benefit: 'seedance_25_draft_480p_output' },
  'seedance-2.0': { key: 'dreamina_seedance_40_pro', benefit: 'dreamina_video_seedance_20_pro' },
  'seedance-2.0-fast': { key: 'dreamina_seedance_40', benefit: 'dreamina_seedance_20_fast' },
  'seedance-2.0-vip': { key: 'dreamina_seedance_40_pro_vision', benefit: 'seedance_20_pro_720p_output' },
  'seedance-2.0-fast-vip': { key: 'dreamina_seedance_40_vision', benefit: 'seedance_20_fast_720p_output' },
  'seedance-2.0-mini': { key: 'dreamina_seedance_40_mini', benefit: 'seedance_20_mini_720p_output' },
  'seedance-1.0-pro': { key: 'dreamina_ic_generate_video_model_vgfm_3.0_pro', benefit: 'basic_video_operation_vgfm_v_three_pro' },
  'seedance-1.0-fast': { key: 'dreamina_ic_generate_video_model_vgfm_3.0_fast', benefit: 'basic_video_operation_vgfm_v_three' },
  'minimax-h3': { key: 'dreamina_minimax_h3', benefit: 'minimax_h3_768p_output' },
  'happyhorse-1.1': { key: 'dreamina_happyhorse_v1_1', benefit: 'happyhorse_11_720p_output' },
  'wan-3.0': { key: 'dreamina_wan_30', benefit: 'wan_30_1080p_output' },
  // 兼容 iptag/jimeng-api 时代的旧名（仅 seedance 系仍有效）
  'jimeng-video-seedance-2.0': { key: 'dreamina_seedance_40_pro', benefit: 'dreamina_video_seedance_20_pro' },
  'jimeng-video-seedance-2.0-fast': { key: 'dreamina_seedance_40', benefit: 'dreamina_seedance_20_fast' },
};

/** 分辨率 × 比例 → 宽高 + image_ratio 码表 */
export const RESOLUTIONS = {
  '1k': {
    '1:1': [1024, 1024, 1], '4:3': [768, 1024, 4], '3:4': [1024, 768, 2], '16:9': [1024, 576, 3],
    '9:16': [576, 1024, 5], '3:2': [1024, 682, 7], '2:3': [682, 1024, 6], '21:9': [1195, 512, 8],
  },
  '2k': {
    '1:1': [2048, 2048, 1], '4:3': [2304, 1728, 4], '3:4': [1728, 2304, 2], '16:9': [2560, 1440, 3],
    '9:16': [1440, 2560, 5], '3:2': [2496, 1664, 7], '2:3': [1664, 2496, 6], '21:9': [3024, 1296, 8],
  },
  '4k': {
    '1:1': [4096, 4096, 101], '4:3': [4608, 3456, 104], '3:4': [3456, 4608, 102], '16:9': [5120, 2880, 103],
    '9:16': [2880, 5120, 105], '3:2': [4992, 3328, 107], '2:3': [3328, 4992, 106], '21:9': [6048, 2592, 108],
  },
};

const STATUS_NAMES = { 20: 'PROCESSING', 10: 'SUCCESS', 30: 'FAILED', 42: 'POST_PROCESSING', 45: 'FINALIZING', 50: 'COMPLETED' };
const IMAGE_INFO_SCENES = [
  { scene: 'smart_crop', width: 360, height: 360, uniq_key: 'smart_crop-w:360-h:360', format: 'webp' },
  { scene: 'smart_crop', width: 480, height: 480, uniq_key: 'smart_crop-w:480-h:480', format: 'webp' },
  { scene: 'smart_crop', width: 720, height: 720, uniq_key: 'smart_crop-w:720-h:720', format: 'webp' },
  { scene: 'smart_crop', width: 720, height: 480, uniq_key: 'smart_crop-w:720-h:480', format: 'webp' },
  { scene: 'normal', width: 2400, height: 2400, uniq_key: '2400', format: 'webp' },
  { scene: 'normal', width: 1080, height: 1080, uniq_key: '1080', format: 'webp' },
  { scene: 'normal', width: 720, height: 720, uniq_key: '720', format: 'webp' },
  { scene: 'normal', width: 480, height: 480, uniq_key: '480', format: 'webp' },
  { scene: 'normal', width: 360, height: 360, uniq_key: '360', format: 'webp' },
];

// ---------- 小工具 ----------
const uuid = () => crypto.randomUUID();
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** buffer → 8 位小写 hex CRC32（上传校验用） */
export function crc32hex(buffer) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  const bytes = new Uint8Array(buffer);
  c = 0 ^ -1;
  for (let i = 0; i < bytes.length; i++) c = (c >>> 8) ^ table[(c ^ bytes[i]) & 0xff];
  return ((c ^ -1) >>> 0).toString(16).padStart(8, '0');
}

/**
 * AWS4-HMAC-SHA256 签名（ImageX 上传凭证用，移植自 jimeng-api aws-signature.ts）
 * 注意：canonical query 不做 URL 编码（与源码一致，参数均为简单值）
 */
export function aws4Signature(method, url, headers, accessKeyId, secretAccessKey, sessionToken, payload = '', region = 'cn-north-1', service = 'imagex') {
  const u = new URL(url);
  const timestamp = headers['x-amz-date'];
  const date = timestamp.slice(0, 8);
  const queryParams = [...u.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonicalQuery = queryParams.map(([k, v]) => `${k}=${v}`).join('&');

  const headersToSign = { 'x-amz-date': timestamp };
  if (sessionToken) headersToSign['x-amz-security-token'] = sessionToken;
  let payloadHash = crypto.createHash('sha256').update('').digest('hex');
  if (method.toUpperCase() === 'POST' && payload) {
    payloadHash = crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
    headersToSign['x-amz-content-sha256'] = payloadHash;
  }
  const signedHeaders = Object.keys(headersToSign).sort().join(';');
  const canonicalHeaders = Object.keys(headersToSign)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => `${k}:${headersToSign[k].trim()}\n`)
    .join('');

  const canonicalRequest = [method.toUpperCase(), u.pathname || '/', canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', timestamp, scope, crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex')].join('\n');
  const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest();
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

export class JimengApiError extends Error {
  constructor(message, code = 'API_ERROR', status) {
    super(message);
    this.name = 'JimengApiError';
    this.code = code;
    if (status != null) this.status = status;
  }
}

// ---------- 客户端 ----------
/**
 * @param {object} opts
 * @param {string} opts.sessionid  浏览器 cookie sessionid（国际站可带 us-/hk-/jp-/sg- 前缀，未实测）
 * @param {(msg: string) => void} [opts.onLog]
 * @param {object} [opts.urls] 端点覆盖（测试注入用）{ baseUrl, commerceUrl, imagexUrl }
 */
export function createClient({ sessionid, onLog = () => {}, urls = {} } = {}) {
  if (!sessionid) throw new JimengApiError('缺少 sessionid', 'NO_CREDENTIALS');

  const rawToken = String(sessionid).trim();
  const lower = rawToken.toLowerCase();
  const regionInfo = {
    isUS: lower.startsWith('us-'), isHK: lower.startsWith('hk-'), isJP: lower.startsWith('jp-'), isSG: lower.startsWith('sg-'),
  };
  regionInfo.isInternational = regionInfo.isUS || regionInfo.isHK || regionInfo.isJP || regionInfo.isSG;
  regionInfo.isCN = !regionInfo.isInternational;
  const token = regionInfo.isInternational ? rawToken.slice(3) : rawToken;

  const baseUrl = urls.baseUrl || (regionInfo.isUS ? 'https://dreamina-api.us.capcut.com'
    : regionInfo.isInternational ? 'https://mweb-api-sg.capcut.com'
      : BASE_URL_CN);
  const commerceUrl = urls.commerceUrl || (regionInfo.isUS ? 'https://commerce.us.capcut.com'
    : regionInfo.isInternational ? 'https://commerce-api-sg.capcut.com'
      : BASE_URL_CN);
  const aid = regionInfo.isInternational ? 513641 : AID_CN;
  const region = regionInfo.isUS ? 'US' : regionInfo.isHK ? 'HK' : regionInfo.isJP ? 'JP' : regionInfo.isSG ? 'SG' : 'cn';
  const origin = new URL(baseUrl).origin;

  // 伪装身份（每次实例化固定，与浏览器会话一致）
  const webId = String(7000000000000000000n + BigInt(Math.floor(Math.random() * 999999999999999999)));
  const userId = crypto.randomUUID().replace(/-/g, '');

  const cookie = [
    `_tea_web_id=${webId}`,
    'is_staff_user=false',
    `sid_guard=${token}%7C${Math.floor(Date.now() / 1000)}%7C5184000%7CMon%2C+03-Feb-2025+08%3A17%3A09+GMT`,
    `uid_tt=${userId}`,
    `uid_tt_ss=${userId}`,
    `sid_tt=${token}`,
    `sessionid=${token}`,
    `sessionid_ss=${token}`,
  ].join('; ');

  /**
   * 请求即梦 mweb/commerce/passport 接口（带重试与统一错误检查）
   * @param {string} uri 如 /mweb/v1/aigc_draft/generate
   */
  async function request(method, uri, { data, params = {}, headers = {}, noDefaultParams = false } = {}) {
    const deviceTime = Math.floor(Date.now() / 1000);
    const sign = md5(`9e2c|${uri.slice(-7)}|${PLATFORM_CODE}|${VERSION_CODE}|${deviceTime}||11ac`);
    const qs = new URLSearchParams(noDefaultParams ? {} : {
      aid: String(aid),
      device_platform: 'web',
      region,
      ...(regionInfo.isInternational ? {} : { webId }),
      da_version: DA_VERSION,
      os: 'windows',
      web_component_open_flag: '1',
      web_version: WEB_VERSION,
      aigc_features: 'app_lip_sync',
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    const root = uri.startsWith('/commerce/') ? commerceUrl : baseUrl;
    const url = `${root}${uri}${qs.size ? `?${qs}` : ''}`;

    const maxRetries = 3;
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) await sleep(5000);
      let res;
      try {
        res = await fetch(url, {
          method: method.toUpperCase(),
          headers: {
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Cache-Control': 'no-cache',
            Appvr: VERSION_CODE,
            Pragma: 'no-cache',
            Pf: PLATFORM_CODE,
            'User-Agent': UA,
            ...(data !== undefined ? { 'content-type': 'application/json' } : {}),
            Cookie: cookie,
            Origin: origin,
            Referer: origin,
            'App-Sdk-Version': '48.0.0',
            Appid: String(aid),
            'Device-Time': String(deviceTime),
            Lan: regionInfo.isUS ? 'en' : regionInfo.isJP ? 'ja' : regionInfo.isInternational ? 'en' : 'zh-Hans',
            Loc: regionInfo.isUS ? 'us' : regionInfo.isJP ? 'jp' : regionInfo.isHK ? 'hk' : regionInfo.isSG ? 'sg' : 'cn',
            Sign: sign,
            'Sign-Ver': '1',
            ...headers,
          },
          body: data !== undefined ? JSON.stringify(data) : undefined,
          signal: AbortSignal.timeout(45000),
        });
      } catch (err) {
        lastError = err;
        continue; // 网络/超时错误重试
      }
      if (res.status >= 400 && attempt < maxRetries) { lastError = new JimengApiError(`HTTP ${res.status}`, 'HTTP_ERROR', res.status); continue; }
      let body;
      const text = await res.text();
      try { body = JSON.parse(text); } catch { throw new JimengApiError(`响应非 JSON: ${text.slice(0, 200)}`, 'BAD_RESPONSE', res.status); }
      return checkResult(body, res.status);
    }
    throw lastError || new JimengApiError('请求失败', 'REQUEST_FAILED');
  }

  /** ret=0 → data；否则抛错（登录失效常见 ret 见 errmsg） */
  function checkResult(body, httpStatus) {
    if (body == null || typeof body !== 'object') return body;
    const ret = body.ret;
    if (!Number.isFinite(Number(ret))) return body; // passport 等接口无 ret，返回整体
    if (String(ret) === '0') return body.data !== undefined ? body.data : body;
    const msg = body.errmsg || body.message || JSON.stringify(body).slice(0, 300);
    throw new JimengApiError(`即梦 API 错误 ret=${ret}: ${msg}`, `RET_${ret}`, httpStatus);
  }

  // ---------- 模型动态发现 ----------

  /**
   * 拉取线上当前可用的视频模型列表（模型下线/上新时以此为准，无需改代码）。
   * 来源: /mweb/v1/video_generate/get_common_config (scene=video_generate)
   */
  async function fetchVideoModels() {
    const data = await request('POST', '/mweb/v1/video_generate/get_common_config', {
      data: { scene: 'video_generate', params: {} },
      headers: { Referer: videoReferer },
    });
    return (data?.model_list || []).map((m) => ({
      key: m.model_req_key,
      name: m.model_name,
      benefit: m.commercial_config?.default?.benefit_type,
      status: m.model_status,
    }));
  }

  // ---------- 账号 / 积分 ----------

  /** 账号信息（passport，无消耗） */
  async function getAccountInfo() {
    const data = await request('POST', '/passport/account/info/v2', { data: {}, params: { account_sdk_source: 'web' } });
    return data?.data || data; // 无 ret 接口返回整体，data 字段为用户信息
  }

  /** 积分信息（无消耗）。注意：无默认 query 参数 + Referer 指向 image/generate，否则 ret=1014 */
  async function getCredit() {
    const data = await request('POST', '/commerce/v1/benefits/user_credit', {
      data: {},
      noDefaultParams: true,
      headers: { Referer: regionInfo.isCN ? 'https://jimeng.jianying.com/ai-tool/image/generate' : origin },
    });
    const c = data?.credit || {};
    return {
      giftCredit: c.gift_credit ?? 0,
      purchaseCredit: c.purchase_credit ?? 0,
      vipCredit: c.vip_credit ?? 0,
      totalCredit: (c.gift_credit ?? 0) + (c.purchase_credit ?? 0) + (c.vip_credit ?? 0),
    };
  }

  /** 收取今日积分（每天一次） */
  async function receiveCredit() {
    const data = await request('POST', '/commerce/v1/benefits/credit_receive', {
      data: { time_zone: 'Asia/Shanghai' },
      headers: { Referer: regionInfo.isCN ? 'https://jimeng.jianying.com/ai-tool/home' : origin },
    });
    return data?.receive_quota ?? data;
  }

  /** 生成前确保有积分：totalCredit<=0 时自动收取一次 */
  async function ensureCredit() {
    const credit = await getCredit();
    if (credit.totalCredit > 0) return credit;
    onLog(`积分为 0，尝试收取今日积分`);
    try {
      await receiveCredit();
      return await getCredit();
    } catch (err) {
      throw new JimengApiError(`积分不足且自动收取失败（${err.message}），请到即梦官网手动领取`, 'NO_CREDIT');
    }
  }

  // ---------- 图片上传（ImageX 三步上传，图生图/图生视频用） ----------

  /**
   * 上传图片 buffer 到 ImageX。
   * 流程: get_upload_token（拿临时 STS）→ ApplyImageUpload（拿上传地址）→ PUT 数据 → CommitImageUpload
   * @returns {{ uri, width, height, format }}
   */
  async function uploadImage(buffer, { isVideoCover = false } = {}) {
    const tokenResult = await request('POST', '/mweb/v1/get_upload_token', { data: { scene: isVideoCover ? 3 : 2 } });
    const { access_key_id, secret_access_key, session_token } = tokenResult;
    if (!access_key_id || !secret_access_key || !session_token) throw new JimengApiError('获取上传令牌失败', 'UPLOAD_TOKEN_FAILED');
    const serviceId = regionInfo.isInternational ? (tokenResult.space_name || 'wopfjsm1ax') : (tokenResult.service_id || 'tb4s082cfz');
    const imagexHost = urls.imagexUrl || (regionInfo.isUS ? 'https://imagex16-normal-us-ttp.capcutapi.us'
      : regionInfo.isInternational ? 'https://imagex-normal-sg.capcutapi.com'
        : 'https://imagex.bytedanceapi.com');
    const awsRegion = regionInfo.isUS ? 'us-east-1' : regionInfo.isInternational ? 'ap-southeast-1' : 'cn-north-1';
    const referer = `${origin}/ai-tool/generate`;

    const fileSize = buffer.byteLength;
    const crc = crc32hex(buffer);
    const now = new Date().toISOString().replace(/[:\-]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const randomStr = Math.random().toString(36).slice(2, 12);
    const applyUrl = `${imagexHost}/?Action=ApplyImageUpload&Version=2018-08-01&ServiceId=${serviceId}&FileSize=${fileSize}&s=${randomStr}${regionInfo.isInternational ? '&device_platform=web' : ''}`;
    const applyAuth = aws4Signature('GET', applyUrl, { 'x-amz-date': now, 'x-amz-security-token': session_token }, access_key_id, secret_access_key, session_token, '', awsRegion);

    const applyRes = await fetch(applyUrl, {
      headers: {
        accept: '*/*',
        authorization: applyAuth,
        origin,
        referer,
        'user-agent': UA,
        'x-amz-date': now,
        'x-amz-security-token': session_token,
      },
      signal: AbortSignal.timeout(30000),
    });
    const applyResult = await applyRes.json().catch(() => ({}));
    if (!applyRes.ok || applyResult?.ResponseMetadata?.Error) {
      throw new JimengApiError(`申请上传权限失败: ${JSON.stringify(applyResult?.ResponseMetadata?.Error || applyResult).slice(0, 200)}`, 'APPLY_UPLOAD_FAILED', applyRes.status);
    }
    const uploadAddress = applyResult?.Result?.UploadAddress;
    const storeInfo = uploadAddress?.StoreInfos?.[0];
    if (!storeInfo || !uploadAddress?.UploadHosts?.[0]) throw new JimengApiError(`获取上传地址失败: ${JSON.stringify(applyResult).slice(0, 200)}`, 'APPLY_UPLOAD_FAILED');

    const uploadHost0 = uploadAddress.UploadHosts[0];
    const uploadUrl = `${uploadHost0.startsWith('http') ? '' : 'https://'}${uploadHost0}/upload/v1/${storeInfo.StoreUri}`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: storeInfo.Auth,
        'Content-CRC32': crc,
        'Content-Type': 'application/octet-stream',
        Origin: origin,
        Referer: referer,
        'User-Agent': UA,
      },
      body: buffer,
      signal: AbortSignal.timeout(60000),
    });
    if (!uploadRes.ok) throw new JimengApiError(`图片上传失败: HTTP ${uploadRes.status}`, 'UPLOAD_FAILED', uploadRes.status);

    const commitUrl = `${imagexHost}/?Action=CommitImageUpload&Version=2018-08-01&ServiceId=${serviceId}`;
    const commitTs = new Date().toISOString().replace(/[:\-]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const commitPayload = JSON.stringify({ SessionKey: uploadAddress.SessionKey });
    const payloadHash = crypto.createHash('sha256').update(commitPayload, 'utf8').digest('hex');
    const commitAuth = aws4Signature('POST', commitUrl, {
      'x-amz-date': commitTs, 'x-amz-security-token': session_token, 'x-amz-content-sha256': payloadHash,
    }, access_key_id, secret_access_key, session_token, commitPayload, awsRegion);

    const commitRes = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        accept: '*/*',
        authorization: commitAuth,
        'content-type': 'application/json',
        origin,
        referer,
        'user-agent': UA,
        'x-amz-date': commitTs,
        'x-amz-security-token': session_token,
        'x-amz-content-sha256': payloadHash,
      },
      body: commitPayload,
      signal: AbortSignal.timeout(30000),
    });
    const commitResult = await commitRes.json().catch(() => ({}));
    const up = commitResult?.Result?.Results?.[0];
    if (!commitRes.ok || commitResult?.ResponseMetadata?.Error || !up) {
      throw new JimengApiError(`提交上传失败: ${JSON.stringify(commitResult?.ResponseMetadata?.Error || commitResult).slice(0, 200)}`, 'COMMIT_UPLOAD_FAILED', commitRes.status);
    }
    if (up.UriStatus !== 2000) throw new JimengApiError(`图片上传状态异常 UriStatus=${up.UriStatus}`, 'UPLOAD_STATUS');
    const plugin = commitResult?.Result?.PluginResult?.[0] || {};
    return { uri: up.Uri, width: plugin.ImageWidth || 0, height: plugin.ImageHeight || 0, format: plugin.ImageFormat || '' };
  }

  /** 下载 URL 或解析 dataURL 后上传；http(s) URL 直接透传给上游也可用，但上传可拿到宽高 */
  async function uploadImageFromRef(ref) {
    if (typeof ref === 'object' && ref.buffer) return uploadImage(ref.buffer, ref);
    const s = String(ref);
    if (s.startsWith('data:')) {
      const m = s.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) throw new JimengApiError('dataURL 格式错误', 'BAD_DATA_URL');
      return uploadImage(Buffer.from(m[2], 'base64'));
    }
    const res = await fetch(s, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new JimengApiError(`下载图片失败: HTTP ${res.status}`, 'DOWNLOAD_FAILED', res.status);
    return uploadImage(Buffer.from(await res.arrayBuffer()));
  }

  // ---------- payload 构建（移植 payload-builder.ts） ----------

  function resolveResolution(userModel, resolution = '2k', ratio = '1:1') {
    const group = RESOLUTIONS[resolution];
    if (!group) throw new JimengApiError(`不支持的分辨率 "${resolution}"，支持: ${Object.keys(RESOLUTIONS).join('/')}`, 'BAD_RESOLUTION', 400);
    const cfg = group[ratio];
    if (!cfg) throw new JimengApiError(`分辨率 "${resolution}" 下不支持比例 "${ratio}"，支持: ${Object.keys(group).join('/')}`, 'BAD_RATIO', 400);
    return { width: cfg[0], height: cfg[1], imageRatio: cfg[2], resolutionType: resolution };
  }

  function buildCoreParam({ userModel, model, prompt, negativePrompt, seed, sampleStrength = 0.5, resolution, intelligentRatio = false, mode = 'text2img', imageCount = 0 }) {
    const effectiveIntelligentRatio = ['jimeng-4.0', 'jimeng-4.1', 'jimeng-4.5', 'jimeng-4.6', 'jimeng-5.0'].includes(userModel) ? intelligentRatio : false;
    const promptPrefix = mode === 'img2img' ? '#'.repeat(imageCount * 2) : '';
    const coreParam = {
      type: '',
      id: uuid(),
      model,
      prompt: `${promptPrefix}${prompt}`,
      sample_strength: sampleStrength,
      large_image_info: {
        type: '', id: uuid(), min_version: DRAFT_MIN_VERSION,
        height: resolution.height, width: resolution.width, resolution_type: resolution.resolutionType,
      },
      intelligent_ratio: effectiveIntelligentRatio,
    };
    // 图生图始终带 image_ratio；文生图仅在非智能比例时带
    if (mode === 'img2img' || !effectiveIntelligentRatio) coreParam.image_ratio = resolution.imageRatio;
    if (negativePrompt !== undefined) coreParam.negative_prompt = negativePrompt;
    if (seed !== undefined) coreParam.seed = seed;
    return coreParam;
  }

  function buildMetricsExtra({ model, submitId, scene, resolutionType, abilityList = [], isMultiImage = false }) {
    const sceneOption = {
      type: 'image',
      scene,
      modelReqKey: model,
      resolutionType,
      abilityList,
      reportParams: {
        enterSource: 'generate',
        vipSource: 'generate',
        extraVipFunctionKey: `${model}-${resolutionType}`,
        useVipFunctionDetailsReporterHoc: true,
      },
      ...(isMultiImage ? {} : { benefitCount: 4 }),
    };
    const metrics = {
      promptSource: 'custom',
      generateCount: 1,
      enterFrom: 'click',
      sceneOptions: JSON.stringify([sceneOption]),
      generateId: submitId,
      isRegenerate: false,
    };
    if (isMultiImage) Object.assign(metrics, { templateId: '', templateSource: '', lastRequestId: '', originRequestId: '' });
    return JSON.stringify(metrics);
  }

  function buildDraftContent({ componentId, generateType, coreParam, abilityList, promptPlaceholderInfoList, posteditParam, imageCount = 0 }) {
    const isBlend = generateType === 'blend';
    const abilities = { type: '', id: uuid() };
    if (!isBlend) {
      abilities.generate = {
        type: '', id: uuid(), core_param: coreParam,
        gen_option: { type: '', id: uuid(), generate_all: false },
      };
    } else {
      abilities.blend = {
        type: '', id: uuid(),
        ...(imageCount >= 2 ? { min_version: '3.2.9' } : {}),
        min_features: [],
        core_param: coreParam,
        ability_list: abilityList,
        prompt_placeholder_info_list: promptPlaceholderInfoList,
        postedit_param: posteditParam,
      };
      abilities.gen_option = { type: '', id: uuid(), generate_all: false };
    }
    return JSON.stringify({
      type: 'draft',
      id: uuid(),
      min_version: isBlend ? '3.2.9' : DRAFT_MIN_VERSION,
      min_features: [],
      is_from_tsn: true,
      version: DRAFT_VERSION,
      main_component_id: componentId,
      component_list: [{
        type: 'image_base_component',
        id: componentId,
        min_version: DRAFT_MIN_VERSION,
        aigc_mode: 'workbench',
        metadata: {
          type: '', id: uuid(), created_platform: 3, created_platform_version: '',
          created_time_in_ms: String(Date.now()), created_did: '',
        },
        generate_type: generateType,
        abilities,
      }],
    });
  }

  const imageReferer = regionInfo.isCN ? 'https://jimeng.jianying.com/ai-tool/generate?type=image' : `${origin}/ai-tool/generate?type=image`;
  const videoReferer = regionInfo.isCN ? 'https://jimeng.jianying.com/ai-tool/generate?type=video' : `${origin}/ai-tool/generate?type=video`;

  // ---------- 任务轮询 ----------

  /** 查询历史记录（生成结果） */
  async function getHistory(historyId) {
    const data = await request('POST', '/mweb/v1/get_history_by_ids', {
      data: {
        history_ids: [historyId],
        image_info: { width: 2048, height: 2048, format: 'webp', image_scene_list: IMAGE_INFO_SCENES },
      },
    });
    return data?.[historyId] || null;
  }

  /**
   * 智能轮询直至任务完成（移植 smart-poller.ts 简化版）
   * 状态: 20 处理中 42/45 后处理 10/50 成功 30 失败
   */
  async function waitForHistory(historyId, { type = 'image', expectedCount = 4, intervalMs = 10000, timeoutMs = 1800000, onProgress = () => {} } = {}) {
    const start = Date.now();
    let lastItemCount = 0;
    let stableRounds = 0;
    for (let i = 1; ; i++) {
      let taskInfo = null;
      try {
        taskInfo = await getHistory(historyId);
      } catch (err) {
        onLog(`轮询 ${i} 出错（继续）: ${err.message}`);
      }
      if (taskInfo) {
        const status = taskInfo.status;
        const items = taskInfo.item_list || [];
        if (items.length === lastItemCount) stableRounds++;
        else { stableRounds = 0; lastItemCount = items.length; }
        onProgress({ poll: i, status, statusName: STATUS_NAMES[status] || `UNKNOWN(${status})`, itemCount: items.length, elapsedMs: Date.now() - start });

        if (status === 30) {
          if (items.length > 0) return taskInfo; // 部分成功也返回
          throw new JimengApiError(`${type} 生成失败 fail_code=${taskInfo.fail_code ?? ''}（history ${historyId}）`, 'GENERATION_FAILED');
        }
        if ((status === 10 || status === 50) && items.length > 0) return taskInfo;
        if (stableRounds >= 5 && items.length > 0) return taskInfo; // 数量稳定
        if (Date.now() - start >= timeoutMs) {
          if (items.length > 0) return taskInfo;
          throw new JimengApiError(`${type} 生成超时（${Math.round((Date.now() - start) / 1000)}s，history ${historyId}）`, 'TIMEOUT');
        }
      } else if (Date.now() - start >= timeoutMs) {
        throw new JimengApiError(`${type} 生成超时且无记录（history ${historyId}）`, 'TIMEOUT');
      }
      await sleep(intervalMs);
    }
  }

  // ---------- 结果提取 ----------

  function extractImageUrls(itemList) {
    return (itemList || [])
      .map((item) => item?.image?.large_images?.[0]?.image_url?.replace(/\\u0026/g, '&'))
      .filter(Boolean);
  }

  function extractVideoUrl(item) {
    return item?.common_attr?.transcoded_video?.origin?.video_url
      || item?.video?.transcoded_video?.origin?.video_url
      || item?.video?.play_url
      || item?.video?.download_url
      || item?.video?.url
      || null;
  }

  /** 通过 get_local_item_list 取高码率无水印视频（失败返回 null，回退预览 URL） */
  async function fetchHighQualityVideoUrl(itemId) {
    try {
      const result = await request('POST', '/mweb/v1/get_local_item_list', {
        data: {
          item_id_list: [itemId],
          pack_item_opt: { scene: 1, need_data_integrity: true },
          is_for_video_download: true,
        },
      });
      const item = (result.item_list || result.local_item_list || [])[0];
      const videoModelStr = item?.video?.video_model;
      if (typeof videoModelStr === 'string') {
        try {
          const videoList = JSON.parse(videoModelStr)?.video_list;
          for (const key of ['video_4', 'video_3', 'video_2', 'video_1']) {
            const b64 = videoList?.[key]?.main_url;
            if (b64) {
              const decoded = Buffer.from(b64, 'base64').toString('utf8');
              if (decoded.startsWith('http')) return decoded;
            }
          }
        } catch { /* video_model 解析失败走降级 */ }
      }
      const fallback = item && extractVideoUrl(item);
      if (fallback) return fallback;
      const m = JSON.stringify(result).match(/https:\/\/v[0-9]+-[^"\\]*\.(vlabvod|jimeng|dreamnia)\.com\/[^"\s\\]+/);
      if (m) return m[0];
      return null;
    } catch (err) {
      onLog(`获取高清视频 URL 失败（回退预览）: ${err.message}`);
      return null;
    }
  }

  // ---------- 生成接口 ----------

  /**
   * 文生图。返回 { historyId, urls, elapsedMs }
   * @param {object} opts { prompt, model, ratio='1:1', resolution='2k', sampleStrength=0.5, negativePrompt, intelligentRatio }
   */
  async function generateImages({ prompt, model = 'jimeng-4.5', ratio = '1:1', resolution = '2k', sampleStrength = 0.5, negativePrompt = '', intelligentRatio = false }) {
    const userModel = model;
    const internal = IMAGE_MODELS[userModel];
    if (!internal) throw new JimengApiError(`未知图片模型 ${model}，可用: ${Object.keys(IMAGE_MODELS).join(', ')}`, 'UNKNOWN_MODEL', 400);
    await ensureCredit();
    const res = resolveResolution(userModel, resolution, ratio);

    // jimeng-4.x 多图模式（prompt 含 连续/绘本/故事/N张）
    const isMulti = ['jimeng-4.0', 'jimeng-4.1', 'jimeng-4.5'].includes(userModel)
      && (/连续|绘本|故事/.test(prompt) || /\d+张/.test(prompt));
    const targetCount = isMulti ? (Number(prompt.match(/(\d+)张/)?.[1]) || 4) : 4;

    const componentId = uuid();
    const submitId = uuid();
    const coreParam = buildCoreParam({
      userModel, model: internal, prompt, negativePrompt,
      seed: Math.floor(Math.random() * 100000000) + 2500000000,
      sampleStrength, resolution: res, intelligentRatio, mode: 'text2img',
    });
    const metricsExtra = buildMetricsExtra({
      model: internal, submitId, scene: isMulti ? 'ImageMultiGenerate' : 'ImageBasicGenerate',
      resolutionType: res.resolutionType, isMultiImage: isMulti,
    });
    const draftContent = buildDraftContent({ componentId, generateType: 'generate', coreParam });
    const data = await request('POST', '/mweb/v1/aigc_draft/generate', {
      data: {
        extend: { root_model: internal },
        submit_id: submitId,
        metrics_extra: metricsExtra,
        draft_content: draftContent,
        http_common_info: { aid },
      },
      headers: { Referer: imageReferer },
    });
    const historyId = data?.aigc_data?.history_record_id;
    if (!historyId) throw new JimengApiError('提交成功但未返回 history_record_id', 'NO_HISTORY_ID');
    onLog(`文生图任务已提交 history=${historyId} model=${userModel} ${res.width}x${res.height}${isMulti ? ` 多图×${targetCount}` : ''}`);

    const start = Date.now();
    const taskInfo = await waitForHistory(historyId, { type: 'image', expectedCount: targetCount });
    const urls = extractImageUrls(taskInfo.item_list);
    if (urls.length === 0) throw new JimengApiError(`任务完成但未提取到图片 URL（status=${taskInfo.status}）`, 'NO_RESULT');
    return { historyId, urls, elapsedMs: Date.now() - start, status: taskInfo.status };
  }

  /**
   * 图生图（blend，1-10 张参考图）。images 为 URL / dataURL / {buffer} 数组。
   */
  async function generateImageComposition({ prompt, images, model = 'jimeng-4.5', ratio = '1:1', resolution = '2k', sampleStrength = 0.5, negativePrompt = '', intelligentRatio = false }) {
    if (!Array.isArray(images) || images.length === 0) throw new JimengApiError('图生图至少需要 1 张参考图', 'NO_INPUT_IMAGE', 400);
    if (images.length > 10) throw new JimengApiError('图生图最多支持 10 张参考图', 'TOO_MANY_IMAGES', 400);
    const userModel = model;
    const internal = IMAGE_MODELS[userModel];
    if (!internal) throw new JimengApiError(`未知图片模型 ${model}`, 'UNKNOWN_MODEL', 400);
    await ensureCredit();
    const res = resolveResolution(userModel, resolution, ratio);

    const uploaded = [];
    for (let i = 0; i < images.length; i++) {
      const up = await uploadImageFromRef(images[i]);
      uploaded.push(up);
      onLog(`参考图 ${i + 1}/${images.length} 上传成功: ${up.uri} (${up.width}x${up.height})`);
    }

    const componentId = uuid();
    const submitId = uuid();
    const coreParam = buildCoreParam({
      userModel, model: internal, prompt, negativePrompt,
      sampleStrength, resolution: res, intelligentRatio, mode: 'img2img', imageCount: uploaded.length,
    });
    const metricsExtra = buildMetricsExtra({
      model: internal, submitId, scene: 'ImageBasicGenerate', resolutionType: res.resolutionType,
      abilityList: uploaded.map(() => ({
        abilityName: 'byte_edit', strength: sampleStrength,
        source: { imageUrl: `blob:${origin}/${uuid()}` },
      })),
    });
    const abilityList = uploaded.map((up) => ({
      type: '', id: uuid(), name: 'byte_edit',
      image_uri_list: [up.uri],
      image_list: [{
        type: 'image', id: uuid(), source_from: 'upload', platform_type: 1, name: '',
        image_uri: up.uri, width: up.width, height: up.height, format: up.format, uri: up.uri,
      }],
      strength: sampleStrength,
    }));
    const draftContent = buildDraftContent({
      componentId, generateType: 'blend', coreParam, abilityList,
      promptPlaceholderInfoList: uploaded.map((_, index) => ({ type: '', id: uuid(), ability_index: index })),
      posteditParam: { type: '', id: uuid(), generate_type: 0 },
      imageCount: uploaded.length,
    });
    const data = await request('POST', '/mweb/v1/aigc_draft/generate', {
      data: {
        extend: { root_model: internal },
        submit_id: submitId,
        metrics_extra: metricsExtra,
        draft_content: draftContent,
        http_common_info: { aid },
      },
      headers: { Referer: imageReferer },
    });
    const historyId = data?.aigc_data?.history_record_id;
    if (!historyId) throw new JimengApiError('提交成功但未返回 history_record_id', 'NO_HISTORY_ID');
    onLog(`图生图任务已提交 history=${historyId} refs=${uploaded.length}`);

    const start = Date.now();
    const taskInfo = await waitForHistory(historyId, { type: 'image', expectedCount: 1 });
    const urls = extractImageUrls(taskInfo.item_list);
    if (urls.length === 0) throw new JimengApiError(`任务完成但未提取到图片 URL（status=${taskInfo.status}）`, 'NO_RESULT');
    return { historyId, urls, elapsedMs: Date.now() - start, status: taskInfo.status };
  }

  /**
   * 视频生成（文生视频 / 图生视频首尾帧模式）。
   * @param {object} opts { prompt, model, ratio='16:9', resolution='720p', duration=5, imageUrls=[首帧, 尾帧?] }
   * @returns { historyId, url, elapsedMs }
   */
  async function generateVideo({ prompt, model = 'seedance-2.5', ratio = '16:9', resolution = '720p', duration = 5, imageUrls = [] }) {
    const entry = VIDEO_MODELS[model];
    if (!entry) throw new JimengApiError(`未知视频模型 ${model}，可用: ${Object.keys(VIDEO_MODELS).join(', ')}`, 'UNKNOWN_MODEL', 400);
    const internal = entry.key;
    const benefitType = entry.benefit;
    const isVeo3 = internal.includes('veo3');
    const isSora2 = internal.includes('sora2');
    const is40 = /^dreamina_seedance_4/.test(internal); // seedance 2.0/2.5 系：4~15 秒
    const supportsResolution = (internal.includes('vgfm_3.0') || internal.includes('vgfm_3.0_fast')) && !internal.includes('_pro');

    let durationMs; let
      actualDuration;
    if (isVeo3) { durationMs = 8000; actualDuration = 8; } else if (isSora2) {
      durationMs = [12, 8].includes(Number(duration)) ? Number(duration) * 1000 : 4000;
      actualDuration = durationMs / 1000;
    } else if (is40) {
      actualDuration = Math.max(4, Math.min(15, Number(duration) || 5));
      durationMs = actualDuration * 1000;
    } else {
      durationMs = Number(duration) === 10 ? 10000 : 5000;
      actualDuration = durationMs / 1000;
    }

    await ensureCredit();

    // 上传首尾帧参考图
    const uploadIDs = [];
    for (const ref of imageUrls.slice(0, 2)) {
      const up = await uploadImageFromRef(ref);
      uploadIDs.push(up.uri);
      onLog(`视频参考图上传成功: ${up.uri}`);
    }
    const mkImage = (uri) => ({
      format: '', height: 0, id: uuid(), image_uri: uri, name: '', platform_type: 1,
      source_from: 'upload', type: 'image', uri, width: 0,
    });
    const firstFrame = uploadIDs[0] ? mkImage(uploadIDs[0]) : undefined;
    const endFrame = uploadIDs[1] ? mkImage(uploadIDs[1]) : undefined;

    const componentId = uuid();
    const originSubmitId = uuid();
    const sceneOption = {
      type: 'video',
      scene: 'BasicVideoGenerateButton',
      ...(supportsResolution ? { resolution } : {}),
      modelReqKey: internal,
      videoDuration: actualDuration,
      materialTypes: [],
      reportParams: {
        enterSource: 'generate', vipSource: 'generate',
        extraVipFunctionKey: supportsResolution ? `${internal}-${resolution}` : internal,
        useVipFunctionDetailsReporterHoc: true,
      },
    };
    const metricsExtra = JSON.stringify({
      promptSource: 'custom',
      isDefaultSeed: 1,
      originSubmitId,
      isRegenerate: false,
      enterFrom: 'use_bgimage_prompt',
      position: 'page_bottom_box',
      functionMode: 'first_last_frames',
      sceneOptions: JSON.stringify([sceneOption]),
    });

    const data = await request('POST', '/mweb/v1/aigc_draft/generate', {
      data: {
        extend: {
          root_model: internal,
          m_video_commerce_info: {
            benefit_type: benefitType,
            resource_id: 'generate_video',
            resource_id_type: 'str',
            resource_sub_type: 'aigc',
          },
          m_video_commerce_info_list: [{
            benefit_type: benefitType,
            resource_id: 'generate_video',
            resource_id_type: 'str',
            resource_sub_type: 'aigc',
          }],
        },
        submit_id: uuid(),
        metrics_extra: metricsExtra,
        draft_content: JSON.stringify({
          type: 'draft',
          id: uuid(),
          min_version: '3.0.5',
          min_features: [],
          is_from_tsn: true,
          version: DRAFT_VERSION,
          main_component_id: componentId,
          component_list: [{
            type: 'video_base_component',
            id: componentId,
            min_version: '1.0.0',
            aigc_mode: 'workbench',
            metadata: {
              type: '', id: uuid(), created_platform: 3, created_platform_version: '',
              created_time_in_ms: String(Date.now()), created_did: '',
            },
            generate_type: 'gen_video',
            abilities: {
              type: '', id: uuid(),
              gen_video: {
                id: uuid(), type: '',
                text_to_video_params: {
                  type: '', id: uuid(),
                  video_gen_inputs: [{
                    type: '', id: uuid(), min_version: '3.0.5',
                    prompt,
                    video_mode: 2,
                    fps: 24,
                    duration_ms: durationMs,
                    ...(supportsResolution ? { resolution } : {}),
                    first_frame_image: firstFrame,
                    end_frame_image: endFrame,
                    idip_meta_list: [],
                  }],
                  video_aspect_ratio: ratio,
                  seed: Math.floor(Math.random() * 4294967296),
                  model_req_key: internal,
                  priority: 0,
                },
                video_task_extra: metricsExtra,
              },
            },
            process_type: 1,
          }],
        }),
        http_common_info: { aid },
      },
      headers: { Referer: videoReferer },
    });
    const historyId = data?.aigc_data?.history_record_id;
    if (!historyId) throw new JimengApiError('提交成功但未返回 history_record_id', 'NO_HISTORY_ID');
    onLog(`视频任务已提交 history=${historyId} model=${model} duration=${actualDuration}s${uploadIDs.length ? ` 首尾帧=${uploadIDs.length}` : ' 纯文生视频'}`);

    await sleep(5000); // 提交后先等一会再查（API 最终一致性）
    const start = Date.now();
    const taskInfo = await waitForHistory(historyId, { type: 'video', expectedCount: 1, intervalMs: 20000, timeoutMs: 3600000 });
    const items = taskInfo.item_list || [];
    const itemId = items[0]?.item_id || items[0]?.id || items[0]?.local_item_id || items[0]?.common_attr?.id;
    let url = itemId ? await fetchHighQualityVideoUrl(String(itemId)) : null;
    if (!url) url = items[0] ? extractVideoUrl(items[0]) : null;
    if (!url) throw new JimengApiError(`任务完成但未提取到视频 URL（status=${taskInfo.status}）`, 'NO_RESULT');
    return { historyId, url, elapsedMs: Date.now() - start, status: taskInfo.status };
  }

  return {
    // 基础
    getAccountInfo, getCredit, receiveCredit,
    // 模型发现
    fetchVideoModels,
    // 上传
    uploadImage, uploadImageFromRef,
    // 生成
    generateImages, generateImageComposition, generateVideo,
    // 任务
    getHistory, waitForHistory, fetchHighQualityVideoUrl,
  };
}

// ---------- CLI ----------
const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href;
if (invokedDirectly) {
  const [cmd, ...args] = process.argv.slice(2);
  const arg = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : def;
  };
  const sessionid = process.env.JIMENG_SESSIONID;
  if (!sessionid) {
    console.error('缺少环境变量 JIMENG_SESSIONID（浏览器 cookie sessionid）');
    process.exit(1);
  }
  const api = createClient({ sessionid, onLog: (m) => console.error(`[log] ${m}`) });
  const cmds = {
    whoami: async () => {
      const info = await api.getAccountInfo();
      console.log(JSON.stringify({ userId: info.user_id, name: info.name || info.screen_name }, null, 2));
    },
    credit: async () => console.log(JSON.stringify(await api.getCredit(), null, 2)),
    receive: async () => console.log(JSON.stringify({ received: await api.receiveCredit() }, null, 2)),
    models: async () => {
      if (args.includes('--live')) {
        console.log(JSON.stringify(await api.fetchVideoModels(), null, 2));
        return;
      }
      console.log(JSON.stringify({ image: Object.keys(IMAGE_MODELS), video: Object.keys(VIDEO_MODELS) }, null, 2));
    },
    gen: async () => {
      const r = await api.generateImages({
        prompt: arg('prompt', '一只可爱的橘猫，像素风格'),
        model: arg('model', 'jimeng-4.5'),
        ratio: arg('ratio', '1:1'),
        resolution: arg('resolution', '2k'),
      });
      console.log(JSON.stringify({ historyId: r.historyId, elapsedMs: r.elapsedMs, urls: r.urls }, null, 2));
    },
    compose: async () => {
      const images = (arg('images', '') || '').split(',').filter(Boolean);
      const r = await api.generateImageComposition({
        prompt: arg('prompt', '把这张图变成水彩风格'),
        images,
        model: arg('model', 'jimeng-4.5'),
        ratio: arg('ratio', '1:1'),
        resolution: arg('resolution', '2k'),
      });
      console.log(JSON.stringify({ historyId: r.historyId, elapsedMs: r.elapsedMs, urls: r.urls }, null, 2));
    },
    video: async () => {
      const imageUrls = (arg('images', '') || '').split(',').filter(Boolean);
      const r = await api.generateVideo({
        prompt: arg('prompt', '一只猫在草地上奔跑，慢镜头'),
        model: arg('model', 'jimeng-video-3.0'),
        ratio: arg('ratio', '16:9'),
        resolution: arg('resolution', '720p'),
        duration: Number(arg('duration', '5')),
        imageUrls,
      });
      console.log(JSON.stringify({ historyId: r.historyId, elapsedMs: r.elapsedMs, url: r.url }, null, 2));
    },
    history: async () => {
      const id = args[0];
      if (!id) { console.error('用法: history <historyId>'); process.exit(1); }
      console.log(JSON.stringify(await api.getHistory(id), null, 2).slice(0, 4000));
    },
  };
  if (!cmds[cmd]) {
    console.error(`未知命令 ${cmd}。可用: ${Object.keys(cmds).join(' | ')}`);
    process.exit(1);
  }
  cmds[cmd]().catch((err) => { console.error(`[${err.code || 'ERROR'}] ${err.message}`); process.exit(1); });
}
