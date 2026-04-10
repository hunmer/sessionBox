# 书签导入导出功能设计

## 概述

为 SessionBox 添加两个书签功能：
1. **批量导入**：解析 Chrome 导出的 bookmark.html，保留完整文件夹结构
2. **导出全部**：将所有书签和文件夹导出为 Chrome 可导入的 Netscape Bookmark HTML

## 架构

**渲染进程解析 + 主进程批量写入**（混合方案）

- 渲染进程用 `DOMParser` 解析 Netscape Bookmark HTML（浏览器原生能力，解析最方便）
- 新增批量 IPC 接口在主进程一次性写入
- 文件选择/保存用 Electron 的 `dialog` API

## 数据流

### 导入流程

1. 用户点击「导入书签」按钮
2. 渲染进程调用 IPC `bookmark:importOpenFile` 打开文件选择对话框
3. 主进程读取 HTML 文件内容，返回给渲染进程
4. 渲染进程用 DOMParser 解析 HTML，提取文件夹层级 + 书签列表
5. 渲染进程调用 IPC `bookmark:batchCreate` 批量写入文件夹和书签
6. 刷新 store 数据

### 导出流程

1. 用户点击「导出书签」按钮
2. 渲染进程从 store 收集所有文件夹和书签
3. 渲染进程生成 Netscape Bookmark HTML 字符串
4. 调用 IPC `bookmark:exportSaveFile` 打开保存对话框并写入文件

## Chrome 书签 HTML 格式

Chrome 导出的是标准 Netscape Bookmark 格式：

```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3 ADD_DATE="..." PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>
  <DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="..." ICON="...">Example</A>
    <DT><H3 ADD_DATE="...">子文件夹</H3>
    <DL><p>
      <DT><A HREF="..." ADD_DATE="...">链接</A>
    </DL><p>
  </DL><p>
  <DT><H3 ADD_DATE="...">其他书签</H3>
  <DL><p>
    ...
  </DL><p>
</DL><p>
```

关键结构：`<DL>` 包含列表，`<DT><H3>` 是文件夹标题，紧跟的 `<DL>` 是文件夹内容，`<DT><A>` 是书签链接。

## 新增 IPC 接口

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `bookmark:importOpenFile` | 无 | `{ html: string } \| null` | 打开文件对话框并读取 HTML 内容 |
| `bookmark:exportSaveFile` | `{ html: string }` | `{ success: boolean }` | 打开保存对话框并写入 HTML |
| `bookmark:batchCreate` | `{ folders: Omit<BookmarkFolder, 'id'>[], bookmarks: Omit<Bookmark, 'id'>[] }` | `{ folders: BookmarkFolder[], bookmarks: Bookmark[] }` | 批量创建文件夹和书签 |

## 文件修改清单

### 主进程 (electron/)

1. **`electron/ipc/index.ts`** — 新增 3 个 IPC handler
2. **`electron/services/store.ts`** — 新增 `batchCreateBookmarks` 和 `batchCreateBookmarkFolders` 函数

### 预加载 (preload/)

3. **`preload/index.ts`** — 在 `bookmark` 命名空间下新增 `importOpenFile`、`exportSaveFile`、`batchCreate` 方法

### 渲染进程 (src/)

4. **`src/components/bookmarks/BookmarksPage.vue`** — 工具栏添加「导入」和「导出」按钮
5. **`src/stores/bookmark.ts`** — 新增 `importBookmarks()` 和 `exportBookmarks()` 方法（含 HTML 解析/生成逻辑）

## 导入解析逻辑

```
parseBookmarkHTML(html: string):
  1. DOMParser 解析 HTML
  2. 找到第一个 <DL> 标签
  3. 递归遍历 <DT> 子节点：
     - 遇到 <H3> → 创建文件夹对象，递归处理紧跟的 <DL>
     - 遇到 <A> → 创建书签对象
  4. 返回 { folders: [], bookmarks: [] }
```

### 去重策略

- **文件夹合并**：如果已存在同名同 parentId 的文件夹，复用该文件夹 ID，不创建新文件夹
- **书签跳过**：如果同一 folderId 下已存在相同 URL 的书签，跳过该条目

## 导出生成逻辑

```
generateBookmarkHTML(folders: BookmarkFolder[], bookmarks: Bookmark[]):
  1. 写入 HTML 头部（DOCTYPE、META、TITLE）
  2. 递归生成文件夹 <DT><H3> 和 <DL> 结构
  3. 在每个文件夹内生成书签 <DT><A> 标签
  4. 根级文件夹作为顶层 <DL> 的直接子项
```

## 边界处理

- 导入空文件或格式错误的文件：显示错误提示
- 导入过程中断（部分成功）：已写入的数据保留，提示用户哪些导入成功
- 导出空书签列表：正常生成只有头部的 HTML 文件
- 大文件导入性能：批量 IPC 单次写入，避免逐条创建
