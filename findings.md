# Findings & Decisions

## Requirements
- 将 sessionbox 的 workflow 模块（编辑器+引擎+存储）完整迁移到独立 Electron 项目
- 同时迁移 AI Agent/Chat 系统（ai-proxy、工具发现、流式对话）
- 新项目使用 shadcn-vue + vite + electron 技术栈
- 迁移目标：/Users/Zhuanz/Documents/work_fox

## Research Findings

### 源项目 Workflow 模块清单

#### 主进程 (electron/)
| 文件 | 行数 | 职责 |
|------|------|------|
| services/workflow-store.ts | 143 | 工作流 CRUD + 文件存储 |
| services/workflow-version.ts | 70 | 版本快照管理 |
| services/workflow-tool-executor.ts | 624 | AI 工具执行器（62 种节点类型） |
| services/workflow-tool-dispatcher.ts | 122 | 工具路由（主进程/渲染进程） |
| services/execution-log.ts | 57 | 执行日志存储 |
| ipc/workflow.ts | 56 | 工作流 IPC handlers |
| ipc/workflow-version.ts | 28 | 版本 IPC handlers |
| ipc/execution-log.ts | 20 | 日志 IPC handlers |

#### 渲染进程 (src/)
| 文件 | 行数 | 职责 |
|------|------|------|
| lib/workflow/types.ts | 128 | 类型定义 |
| lib/workflow/nodeRegistry.ts | 428 | 节点注册表（60+ 节点） |
| lib/workflow/engine.ts | 438 | 执行引擎 |
| stores/workflow.ts | 628 | Pinia Store（含撤销/版本/草稿/AI集成） |
| components/workflow/*.vue | ~3,300 | 18 个 UI 组件 |

### 源项目 AI Agent 模块清单

#### 主进程
| 文件 | 行数 | 职责 |
|------|------|------|
| services/ai-proxy.ts | 504 | AI API 网关（SSE流、工具循环） |
| services/ai-proxy-tools.ts | 361 | 浏览器工具实现 |
| ipc/chat.ts | 155 | Chat IPC handlers |
| services/mcp/server.ts | 191 | MCP Server |
| services/mcp/tools/*.ts | ~300 | MCP 工具集 |

#### 渲染进程
| 文件 | 行数 | 职责 |
|------|------|------|
| lib/agent/agent.ts | 111 | Agent 入口 |
| lib/agent/stream.ts | 124 | SSE 流监听 |
| lib/agent/tools.ts | 797 | 工具发现系统 |
| lib/agent/system-prompt.ts | 34 | 系统提示词 |
| lib/agent/workflow-tools.ts | 338 | 工作流工具定义 |
| lib/agent/workflow-renderer-tools.ts | 225 | 渲染进程工具执行 |
| lib/chat-db.ts | 154 | Dexie 聊天数据库 |
| stores/chat.ts | 452 | Chat Pinia Store |
| stores/ai-provider.ts | ~150 | AI Provider Store |
| components/chat/*.vue | ~1,400 | 10 个聊天 UI 组件 |

### 共享依赖
- json-store.ts — JsonStore 工具类（独立 JSON 文件存储）
- lucide-resolver.ts — Lucide 图标动态解析
- types/index.ts — 跨进程类型定义
- preload/index.ts — IPC API 桥接

### 核心第三方依赖
```json
{
  "@vue-flow/core": "工作流可视化",
  "@vue-flow/background": "网格背景",
  "@vue-flow/minimap": "小地图",
  "@vue-flow/controls": "缩放控制",
  "@vue-flow/node-resizer": "节点缩放",
  "@dagrejs/dagre": "自动布局",
  "dexie": "IndexedDB（聊天记录）",
  "zod": "Schema 验证",
  "@modelcontextprotocol/sdk": "MCP 协议",
  "vue-stream-markdown": "流式 Markdown 渲染",
  "vuedraggable": "拖拽排序",
  "vue-sonner": "Toast 通知"
}
```

### 需要剥离的浏览器特定模块
- ai-proxy-tools.ts 中的浏览器工具（click、type、scroll、screenshot 等）
- nodeRegistry 中浏览器操作类别节点（click_element、input_text 等）
- tools.ts 中的 DOM/Page/Tab/Window 工具类别
- webview-manager 依赖
- page-extractor 依赖（Readability + Turndown）
- skill-store 依赖

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 保留 workflow 全部节点定义结构 | 节点类型可扩展，先迁移再按需裁剪 |
| 剥离 webview-manager 等浏览器依赖 | 新项目不是浏览器管理工具 |
| 不迁移 MCP Server | 用户确认不需要 |
| 不迁移 LangChain | 源码无 LangChain import，agent 直接调 API |
| 使用独立的 JsonStore 而非 electron-store | workflow 数据已独立存储 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 待发现 | - |

## Resources
- 源项目: /Users/Zhuanz/Documents/sessionBox
- 目标项目: /Users/Zhuanz/Documents/work_fox
- electron-vite: https://electron-vite.org/
- Vue Flow: https://vue-flow.dev/

## Visual/Browser Findings
- 无

---
*Update this file after every 2 view/browser/search operations*
