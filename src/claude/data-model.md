[根目录](../../CLAUDE.md) > [src](../CLAUDE.md) > 详情

# src/ 数据模型

类型定义在 `src/types/index.ts`、`split.ts`、`plugin.ts`、`command.ts`。

核心类型：Workspace, Group, Container, Page, Proxy, Tab, Bookmark/BookmarkFolder, Extension, NavState, SplitLayout/SavedSplitScheme/SplitNode, PluginInfo/PluginMeta/PluginContext/RemotePlugin, CommandItem/CommandProvider, SniffedResource, PasswordEntry/PasswordField, AIProvider/AIModel/ChatSession/ChatMessage/ToolCall/TokenUsage, ChatCompletionParams, BrowserClickArgs/BrowserTypeArgs..., SearchEngine, DefaultBrowserResult。

## 本地数据库（Dexie/IndexedDB）

| 库 | 文件 | 内容 | 上限 |
|----|------|------|------|
| sessionbox-history | db.ts | 浏览历史 | 10000 |
| sessionbox-chat | chat-db.ts | AI 聊天会话/消息 | 每会话 5000 |

## Chat Store 多作用域（设计）

`useChatStore` 设计为按 `scope` 参数化的 Store 工厂，每个 scope 独立会话/消息/流式状态；`ChatSession` 增加 `scope` 字段。详见 `docs/chat-store-scoped-redesign.md`（设计文档）。
