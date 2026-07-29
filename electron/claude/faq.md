[根目录](../../CLAUDE.md) > [electron](../CLAUDE.md) > 详情

# electron/ 常见问题

## 服务层导航

| 任务 | 看哪里 |
|------|--------|
| WebView 行为/冻结/代理/嗅探 | `services/webview-manager.ts` + `services/webview/` |
| 标签缩放持久化 | `services/webview/zoom.ts`（`zoomPreferences[pageId]`，范围 [-3,7]） |
| 标签冻结 | `services/webview/freeze.ts`（`freezeView`，发 `on:tab:frozen`） |
| 协议屏蔽 | `services/webview/blocked-protocols.ts`（`BLOCKED_SCHEMES` → 204） |
| AI Key 组装/SSE/工具循环 | `services/ai-proxy.ts`（`proxyChatCompletions`、`executeTool`、`activeRequests`） |
| AI 工具实现 | `services/ai-proxy-tools.ts`（executeCreateTab/Window/Browser/Page/Skill/InjectJs） |
| MCP 工具注册 | `services/mcp/tools/index.ts` → query/tab/cdp/window |
| 操作录制/回放 | `services/action-recorder.ts`（录制）+ `action-player.ts`（回放）+ `debugger.ts`（rrweb） |
| 插件存储 | `services/plugin-storage.ts`（每插件 `storage.json`）+ `plugin-data/disabled.json` |
| 数据迁移幂等 | `services/migration.ts` |

## 注意点

- `ai-proxy/handlers/` 目录当前为空，工具实现都在 `ai-proxy-tools.ts`。
- `global.__webviewManager` 暴露供浏览器交互 IPC 访问。
- 调试器为独立窗口 + 独立预加载（构建时复制 HTML/assets 到 `out/preload/`）。
