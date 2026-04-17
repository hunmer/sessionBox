# 工具分层披露改造进度

## 2026-04-17
- 读取 `planning-with-files` 技能说明，确认需要项目根目录计划文件。
- 读取 `src/lib/agent/tools.ts`、`src/lib/agent/agent.ts`、`src/lib/agent/system-prompt.ts`。
- 使用 `rg` 定位工具定义、UI 引用和执行侧分发入口。
- 重构 `src/lib/agent/tools.ts`，增加 7 类分类信息、业务工具元数据、发现工具 schema 和统一返回协议。
- 修改 `src/lib/agent/agent.ts`，模型可见工具改为 `list_categories`、`list_tools_by_category`、`get_tool_detail`、`execute_tool`。
- 修改 `electron/services/ai-proxy.ts`，发现工具在主进程直接响应，`execute_tool` 转发到原业务工具执行逻辑。
- 修改 `src/lib/agent/system-prompt.ts`，加入分层披露和风险控制规则，并接入请求体 `system` 字段。
- 修改 `preload/index.ts`，补充 `system` 和 `enabledToolNames` 请求参数类型。
- 修改 `src/lib/workflow/nodeRegistry.ts`，补齐 `list_workspaces` 节点 schema/icon。
- 执行 `npx electron-vite build`，构建通过。
- 执行 `npx tsc -p tsconfig.web.json --noEmit` 和 `npx tsc -p tsconfig.node.json --noEmit`，被项目既有类型错误阻塞。
- 补充分层 `execute_tool` 后的截图结果解包逻辑，保持图片工具结果仍按图片内容返回。
- 再次执行 `npx electron-vite build`，构建通过。
