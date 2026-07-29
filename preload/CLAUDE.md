[根目录](../CLAUDE.md) > **preload**

# preload/ — 预加载

## 简介

Electron 预加载脚本，运行在渲染进程隔离上下文，通过 `contextBridge` 把类型安全的 IPC API 暴露为 `window.api`（**32 个命名空间**）。是主进程与渲染进程唯一通信桥梁，只做桥接不持业务状态。

## 约定（高优先级）

- 新增 IPC：同步 `preload/index.ts` + `electron/ipc/*` + `src/types/index.ts`。
- 订阅事件用 `api.on(event, cb)`，返回清理函数（卸载时调用，或用 `useIpc.ts`）。
- 暴露类型须与 `src/types/index.ts`、`services/store.ts` 一致。

> 详见 [claude/conventions.md](claude/conventions.md)。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|------|------|----------|
| [claude/overview.md](claude/overview.md) | 预加载定位与取舍 | 了解桥梁层时 |
| [claude/conventions.md](claude/conventions.md) | IPC 同步与编码约定 | 改接口前 |
| [claude/module-responsibilities.md](claude/module-responsibilities.md) | 文件职责 | 定位文件时 |
| [claude/entrypoints.md](claude/entrypoints.md) | 加载时机与构建 | 调启动时 |
| [claude/public-interfaces.md](claude/public-interfaces.md) | `window.api` 32 命名空间 + 导出类型 | 查 API 时 |
| [claude/dependencies-and-config.md](claude/dependencies-and-config.md) | 依赖 | 升级时 |
| [claude/data-model.md](claude/data-model.md) | 类型来源说明 | 改类型时 |
| [claude/testing-and-quality.md](claude/testing-and-quality.md) | 测试现状 | 评估质量时 |
| [claude/file-map.md](claude/file-map.md) | 文件清单 | 找文件时 |
| [claude/faq.md](claude/faq.md) | 常见问题 | 排错时 |
| [claude/changelog.md](claude/changelog.md) | 文档变更记录 | 查历史时 |

## 扫描状态

- 更新时间：2026-07-29 15:39
- 已扫描：`preload/index.ts`、`preload/index.d.ts`。
- 纠正：命名空间数 32（补 theme/system/debugger，移除 workflow 系列）。
