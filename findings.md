# 工具分层披露改造发现

## 当前结构
- `src/lib/agent/tools.ts` 定义 `ToolDefinition`、`ToolMeta`、`BROWSER_TOOL_LIST` 和 `createBrowserTools()`。
- `src/lib/agent/agent.ts` 当前调用 `createBrowserTools(targetTabId)`，并把启用的工具集合直接传给主进程 chat completion。
- `src/lib/agent/system-prompt.ts` 当前提示模型可直接使用浏览器工具，没有分层披露约束。
- `electron/services/ai-proxy.ts` 包含业务工具的主进程执行分发。

## 初步判断
- 用户目标要求 MVP 四接口：`list_categories()`、`list_tools_by_category(category)`、`get_tool_detail(tool_name)`、`execute_tool(tool_name, args)`。
- 最小落地路径应保留现有业务工具定义作为 registry，仅将模型可见工具改为发现工具。
- `execute_tool` 需要在执行侧被识别，并转发到已有业务工具处理逻辑，否则模型只能发现不能执行。
