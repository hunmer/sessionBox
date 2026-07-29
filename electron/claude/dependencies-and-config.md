[根目录](../../CLAUDE.md) > [electron](../CLAUDE.md) > 详情

# electron/ 依赖与配置

## 关键依赖（主进程相关）

| 依赖 | 用途 |
|------|------|
| `electron-store` ^8 | 核心数据 JSON 持久化 |
| `electron-chrome-extensions` ^4.9 | Chrome 扩展运行时（按 partition） |
| `electron-updater` ^6 | 自动更新 |
| `@electron-toolkit/utils` / `@electron-toolkit/preload` | 应用工具 |
| `@modelcontextprotocol/sdk` ^1.29 | MCP Server SDK |
| `@mozilla/readability` + `turndown` | 页面正文 / Markdown |
| `eventemitter2` | 插件事件总线 |
| `adm-zip` | 插件 ZIP 导入 |
| `queue` | 书签健康检查并发队列 |
| `zod` | MCP 工具参数校验 |
| `langchain` + `@langchain/anthropic` | AI 框架 |

## 配置/路径约定

- 用户数据目录：`app.getPath('userData')` 下 `container-icons/`、`account-icons/`、`site-icons/`、`ai-screenshots/`、`skills/`、`plugin-data/`、`bookmark-store.json`、`password-store.json`。
- rrweb：经 CDN 注入（`RRWEB_CDN`），事件上限 `MAX_EVENTS=10000`、单条 1MB。
- 操作录制：`MAX_STEPS=5000`、`MAX_STEP_SIZE`、`ACTION_PREFIX`。
- 缩放范围：`[-3, 7]`，持久化 `zoomPreferences[pageId]`。
- MCP 默认端口 **9527**。
