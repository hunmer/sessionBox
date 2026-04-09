# 书签管理系统实施计划

## Context

SessionBox 现有的 FavoriteSite 是扁平列表，无文件夹支持。需要升级为完整的书签系统：支持多级文件夹、拖拽排序、独立管理页面（sessionbox://bookmarks），并增强现有 FavoriteBar 支持文件夹下拉菜单。

---

## 数据模型设计

```typescript
// 新增：书签文件夹
export interface BookmarkFolder {
  id: string
  name: string
  parentId: string | null  // null = 根级
  order: number
}

// 扩展：书签（原 FavoriteSite）
export interface Bookmark {
  id: string
  title: string
  url: string
  accountId?: string
  favicon?: string
  folderId: string  // 新增：所属文件夹
  order: number     // 新增：排序
}
```

**迁移策略**：启动时检测是否为旧数据（无 folderId 字段），自动创建"书签栏"文件夹，将所有旧书签归入并赋予 order。

---

## 阶段一：数据层升级

### 1.1 类型定义（三处同步）

- `src/types/index.ts` — 新增 `BookmarkFolder`，`FavoriteSite` 增加 `folderId`、`order` 字段
- `electron/services/store.ts` — 同步类型定义，新增文件夹 CRUD 函数
- `preload/index.ts` — 同步类型定义，新增 API bridge

### 1.2 主进程数据层

**文件：`electron/services/store.ts`**

- 新增数据集合 `bookmarkFolders`，默认包含"书签栏"文件夹
- 新增函数：`listBookmarkFolders()`、`createBookmarkFolder()`、`updateBookmarkFolder()`、`deleteBookmarkFolder()`（级联删除子文件夹和书签）
- 修改现有函数：`listFavoriteSites` → `listBookmarks`，增加 `folderId` 参数过滤
- 新增：`reorderBookmarkFolders(ids)`、`reorderBookmarks(folderId, ids)`
- 新增：`migrateBookmarks()` — 检测旧数据并迁移

### 1.3 IPC 层

**文件：`electron/ipc/index.ts`**

- 新增文件夹 IPC：`bookmarkFolder:list/create/update/delete/reorder`
- 修改书签 IPC：`bookmark:list/create/update/delete/reorder`（替换 favoriteSite 前缀）
- 保留 `favoriteSite:*` 作为别名向后兼容（可选）

### 1.4 预加载桥接

**文件：`preload/index.ts`**

- 新增 `bookmarkFolder` API 对象
- 将 `favoriteSite` 重命名为 `bookmark`（保留旧名兼容）

### 1.5 渲染进程 Store

**文件：`src/stores/favoriteSite.ts` → 重构为 `src/stores/bookmark.ts`**

- `folders` ref + CRUD + 排序
- `bookmarks` ref + CRUD + 排序（按 folderId 过滤）
- 计算属性：`toolbarBookmarks`（书签栏文件夹的书签）、`getBookmarksByFolder(folderId)`
- `init()` 中调用迁移

**验证**：启动应用，确认数据正确迁移，书签栏功能正常。

---

## 阶段二：sessionbox:// 内部页面机制

### 2.1 Tab Store 支持

**文件：`src/stores/tab.ts`**

- 新增计算属性 `isInternalPage`：判断 activeTab URL 是否以 `sessionbox://` 开头
- 修改 `navigate()`：检测内部 URL 时不走 IPC，直接更新 tab.url
- 新增 `openInternalPage(path)` 方法：如 `openInternalPage('bookmarks')`

### 2.2 BrowserToolbar 适配

**文件：`src/components/toolbar/BrowserToolbar.vue`**

- 修改 `navigate()`：检测 `sessionbox://` 前缀时不自动补 `https://`
- 地址栏展示内部页面 URL 时保持原样

### 2.3 App.vue 条件渲染

**文件：`src/App.vue`**

- 在 webview-container 区域增加条件渲染：
  - `v-if="tabStore.isInternalPage"` → 渲染内部页面组件
  - `v-else` → 保持现有 webview-container
- 根据 URL 路径选择对应组件（如 `bookmarks` → BookmarksPage）

### 2.4 WebviewManager 适配

**文件：`electron/services/webview-manager.ts`**

- `createView()` 中检测 `sessionbox://` URL 时跳过 WebContentsView 创建
- `navigate()` 中检测内部 URL 时仅更新元数据，不加载页面

**验证**：在地址栏输入 `sessionbox://bookmarks`，确认不创建 WebContentsView，显示空白占位区域。

---

## 阶段三：书签管理页面

### 3.1 组件结构

```
src/components/bookmarks/
├── BookmarksPage.vue        # 主页面：左右分栏布局
├── FolderTree.vue           # 左侧文件夹树（递归）
├── FolderTreeItem.vue       # 单个文件夹项（可折叠、可拖拽）
├── BookmarkList.vue         # 右侧书签列表
├── BookmarkItem.vue         # 单个书签项（图标+标题+URL）
├── BookmarkFolderDialog.vue # 文件夹新增/编辑对话框
└── BookmarkDialog.vue       # 书签新增/编辑对话框
```

### 3.2 BookmarksPage.vue

**文件：`src/components/bookmarks/BookmarksPage.vue`**

- 使用 `ResizablePanelGroup` 实现左右分栏（复用 App.vue 模式）
- 左面板 200-300px，可调整大小
- 右面板填充剩余空间
- 顶部工具栏：添加书签、添加文件夹、搜索框

### 3.3 FolderTree.vue / FolderTreeItem.vue

- 使用 `Collapsible` 组件实现折叠/展开（复用 GroupItem.vue 模式）
- 递归渲染子文件夹
- 使用 `vuedraggable` 实现同级文件夹拖拽排序
- 点击文件夹 → 设置 `selectedFolderId` → 右侧显示对应书签
- 支持右键菜单：重命名、新建子文件夹、删除
- 支持多个文件夹同时展开

### 3.4 BookmarkList.vue / BookmarkItem.vue

- 列表展示选中文件夹的书签
- 每项：favicon + 标题 + URL + 操作按钮（编辑/删除）
- 使用 `vuedraggable` 实现书签拖拽排序
- 双击在新标签打开
- 右键菜单：编辑、删除、移动到文件夹

### 3.5 对话框组件

- `BookmarkFolderDialog.vue` — 输入文件夹名，选择父文件夹
- `BookmarkDialog.vue` — 输入标题/URL，选择目标文件夹和账号

**验证**：完整测试书签管理页面的 CRUD、拖拽排序、文件夹嵌套。

---

## 阶段四：FavoriteBar 增强

### 4.1 改造 FavoriteBar

**文件：`src/components/favorite/FavoriteBar.vue`**

- 数据源从 `favoriteSiteStore.sites` 改为 `bookmarkStore.toolbarBookmarks`
- 遍历时判断：如果项是文件夹 → 渲染为带 DropdownMenu 的按钮
- 文件夹按钮：显示文件夹名 + 展开箭头，点击展开 dropdown 显示子书签
- 普通书签按钮：保持现有行为

### 4.2 适配收藏按钮

**文件：`src/components/toolbar/BrowserToolbar.vue`**

- 星号按钮点击时，弹出 `BookmarkDialog`（选择保存到哪个文件夹）
- 检测是否已收藏时需遍历所有书签

### 4.3 适配 AddFavoriteDialog

**文件：`src/components/favorite/AddFavoriteDialog.vue`**

- 增加文件夹选择下拉框
- 数据源从 favoriteSiteStore 改为 bookmarkStore

**验证**：书签栏正确显示书签和文件夹下拉，收藏按钮可保存到指定文件夹。

---

## 阶段五：收尾与清理

- 删除 `src/stores/favoriteSite.ts`（已迁移到 bookmark.ts）
- 清理 preload 和 IPC 中废弃的 `favoriteSite:*` 别名（如有）
- 确保所有数据同步一致（types、store、preload 三处）
- 全流程手动测试

---

## 关键文件清单

| 文件 | 操作 |
|------|------|
| `src/types/index.ts` | 修改：新增 BookmarkFolder，扩展 FavoriteSite |
| `electron/services/store.ts` | 修改：新增文件夹 CRUD，书签增加 folderId/order，迁移逻辑 |
| `electron/ipc/index.ts` | 修改：新增文件夹 IPC，书签 IPC 适配 |
| `preload/index.ts` | 修改：新增 bookmarkFolder API |
| `src/stores/bookmark.ts` | 新建：整合文件夹+书签 Store |
| `src/stores/favoriteSite.ts` | 删除（阶段五） |
| `src/stores/tab.ts` | 修改：内部页面支持 |
| `src/App.vue` | 修改：条件渲染内部页面 |
| `src/components/toolbar/BrowserToolbar.vue` | 修改：sessionbox:// URL 处理，收藏按钮适配 |
| `electron/services/webview-manager.ts` | 修改：拦截内部 URL |
| `src/components/bookmarks/` | 新建：书签管理页面组件目录 |
| `src/components/favorite/FavoriteBar.vue` | 修改：支持文件夹 dropdown |
| `src/components/favorite/AddFavoriteDialog.vue` | 修改：增加文件夹选择 |

## 验证方案

1. **阶段一验证**：启动应用 → 原有书签数据自动迁移到"书签栏"文件夹 → 书签栏功能正常
2. **阶段二验证**：地址栏输入 `sessionbox://bookmarks` → 显示管理页面（非白屏）
3. **阶段三验证**：新建/编辑/删除文件夹和书签 → 拖拽排序 → 文件夹嵌套
4. **阶段四验证**：书签栏显示文件夹下拉 → 收藏按钮保存到指定文件夹
5. **全流程**：重启应用 → 数据持久化正确 → 所有功能正常
