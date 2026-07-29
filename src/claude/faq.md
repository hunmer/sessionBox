[根目录](../../CLAUDE.md) > [src](../CLAUDE.md) > 详情

# src/ 常见问题

## UI 导航

| 需求 | 看哪里 |
|------|--------|
| 侧边栏/工作区/分组/容器 | `components/sidebar/` + `stores/workspace.ts` `container.ts` `page.ts` |
| 标签栏/分屏 | `components/tabs/` + `stores/tab.ts` `split.ts` + `lib/split-layout.ts` |
| 工具栏 | `components/toolbar/` |
| 书签 | `components/bookmarks/` + `stores/bookmark.ts` + `composables/useBookmarkDragDrop.ts` |
| 设置 | `components/settings/` |
| AI 聊天/Agent | `components/chat/` + `stores/chat.ts` `chat-ui.ts` `ai-provider.ts` + `lib/agent/` |
| 下载 | `components/download/` + `stores/download.ts` |
| 历史 | `components/history/` + `stores/history.ts` + `lib/db.ts` |
| 密码 | `components/passwords/` + `stores/password.ts` |
| 插件 | `components/plugins/` + `stores/plugin.ts` |
| 命令面板 | `components/command-palette/` + `composables/useCommandPalette.ts` + `types/command.ts` |
| 主题 | `stores/theme.ts` + `styles/globals.css` |

## 注意点

- **工作流 UI 已移除**：旧文档的 `lib/workflow/`、workflow store、workflow 组件均不存在，勿再引用。
- 订阅 IPC 事件优先用 `composables/useIpc.ts`，避免泄漏。
- WebView 实际在主进程；渲染进程只做覆盖层检测与布局。
