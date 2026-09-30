# l0veyou-api 交接文档

> 生成时间：2026-09-30。承接会话：l0veyou.com/chat 图片生成 API 逆向与插件封装（参考 liblib-api 插件架构）。
> 目标读者：接手继续逆向或维护 `sessionbox.l0veyou-api` 插件的 agent。

## 1. 背景与目标

- 参考 `resources/plugins/liblib-api/`（LibTV）的做法，对 https://l0veyou.com/chat 的图片生成 API 进行逆向。
- 产出零依赖 Node 客户端 `api-client.mjs`（Node 18+，内置 fetch）+ SessionBox 插件 `sessionbox.l0veyou-api`（端口 19202，OpenAI 兼容）。
- 逆向工具：js-reverse MCP（真实页面 + 前端 bundle 源码还原 + 页面内 fetch 实测）。
- 本轮已实测通过：whoami、真实生成一张图（gpt-image-2、16:9、约 20s 完成）。

## 2. 凭据（与 liblib 的关键差异：localStorage 而非 cookie）

| localStorage 键（同源全局，无前缀） | 说明 |
|---|---|
| `auth_token` | JWT（~425 字符，24h 有效），请求头 `Authorization: Bearer <auth_token>` |
| `refresh_token` | `rt_` 前缀；`POST /api/v1/auth/refresh` body `{refresh_token}` 换新，**旋转式**（旧的一次性失效） |
| `token_expires_at` | 毫秒时间戳 |
| `auth_user` | 用户 JSON 缓存（balance 等） |

- `document.cookie` 为空——**cookie 里没有凭据**，SessionBox bridge 的 `/cookies` 端点拿不到。
- 读取方案：bridge `POST /api/v1/pages/:id/execute`（页面主世界 executeJavaScript），本插件已封装。
- 刷新后必须写回页面 localStorage（本插件已实现）：页面 axios 拦截器每次请求都从 localStorage 读 `auth_token`，写回后浏览器会话与服务凭据保持一致。
- 站点另有 **API key 体系**（`/v1/*` OpenAI 兼容，聊天页用 API key 直调 `/v1/chat/completions`），与 web JWT 不互通（web JWT 调 `/v1/models` 返回 401 INVALID_API_KEY）。key 管理在页面"API 控制台"（keys API），未逆向，可作后续方向。

## 3. 已逆向的 API（全部同源 `https://l0veyou.com/api/v1`）

| 功能 | 端点 | 要点 |
|---|---|---|
| 账号信息 | GET `/auth/me?timezone=` | balance/concurrency(5)/multi_reference_enabled |
| 刷新 token | POST `/auth/refresh` | body `{refresh_token}`；返回 `data:{access_token, refresh_token, expires_in}` |
| 生成图片 | POST `/images/generate` | body 见下；返回 `{id, status:"pending", ...}` |
| 任务详情 | GET `/images/tasks/{id}?timezone=` | status: `pending`→`completed`/`failed`（failed 有 `error` 字段）；completed 有 `image_urls[]`（CloudFront 签名 URL，有过期时间） |
| 任务列表 | GET `/images/tasks?timezone=` | **无分页参数，返回全量**（实测账号 3960 条），注意截断 |

### 3.1 generate 请求体

```json
{
  "prompt": "…",
  "model": "gpt-image-2 | gpt-image-2-5-flare | gpt-image-2-5-full",
  "aspect_ratio": "1:1 | 16:9 | 9:16 | 4:3 | 3:4",
  "num": 2,
  "images": ["data:image/png;base64,…"]
}
```

- `num`：仅 2.5 系列支持 >1（max 2）；num=1 时省略该字段（前端行为）
- `images`：**base64 dataURL 直接放请求体**（无上传接口）；PNG/JPEG/WebP/GIF ≤8MiB；多张仅 2.5 系列；账号 `multi_reference_enabled=false` 时前端限 1 张（上游是否校验未测）
- 轮询节奏（前端行为）：3s 间隔、180s 超时；实测生成约 20-30s
- 响应统一包裹 `{code:0, message:"success", data:…}`；`code!==0` 即业务错误
- 请求头仅需 `authorization`；`X-Admin/User-UI-Request`、`origin`/`referer` 均可省；GET 的 `timezone` 参数可省

### 3.2 模型表（来源：前端 bundle `DoubaoView-*.js` 内嵌常量）

| model | label | maxRefs | maxNum |
|---|---|---|---|
| `gpt-image-2` | GPT Image 2 | 1 | 1 |
| `gpt-image-2-5-flare` | GPT Image 2.5 极速版 | 2 | 2 |
| `gpt-image-2-5-full` | GPT Image 2.5 满血版 | 2 | 2 |

### 3.3 参考图（images 字段）实测矩阵（2026-09-30 12:2x-12:3x）

| 组合 | 结果 |
|---|---|
| `gpt-image-2` + 1 张参考图（1536×864 PNG 1.2MB dataURL） | ✅ 成功，视觉确认构图保持、按 prompt 改风格（水彩任务 4b95b9ef） |
| `gpt-image-2-5-flare/full` + 参考图（单张/双张、原图/512px 小图） | ❌ 一律 `参考图上传失败,请重试或换一张图片` |
| `gpt-image-2-5-flare` 纯文生图（num=1/2） | ❌ `图片生成失败,请稍后重试` |
| `gpt-image-2-5-full` 纯文生图 | ❌ 同上 |
| 浏览器登录态（js-reverse 页面内 fetch）调 flare | ❌ 同样失败（排除调用侧/权限差异） |

**结论：2.5 系列（flare/full）上游整体故障**（含参考图上传步骤与生成管道），非调用方式问题；同期用户网页批量任务也有 failed。gpt-image-2 稳定可用（含图生图）。参考图 dataURL 直传链路本身已验证正确。2.5 恢复后多参考图/num=2 需复验。

## 4. 文件清单（本目录）

- `api-client.mjs` — 零依赖客户端。`createClient({token, refreshToken, expiresAt, onTokensRotated})`；方法 `getMe / generateImage / getTask / listTasks / waitForTask / refreshTokens`。CLI（`LOVEYOU_TOKEN=… node api-client.mjs`）：`whoami | tasks | task --id | gen --prompt … [--model --ratio --num --ref] | refresh`
- `info.json`（sessionbox.l0veyou-api）+ `main.js`（激活时经 `context.sessionServer` 拿 bridge，`ELECTRON_RUN_AS_NODE` spawn `service/server.mjs`，端口 **19202**）
- `demo.html` — 调试页（账号/余额/生成/参考图，multipart edits）
- `service/`：
  - `server.mjs` — OpenAI 兼容：`/v1/models`、`/v1/images/generations`（size→aspect_ratio 映射、http 参考图自动转 dataURL、b64_json）、`/v1/images/edits`（multipart）、`/v1/tasks(/:id)`、`/v1/sessionbox/pages|refresh|account`、`/health`。日志写 `service/service.log`
  - `sessionbox.mjs` — bridge 客户端（pages/cookies/open/**execute**）
  - `accounts.mjs` — 账号发现（url 含 l0veyou.com）+ localStorage 凭据提取 + 缓存 + 401 自动 refresh 并写回页面 localStorage + refresh 失败重读重试
  - `tests/server.test.mjs` — node:test 全 mock e2e（`node --test service/tests/server.test.mjs`，10 用例）
- 主应用配套：`electron/services/plugin-manager.ts` 的 `servicePorts` 已加 `sessionbox.l0veyou-api: 19202`

## 5. 实测记录（2026-09-30）

- `whoami`：✅（balance=999999999、concurrency=5、multi_reference_enabled=false）
- `gen --model gpt-image-2 --ratio 16:9` 文生图：✅ 约 20s，CloudFront 签名 URL
- `gen --model gpt-image-2 --ref` 单参考图图生图：✅（水彩任务，视觉确认构图保持）——**images dataURL 直传链路验证正确**
- 2.5 系列全部失败（详见 §3.3 实测矩阵，上游故障）
- 任务详情 `image_urls` 为一次性签名 URL，**复制易失真**（曾出现 AccessDenied），消费应以 `GET /v1/tasks/:id` 现取为准
- 任务列表乱序（同一响应内 created_at 无序）：服务端 `/v1/tasks` 已按 created_at 倒序后再 `limit` 截断
- 服务 standalone：✅ `/health`、`/v1/models`；bridge 存活时 `/v1/sessionbox/pages` 正确发现页面并报未登录状态（SessionBox 内的 l0veyou 页面当时未登录，需用户在该页面登录后 `ready:true`）
- token 刷新（refresh + 写回 localStorage）：mock 测试覆盖 ✅；真实上游未测（避免旋转掉当前会话的 refresh_token）

## 6. 未完成 / 后续方向

1. **2.5 系列复验**：上游恢复后验证多参考图（≤2 张）与 num=2；当前一律失败（§3.3）。
2. API key 体系（`/v1/*`）逆向：keys 控制台 API、`/v1/images/generations` 是否支持 gpt-image-2（若支持可绕开 web JWT，凭据更稳定）。
3. 图片 URL 是 CloudFront 签名 URL（带 Expires），消费方需及时下载；b64_json 模式已内置下载转码。
4. `GET /images/tasks` 全量返回（4000+ 条）乱序、未见分页参数；服务端已排序+截断，若上游支持分页参数可进一步优化。
5. 错误码体系：仅记录到 `code!==0` + http 401（UNAUTHORIZED/INVALID_API_KEY）；更细的错误码未枚举（"参考图上传失败"/"图片生成失败"等 error 文案见 §3.3）。

## 7. 工作约定

- 凭据不落盘到会提交的文件（token 只在环境变量/内存中传递）。
- 真实生成测试前确认账号 balance 充足（当前 999999999）。
- 逆向产物 bundle 源码在 `.tmp-reverse/l0veyou/`（不提交，API 结构已固化进代码）。

## 8. 快速验证（新会话第一步）

```bash
cd "G:/programming/nodejs/sessionBox/resources/plugins/l0veyou-api"
LOVEYOU_TOKEN=<页面 localStorage auth_token> node api-client.mjs whoami
LOVEYOU_TOKEN=… node api-client.mjs gen --prompt "测试" --model gpt-image-2 --ratio 1:1
node --test service/tests/server.test.mjs        # 10 用例全 mock
# 集成：SessionBox 添加/打开 l0veyou.com 页面并登录 → 激活插件 → http://127.0.0.1:19202/v1/sessionbox/pages 应 ready:true
```
