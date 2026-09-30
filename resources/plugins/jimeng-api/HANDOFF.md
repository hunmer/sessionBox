# jimeng-api 交接文档

> 生成时间：2026-09-30。任务：将 github.com/iptag/jimeng-api（GPL-3.0，2026-07 归档）移植为 SessionBox 插件。
> 架构完全对齐 `resources/plugins/liblib-api/`（参考其 HANDOFF.md 了解 bridge/账号模型约定）。

## 1. 背景

- iptag/jimeng-api 是 TypeScript + axios + express 的独立服务，认证用浏览器 `sessionid`，暴露 OpenAI 风格 API。
- 本插件将其核心移植为零依赖 Node 18+ mjs（内置 fetch + node:crypto），账号由 SessionBox 管理（cookie 实时读取，插件不落任何凭据）。
- 2026-09-30 已用真实账号（大号 vyvyww，VIP）实测通过：账号信息、积分、**文生图**（jimeng-4.5，31s/4张）、**图生图**（含 ImageX 三步上传，41s/4张）、**Seedance 2.5 文生视频**（5s/60积分，205s，返回高清无水印 URL）。

## 2. 认证与请求（实测确认，2026-09-30 仍有效）

- **仅需 cookie `sessionid`**，其余 cookie（_tea_web_id/uid_tt/sid_guard 等）客户端自行伪装生成。
- 请求头 `Sign = md5("9e2c|" + uri.slice(-7) + "|7|8.4.0|" + deviceTime + "||11ac")` + `Sign-Ver:1` + `Device-Time`；无 msToken/a_bogus/X-Argus 校验。
- 默认 query：`aid=513695&device_platform=web&region=CN&webId=<随机19位>&da_version=3.3.28&os=windows&web_component_open_flag=1&web_version=7.5.0&aigc_features=app_lip_sync`。
- **commerce 接口例外**（积分）：`noDefaultParams`（完全不带 query）且 Referer 必须是 `/ai-tool/image/generate`，否则 ret=1014 system busy。
- 响应统一 `{ret, errmsg, data}`，`ret=="0"` 取 data；passport 接口无 ret 直接返回整体。
- 国内站 `jimeng.jianying.com`；国际站（token 带 us-/hk-/jp-/sg- 前缀）走 capcut.com 域名——**未实测**，仅保留源码路径。

## 3. 已验证的 API

| 功能 | 端点 | 要点 |
|---|---|---|
| 账号信息 | POST `/passport/account/info/v2?account_sdk_source=web` | 免费，验活 |
| 积分 | POST `/commerce/v1/benefits/user_credit` | 见 §2 commerce 例外 |
| 收今日积分 | POST `/commerce/v1/benefits/credit_receive` | body `{time_zone:"Asia/Shanghai"}`，带默认 query |
| 视频模型发现 | POST `/mweb/v1/video_generate/get_common_config` | body `{scene:"video_generate"}`，返回 model_list（key/benefit/时长范围） |
| 图片上传 | POST `/mweb/v1/get_upload_token` `{scene:2}` → ImageX ApplyImageUpload → POST upload → CommitImageUpload | AWS4-HMAC-SHA256 签名（region cn-north-1, service imagex）；CRC32 头；service_id `tb4s082cfz` |
| 生成（图/视频统一） | POST `/mweb/v1/aigc_draft/generate` | draft_content/metrics_extra 双重 JSON 字符串 |
| 轮询结果 | POST `/mweb/v1/get_history_by_ids` | status: 20处理中 42/45后处理 10/50成功 30失败（fail_code） |
| 高清无水印视频 | POST `/mweb/v1/get_local_item_list` | video_model JSON 里 video_list.*.main_url 为 base64 编码 URL |

## 4. 模型表（⚠️ 2026-09-30 已按线上实测更新）

**旧视频模型（jimeng-video 1.0~3.5 全系）已下线**（ret=2061 模型已不可用），iptag/jimeng-api 源码里的 VIDEO_MODEL_MAP 过时。当前线上（scene=video_generate 返回 12 个）：

| 用户名 | model_req_key | benefit_type |
|---|---|---|
| seedance-2.5 | dreamina_seedance_45_pro | seedance_25_720p_output |
| seedance-2.5-draft | dreamina_seedance_45_pro_draft | seedance_25_draft_480p_output（样片480p，更便宜） |
| seedance-2.0 / -fast | dreamina_seedance_40_pro / _40 | dreamina_video_seedance_20_pro / dreamina_seedance_20_fast |
| seedance-2.0-vip / -fast-vip / -mini | *_vision / *_pro_vision / *_mini | *_720p_output 系 |
| seedance-1.0-pro / -fast | vgfm_3.0_pro / vgfm_3.0_fast | basic_video_operation_vgfm_* |
| minimax-h3 / happyhorse-1.1 / wan-3.0 | dreamina_minimax_h3 等 | *_output 系 |

- 图片模型 jimeng-3.0~5.0 实测仍有效（4.5 已真实验证）。
- Seedance 2.0/2.5 时长 4~15s；vgfm 系 5/10s。
- 模型再下线/上新时：`GET /v1/models?live=1` 或 CLI `models --live` 拉取线上权威列表。

## 5. 文件清单（本目录）

- `info.json`（sessionbox.jimeng-api）+ `main.js`（激活时经 `context.sessionServer` 拿 bridge，`ELECTRON_RUN_AS_NODE` spawn 服务，**端口 19203**（liblib 19201 / l0veyou 19202 已占用））
- `api-client.mjs` — 零依赖客户端 `createClient({sessionid, urls, onLog})`；CLI：`JIMENG_SESSIONID=xx node api-client.mjs whoami|credit|receive|models[--live]|gen|compose|video|history`
- `service/`：
  - `server.mjs` — OpenAI 兼容 HTTP 服务（端点清单见文件头注释；`?service=` 参数可指定地址）；日志写 `service/service.log`（sessionid 脱敏）
  - `sessionbox.mjs` — bridge 客户端（与 liblib-api 同构）
  - `accounts.mjs` — 账号发现（url 含 jimeng.jianying.com/dreamina.capcut.com）+ sessionid 提取 + 缓存 + 失效重读
  - `tests/server.test.mjs` — `node --test service/tests/server.test.mjs`（全 mock e2e）
- `demo.html` — 插件默认打开的在线调试页

## 6. 服务端点速查

```
GET  /health | /v1/models[?live=1] | /v1/sessionbox/pages | /v1/sessionbox/account | /v1/admin/logs
POST /v1/sessionbox/refresh | /v1/token/receive
POST /v1/images/generations | /v1/images/compositions | /v1/images/edits（OpenAI multipart）
POST /v1/videos/generations
GET  /v1/tasks/:historyId
```
账号选择：`x-session-page` 头 > Bearer pageId > body.page_id > 自动（open 优先）。

## 7. 已知坑与实测数据

- 生成图 URL 带签名（x-expires 数小时），**b64_json 模式会实时下载**，URL 引用要及时消费。
- 文生图 jimeng-4.5 会员免费（未扣积分）；Seedance 2.5 5s/720p 消耗 60 积分。
- jimeng-4.x 的 prompt 含"连续/绘本/故事/N张"时自动走多图模式（ImageMultiGenerate）。
- 图生图 prompt 自动加 `##`×N 前缀（上游协议要求，blend 引用占位）。
- 生成结果固定 4 张一组；视频 5s 约 2~4 分钟。
- 积分为 0 时自动尝试收今日积分（上游行为）。

## 8. 未完成 / 后续优化

1. **omni_reference 全能参考模式**（seedance 2.0 系多素材引用）未移植——需要 VOD 视频上传（video-uploader.ts），涉及分片上传协议，工作量较大。
2. 国际站（us-/hk-/jp-/sg- Dreamina）路径保留未实测；国际站模型映射（nanobanana 等）未纳入。
3. 积分消耗预估（生成前报价）接口未找到对应端点，上游也没有。
4. 图片模型列表动态发现（类似 video_generate/get_common_config 的 image 版 scene 待确认）。
5. Seedance 2.5 的 1080p 档 / 首尾帧模式参数差异未逐一实测。

## 9. 快速验证（新会话第一步）

```bash
cd "G:/programming/nodejs/sessionBox/resources/plugins/jimeng-api"
node --test service/tests/server.test.mjs        # 全 mock e2e
node scripts/real-test.mjs <pageId> credit       # 真实账号积分（pageId 省略=自动）
node scripts/real-test.mjs <pageId> gen          # 真实文生图
node scripts/real-test.mjs <pageId> video        # 真实视频（消耗积分）
```
或直接启动服务后访问 demo.html（插件激活后 http://127.0.0.1:19203）。
