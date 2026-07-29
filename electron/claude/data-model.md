[根目录](../../CLAUDE.md) > [electron](../CLAUDE.md) > 详情

# electron/ 数据模型

## electron-store schema（`electron/services/store.ts`）

`StoreSchema` keys：`workspaces groups containers pages proxies tabs extensions containerExtensions windowState tabFreezeMinutes restoreLastUrl minimizeOnClose shortcuts mutedSites splitStates splitSchemes trayWindowSizes updateSources activeUpdateSourceId snifferDomains searchEngines defaultSearchEngineId defaultContainerId zoomPreferences aiProviders`。

| 模型 | 字段摘要 |
|------|----------|
| Workspace | id, title, color, order, isDefault? |
| Group | id, name, order, icon?, proxyId?, color?, workspaceId? |
| Container | id, name, icon, proxyId?, autoProxyEnabled?, order |
| Page | id, groupId, containerId?, name, icon, url, order, proxyId?, userAgent? |
| Proxy | id, name, enabled?, proxyMode?, type?, host?, port?, username?, password?, pacScript?, pacUrl? |
| Tab | id, pageId, title, url, order, pinned?, muted?, workspaceId? |
| Extension | id, name, path, enabled, icon? |
| WindowState | x?, y?, width, height, isMaximized |
| ShortcutBindingStore | id, accelerator, global |
| SplitLayoutData | presetType, panes[], direction, sizes[], root? |
| SavedSplitSchemeData | id, name, presetType, direction, paneCount, sizes[], root? |
| TrayWindowSizes | newWindow, desktop, mobile |
| AIProviderStore | id, name, apiBase, apiKey, models[], enabled, createdAt |
| AIModelStore | id, name, providerId, maxTokens, supportsVision, supportsThinking |
| PasswordEntry | id, siteOrigin, siteName?, name, fields[], order, createdAt, updatedAt |
| SearchEngine | id, name, url, icon? |
| UpdateSource | id, name, type, owner?, repo?, url? |

> 每个集合配套 list/create/update/delete/reorder/getter；settings 类 getter/setter（如 `getMcpEnabled`、`getTabFreezeMinutes`、`getMinimizeOnClose`）。
> Bookmark / Password 已迁出到独立 JsonStore（见下）。

## JsonStore 独立文件

| 文件 | 模型 |
|------|------|
| `bookmark-store.json` | Bookmark, BookmarkFolder |
| `password-store.json` | PasswordEntry |
| `plugin-data/disabled.json` | string[] |
| `plugin-data/{pluginId}/storage.json` | Record<string, any> |

工具类 `electron/utils/json-store.ts`；迁移 `electron/services/migration.ts`（幂等）。

## Skill Store

`{userData}/skills/{name}.md`，frontmatter（name, description, created, updated）+ Markdown 正文（含 JS 代码块）。`electron/services/skill-store.ts`。

## MCP 工具（`electron/services/mcp/tools/`）

| 文件 | 工具 |
|------|------|
| `query.ts` | list_workspaces, list_groups, list_containers, list_pages, list_tabs, list_bookmarks, list_proxies, get_tab_detail |
| `tab.ts` | create_tab, navigate_tab, close_tab, switch_tab, reload_tab, go_back, go_forward |
| `cdp.ts` | execute_js, cdp_command, screenshot（attach `wc.debugger` '1.3'） |
| `window.ts` | create_window, navigate_window + minimize/maximize/close |
| `index.ts` | `registerAllTools` 聚合 |

`ToolContext { store, bookmarkStore, webviewManager, mainWindow }`（`mcp/types.ts`）；`McpStatus { enabled, running, toolCount, port }`。
