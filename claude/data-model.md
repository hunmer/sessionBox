[根目录](../CLAUDE.md) > 详情

# 数据模型与持久化

## 核心领域模型关系

```
Workspace (工作区)
  └─ Group (分组，属于某工作区)
       └─ Page (页面，属于分组，绑定容器)
            ├─ Container (容器，Session 隔离单元，可绑代理)
            └─ Tab (标签页，运行时关联页面)

Proxy (代理，可绑 分组/容器/页面)
BookmarkFolder (书签文件夹，树形)
  └─ Bookmark (书签)
Extension (Chrome 扩展，按容器加载)
AIProvider (AI 供应商)
  └─ AIModel
ChatSession (聊天会话，含 scope)
  └─ ChatMessage (含 tool_calls)
PasswordEntry (密码/笔记)
Skill (技能，Markdown 文件)
PluginInfo (插件元信息)
SearchEngine
SniffedResource (嗅探到的网络资源)
```

> 详细字段见 [electron/claude/data-model.md](../electron/claude/data-model.md)（electron-store schema）、[src/claude/data-model.md](../src/claude/data-model.md)（types + Dexie）。

## 四层持久化

### 1. electron-store（核心结构化数据，`electron/services/store.ts`）

`StoreSchema` keys：`workspaces`、`groups`、`containers`、`pages`、`proxies`、`tabs`、`extensions`、`containerExtensions`、`windowState`、`tabFreezeMinutes`、`restoreLastUrl`、`minimizeOnClose`、`shortcuts`、`mutedSites`、`splitStates`、`splitSchemes`、`trayWindowSizes`、`updateSources`、`activeUpdateSourceId`、`snifferDomains`、`searchEngines`、`defaultSearchEngineId`、`defaultContainerId`、`zoomPreferences`、`aiProviders`。

> 书签 / 密码已从 electron-store 迁出到独立 JsonStore。

### 2. JsonStore（独立 JSON 文件）

| 文件 | 模型 |
|------|------|
| `bookmark-store.json` | Bookmark, BookmarkFolder |
| `password-store.json` | PasswordEntry |
| `plugin-data/disabled.json` | string[]（已禁用插件 ID） |
| `plugin-data/{pluginId}/storage.json` | 插件独立存储 |

> 工具类：`electron/utils/json-store.ts`。迁移逻辑：`electron/services/migration.ts`（幂等）。

### 3. Dexie / IndexedDB

| 库名 | 用途 | 上限 |
|------|------|------|
| `sessionbox-history` | 浏览历史 | 10000 条 |
| `sessionbox-chat` | AI 聊天会话/消息 | 每会话 5000 条 |

> 定义在 `src/lib/db.ts`、`src/lib/chat-db.ts`。

### 4. 纯文件目录（userData 下）

| 目录 | 内容 |
|------|------|
| `container-icons/` | 容器自定义图标 |
| `account-icons/` | 账号图标 |
| `site-icons/` | Favicon 缓存（魔术字节校验格式） |
| `ai-screenshots/` | AI 截图 |
| `skills/` | 技能 Markdown（frontmatter + 正文，含 JS 代码块） |

### 5. localStorage（渲染进程轻量配置）

主题、工作区视图、标签栏布局、主页设置、用户头像等。
