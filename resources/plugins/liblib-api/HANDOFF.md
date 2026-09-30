# liblib-api 交接文档

> 生成时间：2026-09-29。承接会话：liblib.tv（LibTV）画布/生成 API 逆向与 api-client 封装。
> 目标读者：接手继续逆向或将其封装为服务（参考 doubao-api 插件架构）的 agent。

## 1. 背景与目标

- 参考 `resources/plugins/doubao-api/` 的做法，对 https://www.liblib.tv 画布进行 API 逆向。
- 产出零依赖 Node 客户端 `api-client.mjs`（Node 18+，内置 fetch），覆盖：账号信息、画布管理、节点操作、四模态生成（文本/图片/音频/视频）、文件上传、查价。
- 本轮已全部跑通并实测；后续方向见 §6。

## 2. 凭据（敏感，此处脱敏）

| 环境变量 | 来源 | 说明 |
|---|---|---|
| `LIBLIB_TOKEN` | 浏览器 cookie `usertoken`（www.liblib.tv，登录后） | ~44 字符，约 24h 过期 |
| `LIBLIB_WEBID` | 浏览器 cookie `webid` | 与 token 同域 |
| `LIBLIB_USERUUID` | cookie `useruuid`；**可不设**，未设时 `uploadFile` 自动从 `getAccount().ownerUuid` 获取 | 仅上传 pre-sign 需要 |

获取方式：浏览器登录 liblib.tv 后 F12 → Application → Cookies 复制。实际值见会话记录/用户提供的 curl 样本，不要写入任何提交文件。

## 3. 已逆向的 API（全部实测通过）

### 3.1 域名与认证
- `api.liblib.tv` / `www.liblib.tv`：主 API，headers 仅需 `token` + `webid` + `content-type`
- `api2.liblib.art`：账号/运营配置（同 token 认证）
- `bridge.liblib.art`：OSS 预签名（仅需 token）
- `riskControl.deviceToken` / `x-log-id` 全部可省略；`origin`/`referer` 非必须

### 3.2 接口清单
| 功能 | 端点 | 要点 |
|---|---|---|
| 账号信息 | GET `api2.liblib.art/api/www/member/account?isApp=false` | 含 usablePower/会员/ownerUuid |
| 创建画布 | POST `www.liblib.tv/api/canvas/project/create-with-space` | body `{"name":"..."}`，服务端生成全部 ID |
| 项目列表 | POST `www.liblib.tv/api/canvas/project/list` | |
| 画布详情 | GET `api.liblib.tv/api/canvas/project/detail-by-space?spaceId=` | 含 nodeList |
| 添加节点 | POST `api.liblib.tv/api/canvas/nodes/batch` | `nodes.create[]`，`version` 校验宽松（0 可用） |
| 生成任务 | POST `api.liblib.tv/api/task/generation/create` | **metadata 整体可省略**（任务只挂账号，与画布无关） |
| 任务进度 | POST `api.liblib.tv/api/task/generation/progress` | status: 0/1 排队中, 2 完成, 3 失败（failedReason 字段） |
| 查价 | POST `api.liblib.tv/api/task/generation/power/calculator` | 与 create 同构，**零消耗**，参数验证利器 |
| 上传 | POST `bridge.liblib.art/gateway/oss-server-api/oss-service/api/oss/pre-sign/4` → PUT OSS | body `{"path":"upload-images/<useruuid>/<sha1>.<ext>","contentType":...}`；path 中 useruuid 必须真实 |

### 3.3 三模态参考文件结构差异（重要坑）
| taskType | 参考传法 | modeType |
|---|---|---|
| image | `imageList: [{url}]` | text2image / image2image |
| audio | `audioList: [{url}]` | text2audio |
| video | `imageList: ["纯URL字符串"]` + `imageListV2: [{url,width,height}]` + `imageLabelList` | text2video / **frames2video**（1张也是它）/ singleImage2video |
| video | **mixed2video 全能参考（默认，单图/多图均可，均已真实验证出片）**：`mixedList: [{url,type:"image"}]` + `imageListV2`（imageList/imageLabelList 置空），prompt 用 `{{Mixed 1}}`/`{{Mixed 2}}` 引用素材；≥2 张参考图**必须**走此模式（frames2video 双图=首尾帧语义，传设计稿会秒失败 status 3） | mixed2video |
| text | imageList 同 image（多模态输入） | — |

视频传对象数组会报"请上传所需的图片素材"。视频还需 `resolution/enableSound/extendPrompt` 参数。

### 3.4 模型表
- 权威来源：`GET api2.liblib.art/api/www/landing-activities/listByIds?ids=206,240,182,...` 中 **id=182** 的 `linkUrl`（内嵌 JSON，含全部 modelKey/modelName/分类）。id=186 是相机/镜头/光圈预设。
- 51 个模型已写入 `MODELS` 常量并逐一 calculator 验证（power 为起步价）。
- 最便宜：文本 `qwen-3-vl-flash`(1)、图片 `qwen-edit`/`z-image`(1)、音频 `seed-audio-1.0`/`speech-2.8-hd`(1)、视频 `MiniMax-Hailuo-o2`(8)。
- provider 大小写敏感度：calculator 层宽松，create 层按 MODELS 表中的值使用即可。

## 4. 文件清单（本目录）

- `api-client.mjs` — 主客户端。`createClient({token, webid, useruuid, urls})` 工厂（多账号每账号一实例）；CLI 子命令不变：`whoami | models | canvas | list | detail | add-node | gen | audio | image | video | upload | progress`（凭据取环境变量 LIBLIB_TOKEN/LIBLIB_WEBID）
- **插件入口**：`info.json`（sessionbox.liblib-api）+ `main.js`（激活时经 `context.sessionServer` 拿 bridge，用 `ELECTRON_RUN_AS_NODE` spawn `service/server.mjs`，端口 19201，零依赖）
- **服务** `service/`：
  - `server.mjs` — OpenAI 兼容 HTTP 服务：`/v1/models`、`/v1/chat/completions`（伪流式、多模态 image_url）、`/v1/images/generations`（size→ratio 映射、b64_json）、`/v1/audio/generations`、`/v1/audio/speech`（wav 二进制）、`/v1/video/generations`、`/v1/files`（base64/raw 上传）、`/v1/tasks/:id`、`/v1/sessionbox/pages|refresh|account`。日志写 `service/service.log`（token 脱敏）
  - `sessionbox.mjs` — bridge 客户端（pages/cookies/open，Bearer 认证）
  - `accounts.mjs` — 账号发现（url 含 liblib.tv 的页面）+ cookie 凭据提取（usertoken/webid/useruuid）+ 缓存 + 登录失效重读重试
  - `tests/server.test.mjs` — node:test 全 mock e2e（`node --test service/tests/server.test.mjs`）
- 2026-09-29 已清理逆向过程产物：抓包样本 JSON、前端源码 chunk、UI 截图、test-output.* 生成文件（API 结构已固化进代码；原始抓包如需可在浏览器 DevTools 重放获取）

## 5. 与官方 openapi 的关系

官方 `github.com/libtv-labs/libtv-skills` 是另一套体系：`im.liblib.tv/openapi/*`、AccessKey 认证、会话式（自然语言消息驱动）、含 `/openapi/file/upload`。与本套网页内部 API 功能重叠但独立；本地这套参数化更细（model/quality/ratio 直控），适合做精细服务；官方那套更稳定，可做兜底。

## 6. 未完成 / 搁置任务

1. **画布节点进阶**（用户明确搁置）：节点连线（`connections` 结构）、删除节点（`nodes.delete`）、taskId 与节点 UI 的结果回写机制（画布刷新后节点未显示 API 生成的结果，疑似依赖 progress/batch 或节点内 content 字段）。
2. 各模型特有参数：TTS voice 字段、Seedance resolution 档位、mj stylize、`textList`/`mixedList`（Wan 3.0 文档/网页输入）。
3. cameraControl（相机/镜头预设，源数据在 landing-activities id=186）封装为图片高级选项。
4. ~~封装为常驻服务（OpenAI 兼容格式），token 过期检测与自动刷新~~ — **2026-09-29 已完成**：SessionBox 插件 `sessionbox.liblib-api`（本目录），凭据实时取自页面 cookie（登录由 SessionBox 管理，token 过期后重新登录页面即可，服务带缓存+失效重读）。已真实验证：chat 中文生成（qwen-3-vl-flash）、图片生成（z-image）、账号积分查询。**注意**：cookie 读取要求对应页面标签页处于打开状态（bridge 限制），`/v1/sessionbox/pages` 的 ready 字段可查询就绪状态。
5. 官方 openapi 体系对接（需用户申请 AccessKey）。
6. 流式为伪流式（liblib 任务制无原生流），首字延迟=任务完成时间。

## 7. 工作约定（会话中确立）

- 实测生成时**选择 power 最低的模型**（用户要求），提交前用 calculator 零消耗验证。
- 浏览器验证环境：js-reverse MCP 打开的真实页面（用户已登录），token 从 cookie 取。
- 凭据不落盘到会提交的文件。

## 8. Suggested skills

- `procm-init` / procm-mcp：将来的 liblib-api 服务进程管理（启动/重启/日志）。
- `diagnose`：API 行为异常时的复现-日志-定位流程。
- `dynamic-workflows`：如需批量验证模型参数（calculator 矩阵）可编排子代理并行。
- 参考 `resources/plugins/doubao-api/service/` 的 Python 服务架构做移植时，阅读其 `browser_client.py`、`unified_server.py`。

## 9. 快速验证（新会话第一步）

```bash
cd "G:/programming/nodejs/sessionBox/resources/plugins/liblib-api"
LIBLIB_TOKEN=<cookie usertoken> LIBLIB_WEBID=<cookie webid> node api-client.mjs whoami
LIBLIB_TOKEN=... LIBLIB_WEBID=... node api-client.mjs models
LIBLIB_TOKEN=... LIBLIB_WEBID=... node api-client.mjs gen --prompt "回复：好" --model qwen-3-vl-flash   # 1 power
```
