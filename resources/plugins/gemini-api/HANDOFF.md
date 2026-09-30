# gemini-api 交接文档

> 生成时间：2026-09-30。任务：参考 Nativu5/Gemini-FastAPI（MIT）+ HanaokaYuzu/Gemini-API（MIT），
> 为 SessionBox 创建 Node 版 Gemini Web API 插件，兼容 OpenAI 格式的文本对话/生图/生视频。
> 架构完全对齐 `resources/plugins/jimeng-api/`（bridge/账号模型/网关约定一致）。
> 源码克隆在 `tmp/Gemini-FastAPI`（服务层）与 `tmp/gemini-webapi-py`（协议层，权威参考）。

## 1. 背景

- Gemini-FastAPI 是 Python(FastAPI) 服务，依赖 HanaokaYuzu/Gemini-API（curl_cffi 伪装 chrome145）。
- 本插件把协议层移植为零依赖 Node mjs（内置 fetch），账号由 SessionBox 管理（cookie 实时读取，插件不落任何凭据）。
- 协议：gemini.google.com 网页版 JSPB 数组协议（长度前缀流帧，UTF-16 单位计数）。

## 2. 协议要点（从 gemini-webapi-py 移植，2026-09-30 真实网络已验证可达）

- **初始化**：`GET /app` 提取 `"SNlM0e"`(at) / `"cfb2h"`(bl) / `"FdrFJe"`(f.sid) / `"TuX5cc"`(hl) / `"qKIAYe"`(push id)。游客无 SNlM0e。
- **模型发现**：`POST /_/BardChatUi/data/batchexecute?rpcids=otAQ7b`，body `f.req=[[["otAQ7b","[]",null,"generic"]]]`；
  响应 part[1]=rpcid、part[2]=body JSON 字符串；body[15]=模型列表（[0]=hex modelId、[1]=类别名）、[16]/[17]→capacity 位。
- **生成**：`POST .../StreamGenerate?hl=en&_reqid=N&rt=c&bl=...&f.sid=...`，
  body `at=...&f.req=[null,"<81 槽稀疏数组 JSON>"]`。关键槽位：[0]=`[prompt,0,null,fileData,null,null,0]`、
  [1]=`[hl]`、[2]=metadata、[7]=1(流式)、[45]=1(临时会话)、[59]=uuid、[79]=modelNumber、[80]=2(深度思考)。
- **模型头**：`x-goog-ext-525001261-jspb: [1,null,null,null,"<hexId>",null,null,0,[4,5,6,8],null,null,<capacity尾>,null,null,<modelNumber>,<thinking>,<clientSessionId>]`。
- **流解析**：帧 = `<len>\n<JSON>`（len 为 UTF-16 单元数，JS `string.length` 天然一致）；`)]}'` 反 XSSI 前缀。
  part[2]=inner JSON；inner[1]=metadata(cid/rid)、inner[4]=candidates、inner[25]=string 表示 final chunk。
  candidate：[0]=rcid、[1][0]=文本、[37][0][0]=thoughts、[8][0]==2 完成；[12] rich content：
  field 7=生成图片（`[0][3][3]`=url）、field 59=视频（`[0][0][0][0][7]`=[缩略图,视频URL]）。
  JSPB 稀疏高位字段存末尾 dict（key=字段号+1），`getField` 双位置兼容。
- **错误码**：part[5][2][0][1][0] → 1037 用量超限 / 1050 模型不一致 / 1052 模型头无效 / 1060 IP 限制 / 1013 临时。
- **文件上传**：`POST content-push.googleapis.com/upload`（multipart `file` 字段），头 `X-Tenant-Id: bard-storage` + `Push-ID`；响应文本即文件路径，放 message_content[3]。
- **视频轮询**：lh3 视频 URL 未就绪返回 206，就绪 200（pollMediaUrl 轮询）。
- **多轮对话**：无状态 ChatML 拼接（`<|im_start|>role\ncontent<|im_end|>` + 末尾开放 assistant 标签），与 Gemini-FastAPI process_conversation 一致。

## 3. 与 Python 版的差异（有意为之）

- cookie 全量来自 SessionBox partition（Python 版仅 1PSID/1PSIDTS + 手动 RotateCookies 轮换；
  SessionBox 浏览器会自动轮换 PSIDTS，失效时 invalidate 重读 partition 即可）。
- 临时会话默认开（`GEMINI_TEMPORARY=0` 关闭），避免污染账号网页历史；视频请求强制普通会话。
- 不做 LMDB 会话存储 / read_chat 流恢复 / tool-calling PascalCase 协议 / deep research（MVP 未移植）。
- Node fetch TLS 指纹实测未被拦截（Python 版 curl_cffi chrome145 防 DBSC，Node 场景暂不需要）。

## 4. 运行注意（实测踩坑）

- gemini.google.com 首页 set-cookie 极多，Node 默认 16KB 响应头溢出 → `--max-http-header-size=262144`（main.js 已注入）。
- **Google 域需代理且 Node fetch 不读系统代理**：SessionBox GUI 主进程 env 通常没有 HTTPS_PROXY
  （只有 `npm_config_https_proxy` 这类 Node 不识别的变量），插件服务会直连失败（现象：网关 chat 返回
  `fetch failed`）。main.js `detectProxyUrl()` 按序解析：`GEMINI_PROXY > HTTPS_PROXY/HTTP_PROXY >
  npm_config_https_proxy/npm_config_proxy > Electron session.resolveProxy(系统代理)`，注入
  `NODE_USE_ENV_PROXY=1 + HTTPS_PROXY`（Electron 44 内嵌 Node 24.21 已验证支持）。
- bridge 限 cookie 读取需标签页打开，accounts.mjs 自动 openPage 后轮询重读。
- 非流式回复偶见句内重复片段（Gemini 流式帧 flicker，text 帧间非纯前缀追加时聚合取末帧全文），已知问题。

## 5. 已验证 / 未验证（2026-10-01 真实账号全链路实测）

| 项目 | 状态 |
|---|---|
| 单元测试（帧解析/JSPB/增量） | ✅ 5/5 通过（`node --test service/tests/server.test.mjs`，全 mock） |
| 模型发现 | ✅ 返回 3.5 Flash-Lite / 3.8 Flash / 3.1 Pro（免费账号，无独立 image/veo 模型） |
| 非流式对话 + 多轮记忆 | ✅（"我叫小明"→"你叫小明！"） |
| 流式 SSE | ✅ 增量 delta + stop + [DONE] |
| 多模态图片输入 | ✅ dataURL → content-push 上传 → 正确识色（回复带 [cite: N] 标记，后续可过滤） |
| 文生图 images/generations | ✅ 30-40s 出全尺寸原图（默认 Flash 模型内嵌 nano banana；经 c8o8Fe RPC 换全尺寸直链，实测 2816x1536 / 3.4MB），url 模式返回本服务中转可直下，b64_json ✓ |
| 生视频 videos/generations | ✅ 默认模型直接生成（81s，7.6MB MP4，含 206 轮询），中转 URL 可直下 |
| 错误码 1185 | ✅ 生图频率限制（已映射 IMAGE_RATE_LIMITED），连续快速生图会触发，约 1-2 分钟后恢复 |

### 5.1 真实调试中修复的三个关键问题

1. **帧 marker 语义**：marker = `len('\n' + JSON + '\n')`（marker 数字后的换行**计入** units，
   payload 从数字末尾开始切，不跳换行）。写成 `+1` 跳换行会每帧多吃 1 字符 → JSON.parse 静默失败 →
   StreamGenerate 全部 EMPTY_RESPONSE（batchexecute 因有逐行 fallback 而幸存）。mock 编码需同步 `len+2`。
2. **gg-dl 图片/视频直链不可直访**：lh3 `gg-dl` URL 302 → `work.fife.usercontent.google.com` 一次性签名
   地址，二段需要 **fife 域 cookie**（bridge 按 `url=https://work.fife.usercontent.google.com` 读 partition），
   与 gemini.google.com 域 cookie 不同。`fetchBinary` 支持 redirectCookieHeader，server 按页面缓存 1h。
3. **url 模式中转**：直链要求登录态且过期快，images/videos/chat 的 url 统一下载后经 `GET /v1/files/:id`
   中转（内存缓存 30 分钟 TTL，上限 200 条）；b64_json 直接返回 base64。
4. **gg-dl 流内 URL 是降采样预览**（约 512px；真实尺寸元数据在 candidate `[0][3][15]` = [宽,高,字节]）。
   全尺寸需 RPC `c8o8Fe`（payload 结构见 api-client `getFullSizeImageUrl`，两层文本跳转到 `rd-gg-dl` 直链），
   **且依赖会话历史：temporary 会话报错误码 1003**，故 images/generations 与 images/edits 固定走普通会话
   （代价：生图会写入账号的 Gemini 网页历史）。失败自动回退预览图。

## 6. 验收路径（已完成 2026-10-01）

1. ✅ SessionBox 添加页面 `https://gemini.google.com` 并登录 Google 账号。
2. 重载 gemini-api 插件（端口 19205，网关 `/api/gemini-api/`；main.js 已注入代理与 header 参数）。
3. `curl http://127.0.0.1:19205/v1/models` 返回账号可用模型。
4. demo.html 调试对话/生图；生视频 `POST /v1/videos/generations`（默认模型即可生视频，poll_timeout 默认 300s）。

## 7. 后续优化（未做）

- 流式 chat 中图片转本服务中转（当前流式返回 gg-dl 直链 markdown，需登录态才能访问；非流式已中转）
- 回复文本过滤 `[cite: N]` 引用标记；生图占位闪烁文本（`_704` 等）流式场景仍可能出现
- tool calling（PascalCase 协议，见 Gemini-FastAPI `_build_tool_prompt`/`extract_tool_calls`）
- 多轮 metadata 复用（cid/rid 续聊，省 token；当前每轮全量拼接）
- `x-goog-ext-525001261-jspb` 自定义模型注入（config.yaml `gemini.models` 等价能力）
- GeneratedImage 全尺寸 RPC（`c8o8Fe`，当前直接用流内 URL）
- read_chat 流恢复（视频生成中断线重连）
