# Task Plan: 迁移 Workflow + AI Agent 模块到新项目

## Goal
将 sessionbox 的工作流编辑器、执行引擎、AI Agent/Chat 系统完整迁移到 /Users/Zhuanz/Documents/work_fox，构建独立的 Electron + Vue 3 + shadcn-vue 应用。

## Current Phase
Phase 1

## Phases

### Phase 1: 项目脚手架搭建
- [ ] 使用 electron-vite 初始化新项目
- [ ] 配置 TypeScript、Tailwind CSS 4、shadcn-vue
- [ ] 配置 electron-builder 打包
- [ ] 安装核心依赖（vue-flow、dexie、dagre、zod 等）
- **Status:** pending

### Phase 2: 主进程 - 基础设施迁移
- [ ] 迁移 json-store 工具类
- [ ] 迁移 workflow-store（CRUD + 文件存储）
- [ ] 迁移 workflow-version（版本快照）
- [ ] 迁移 execution-log（执行日志）
- [ ] 迁移 ai-proxy（SSE 流 + 工具执行循环）
- [ ] 迁移 ai-proxy-tools（浏览器工具实现 → 需改造）
- [ ] 迁移 workflow-tool-executor + workflow-tool-dispatcher
- [ ] 迁移 MCP Server（按需）
- [ ] 注册所有 IPC handlers
- [ ] 迁移 preload 桥接层（chat/workflow/agent 命名空间）
- **Status:** pending

### Phase 3: 渲染进程 - 类型与引擎迁移
- [ ] 迁移 workflow 类型定义 (types.ts)
- [ ] 迁移 nodeRegistry（节点注册表，剥离浏览器特定节点）
- [ ] 迁移 workflow engine（执行引擎）
- [ ] 迁移 lucide-resolver
- [ ] 迁移 chat-db (Dexie)
- [ ] 迁移 AI Provider 类型与 Store
- **Status:** pending

### Phase 4: 渲染进程 - Agent 系统迁移
- [ ] 迁移 src/lib/agent/ 全部文件（agent.ts、stream.ts、tools.ts）
- [ ] 迁移 system-prompt.ts、workflow-tools.ts、workflow-renderer-tools.ts
- [ ] 适配工具发现系统（移除浏览器专属工具或替换为通用工具）
- [ ] 迁移 Pinia stores（workflow、chat、ai-provider）
- **Status:** pending

### Phase 5: 渲染进程 - UI 组件迁移
- [ ] 迁移 shadcn-vue 基础组件（button、input、dialog、scroll-area 等）
- [ ] 迁移 workflow/ 全部 18 个组件
- [ ] 迁移 chat/ 全部组件（ChatPanel、ChatInput、ChatMessage 等）
- [ ] 迁移 lucide-resolver + 图标依赖
- [ ] 样式与主题适配
- **Status:** pending

### Phase 6: 集成测试与修复
- [ ] 主进程启动测试
- [ ] IPC 通道连通性验证
- [ ] Workflow CRUD 全流程测试
- [ ] AI Chat 流式对话测试
- [ ] Workflow 编辑器 UI 测试
- [ ] 工作流执行引擎测试
- **Status:** pending

### Phase 7: 清理与交付
- [ ] 移除未使用的浏览器特定代码
- [ ] 更新 README / CLAUDE.md
- [ ] 构建打包验证
- **Status:** pending

## Key Questions
1. 新项目是否需要保留浏览器自动化工具（click/type/scroll 等）？→ 保留结构但可能需要替换实现
2. MCP Server 是否一并迁移？→ 按需迁移，优先级较低
3. LangChain 依赖是否保留？→ 当前未实际使用，可暂不迁移
4. 插件系统是否迁移？→ 不迁移
5. 嗅探器/书签/密码/下载等模块？→ 不迁移，仅迁移 workflow + AI agent

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 基于 electron-vite 脚手架 | 与原项目一致，降低迁移成本 |
| 保留 workflow 全部 18 个 UI 组件 | 完整迁移，避免功能缺失 |
| 剥离浏览器专属工具 | 新项目非浏览器管理工具，保留通用节点 |
| 不迁移 MCP Server | 用户确认不需要 |
| 不迁移 LangChain | 源码无 LangChain import，agent 用直接 API 调用 |
| 使用 JsonStore 替代 electron-store | workflow 已独立存储，迁移更干净 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       | 1       |            |

## Notes
- 源项目 workflow 模块总计 ~5,500 行（渲染）+ ~1,100 行（主进程）
- AI Agent/Chat 模块总计 ~3,000 行（渲染）+ ~1,000 行（主进程）
- 目标目录 /Users/Zhuanz/Documents/work_fox 已存在但为空
- 需迁移的 shadcn-vue 组件约 20+ 个
