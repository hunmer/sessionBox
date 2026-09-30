# dola-api 交接文档

> 生成时间：2026-09-30。承接会话：dola.com/chat 对话 API 逆向与插件封装（参考 l0veyou-api / doubao-api 架构）。
> 目标读者：接手继续逆向或维护 `sessionbox.dola-api` 插件的 agent。

## 1. 背景与目标

- 参考 `resources/plugins/l0veyou-api/`（架构模板）与 `resources/plugins/doubao-api/service/doubao2api/client.py`（协议知识），对 https://www.dola.com/chat 的对话 API 进行 js-reverse 逆向。
- 产出零依赖 Node 插件 `sessionbox.dola-api`（端口 **19204**，OpenAI 兼容）。
- 本轮已实测通过：非流式对话、流式对话（含 `reasoning_content` 思考流）、深度思考档位。

## 2. 站点与认证（与 l0veyou 的关键差异）

- dola.com 是字节 Doubao 海外版（Flow 产品线，aid=495671，query 带 `samantha_web=1`），**协议与 doubao /chat/completion 同源（samantha 协议）**。
- 认证是字节 passport **cookie**（`sessionid`/`sid_tt`/`sid_guard` 等，`sessionid` 为 HttpOnly），无 Authorization 头、无 localStorage token。
- 登录判定双信号：bridge `getCookies`（HttpOnly 可读）查 `sessionid|sid_tt` + 页面 localStorage `flow_web_has_login==='true'`。
- query 不带 `msToken`/`a_bogus` 即可调通（宽松），**但仅限浏览器网络栈**。

## 3. 核心结论：必须走页面内 fetch（风控）

| 路径 | 结果 |
|---|---|
| 页面内 fetch（同源，最小 query，无 msToken/a_bogus） | ✅ 200 + 完整 SSE |
| Node undici 直连（即使补全 cookie+msToken+sec-ch-ua+完整 query） | ❌ `710022003 country restricted`（TLS/HTTP2 指纹识别） |

因此本插件与 l0veyou 不同：**所有上游请求经 SessionBox bridge `POST /api/v1/pages/:id/execute` 在 dola 页面主世界执行**。
bridge 的 execute（Electron `executeJavaScript`）会等待页面 Promise；Node HTTP 默认 requestTimeout 300s，故流式采用**页面缓冲 + 服务端轮询**（`window.__dolaTasks[id].chunks`，300ms 轮询读后清空），不在单个 execute 里挂完整 SSE。

## 4. 已逆向的协议

### 4.1 对话

- `POST https://www.dola.com/chat/completion?<最小query>`，JSON body（samantha 格式，见 `api-client.mjs` 的 `startChatCode`）：
  - `client_meta.bot_id` 默认 `7339470689562525703`（页面默认 bot）
  - 文本消息为 `messages[].content_block[]` 的 `block_type:10000` + `content.text_block.text`
  - 模型档位 `option.need_deep_think`：**0=快捷 1=深度思考 2=自动 3=专家**（`ext.use_deep_think` 同步字符串）；订阅模型（2.1 Pro/Turbo 等）走 `model_item_key`，未逆向
  - `need_create_conversation:true`（无状态：每次新建对话，OpenAI messages 历史拼入 prompt）
- SSE 响应事件：`SSE_ACK`（`ack_client_meta.conversation_id`）/ `STREAM_CHUNK` / `STREAM_ERROR`（`error_code`，710022002/710022004=风控验证）/ `SSE_REPLY_END`（end_type 1/2/3）/ `SSE_HEARTBEAT` / `gateway-error`
- 文本增量两种形态均已解析：紧凑 `data: {"text":"…"}`（实测 dola 用这种）与 `patch_op[].patch_value.content_block[]`（block_type 10000）；`10040` 为思考进出标记（成对，第一个进入 thinking、第二个回到正文）；10024/10101/10025 为工具/加载/搜索状态
- 会话复用：`client_meta.conversation_id` + `section_id` + `need_create_conversation:false`（自动确认场景已实测）

### 4.2 图像生成（Seedream 4.5，同步，约 20s）

- **触发方式：prompt 前缀 `生成图片：`**（服务端语义路由；页面"图像生成"技能按钮就是这个行为，请求无任何 skill 字段）
- **比例：追加在 prompt 尾部**（实测 `，16:9`）；支持 1:1/2:3/3:4/4:3/9:16/16:9（页面 `chat_input_action_image_creation_ratio` 下拉实测值），默认 1:1 不追加
- 默认一次生成 **4 张**（服务端固定，OpenAI 层 n 参数取前 n 张）
- 结果：同 SSE 内 `block_type:2074` → `content.creation_block.creations[]` 两轮 patch（status=1 占位 → status=2 出图）
- 每 creation：`image.key`、`image_ori.url`（2048 下载版）、`image_preview.url`、`image_thumb.url`（384）、`gen_params{prompt, ratio}`；URL 为 ImageX 签名直链（带水印模板，签名绑路径不可绕过）

### 4.3 视频生成（Seedance，异步，约 2-6 分钟）

- **触发方式：prompt 前缀 `生成视频：`**；时长 **4-15 秒**（写非法值如 3 秒，模型会发问"是否继续？"挂起任务）
- 提交请求同 `/chat/completion`，返回快（约 6s），回复文本含额度提示（"消耗 N 个视频生成额度，预计等待 5 分钟"），**结果不在此 SSE 内**
- 结果通道：`POST https://www.dola.com/im/chain/single`（cmd 3100，`uplink_body.pull_singe_chain_uplink_body.{conversation_id, anchor_index:9007199254740991, conversation_type:3, direction:1, limit:20}`；注意服务端拼写就是 `pull_singe_chain`）
  - 响应 `downlink_body.pull_singe_chain_downlink_body.messages[]`（**倒序，最新在前**）；`message.content` 是 **JSON 字符串**，解析后为 `content_block[]` 数组
  - 完成消息：`block_type:2074` → `creations[].video`：`status===3` 完成（1=生成中）、`vid`、`download_url`（**http** mp4 直链）、`cover.image_preview.url`、`duration`、`video_model`（JSON 字符串，含多清晰度）
- **自动确认**：轮询发现 latestText 匹配"是否继续/请确认"且无 video 任务时，同会话回复"继续，按最接近的支持参数生成"（复用 conversation_id+section_id），最多 2 次

### 4.4 登录检查

- 页面脚本读 `localStorage.flow_web_has_login` + `location.hostname`（非 dola 域报 `NOT_ON_SITE` 自动导航回）
- HttpOnly `sessionid` 只能经 bridge `/cookies?url=https://www.dola.com` 验证（document.cookie 读不到，**勿再用 JS 查 sessionid**）

## 5. 文件清单（本目录）

- `info.json`（sessionbox.dola-api）+ `main.js`（激活时经 `context.sessionServer` 拿 bridge，`ELECTRON_RUN_AS_NODE` spawn `service/server.mjs`，端口 **19204**）
- `api-client.mjs` — 核心客户端：页面脚本工厂（`startChatCode`（支持会话复用）/`pollChatCode`（含 sectionId）/`abortChatCode`/`pollChainCode`（im/chain/single）/`CHECK_LOGIN_CODE`）+ `createClient({bridge, pageId})`：`chat()`（轮询聚合，回调 onChunk/onThinkChunk/onStatus，creations 按 id 聚合）、`generateImage()`（Seedream，同步）、`generateVideo()`（Seedance，异步轮询 + 自动确认）、`pollCreations()` + `messagesToPrompt`（OpenAI messages → 单 prompt）+ 常量（`IMAGE_PROMPT_PREFIX`/`VIDEO_PROMPT_PREFIX`/`IMAGE_RATIOS`）
- `demo.html` — 调试台（账号列表 / 模型 / 流式对话 / 图像生成（比例+张数）/ 视频生成）
- `service/`：
  - `server.mjs` — OpenAI 兼容：`/health`、`/v1/models`（含 dola-seedream/dola-seedance，meta.kind/ratios）、`/v1/chat/completions`（stream 支持，思考流走 `reasoning_content`，末尾 chunk 附 `dola_conversation_id`）、`/v1/images/generations`（size/ratio→比例映射、n≤4、b64_json 可选）、`/v1/videos/generations`（同步等待至完成，timeout_ms 可调 ≤20 分钟）、`/v1/videos/status?conversation_id=`（任务状态查询）、`/v1/sessionbox/pages|refresh`。日志写 `service/service.log`
  - `sessionbox.mjs` — bridge 客户端（pages/cookies/open/execute）
  - `accounts.mjs` — 账号发现（url 含 dola.com）+ 登录检查 + 缓存 + 标签页未打开时自动 open
  - `tests/server.test.mjs` — node:test 全 mock（`node --test service/tests/server.test.mjs`，19 用例）
- 主应用配套：`electron/services/plugin-manager.ts` 的 `servicePorts` 已加 `sessionbox.dola-api: 19204`

## 6. 实测记录（2026-09-30）

- js-reverse 页面内 fetch 重放（最小 query）：✅ 模型回复 "OK"
- 页面脚本（start+poll 轮询协议）实跑：✅ 2s / 9 个 text 增量 / "1 2 3 4 5" / conversation_id 提取正常
- standalone 服务 + SessionBox 页面 `dola`（`d6d029b8-…`，已登录）：✅ pages ready:true
- 非流式 `/v1/chat/completions`：✅（system+user 两轮拼接）
- 流式：✅ 增量 chunk / finish_reason / dola_conversation_id / [DONE]
- `dola-think`（need_deep_think=1）：✅ 24 个 reasoning chunk + 21 个 content chunk，结论正确（9.9>9.11）
- 图像生成 `/v1/images/generations`（1:1，n=2）：✅ 约 20s 返回 2 张 2048 图（OpenAI 格式 + dola.conversation_id）
- 视频生成 `/v1/videos/generations`（5 秒时长）：✅ 92s 完成，5.042s mp4（download_url 直链可下载 884KB，cover 正常）
- 视频自动确认（3 秒非法时长）：✅ 第二次实测 99s 完成（dur=4.042s，模型自动按最接近的 4 秒生成）；注意模型行为随机——有时发"是否继续？"挂起（auto-confirm 分支兜底，mock 已覆盖），有时直接调整参数生成
- 曾出现一次 `fetch failed`（360s bridge execute 超时，疑似瞬时阻塞）：已加固——页面 chain/single fetch 加 30s 超时、bridge 请求超时降为 60s、轮询连续 6 次网络错误才放弃、错误日志带 cause
- 已知坑：Windows 下 curl 命令行直传中文 body 会乱码（GBK 控制台），测试须 `--data-binary @file`（UTF-8 文件）

## 7. 未完成 / 后续方向

1. **多轮对话复用（chat 类）**：会话复用机制已实现（自动确认在用），但 `/v1/chat/completions` 仍无状态（历史拼 prompt）；可将 `dola_conversation_id` 回传实现服务端上下文。
2. **订阅模型**（2.1 Pro/Turbo、1M 上下文等）：`model_item_key` 值未逆向（i18n 仅 UI 文案）；需打开页面模型菜单抓 `conversation_init_ext.model_item_key`。
3. **图生图/图生视频（参考图上传）**：block_type 10052 附件块 + 上传链路（doubao-api 的 upload_file/AWS SignV4 ImageX 可参考）未逆向。
4. **视频生成规格参数**（分辨率/运镜/首尾帧）未逆向；当前仅 prompt 语义控制。
5. 风控挑战（710022002/4）目前直接报错；doubao-api 有 captcha_handler 可参考。
6. usage 恒为 0（上游不返回 token 数）；如需可接 tokenizer 估算。
7. 图像/视频 URL 均为签名直链（图片约 2106 年过期、视频签名有效期未验证）；消费方应及时下载，视频可用 `/v1/videos/status` 现查。

## 8. 快速验证（新会话第一步）

```bash
cd "G:/programming/nodejs/sessionBox/resources/plugins/dola-api"
node --test service/tests/server.test.mjs        # 10 用例全 mock
# standalone（需 SessionBox 运行且 dola 页面已登录）:
cd service && node server.mjs                    # http://127.0.0.1:19204
curl -s http://127.0.0.1:19204/v1/sessionbox/pages
# 对话（中文 body 用 UTF-8 文件，避免 Windows curl 乱码）:
curl -s -N http://127.0.0.1:19204/v1/chat/completions -H "content-type: application/json" --data-binary @body.json
```

## 9. 工作约定

- 凭据不落盘（cookie 只经 bridge 内存传递；`.tmp-reverse/dola/req-1484.json` 含完整抓包含 cookie，属本地调试产物，勿提交）。
- 逆向产物与请求快照在 `.tmp-reverse/dola/`（不提交，协议结构已固化进代码）。
