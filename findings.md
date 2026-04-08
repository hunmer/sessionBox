# Findings & Decisions

## Requirements
- 多账号浏览器工具，每个账号独立 session（partition 隔离）
- 左侧可折叠侧边栏：分组 → 账号列表，支持拖拽排序
- 右侧 tabs + webview，支持多 tab、拖拽排序、状态持久化
- webview 顶部工具栏：后退、前进、刷新、地址栏
- 代理管理：socks5/http/https，测试连接，绑定到分组或账号
- UA 覆盖为 Chrome 标准 UA
- 深色主题，不用紫色，使用 emerald 强调色

## Research Findings
- 设计文档已完成并通过审查，路径：docs/superpowers/specs/2026-04-08-session-box-design.md
- 审查修复项：级联删除策略、代理热更新、运行时/持久化模型区分、NavState 类型定义

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Electron WebContentsView | 用户选择，替代 BrowserView 的新 API |
| electron-store | JSON 文件持久化，简单可靠 |
| electron-vite 构建 | Electron + Vite 集成方案，支持主进程/渲染进程/preload 三端构建 |
| shadcn-vue | 基于 Radix Vue 的 Vue 3 组件库，可定制性强 |
| vuedraggable | Vue 3 拖拽排序，基于 SortableJS |
| partition 格式 persist:account-{id} | 使用 persist 前缀确保 session 跨重启保留 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 审查发现删除账号无级联策略 | 已在设计文档补充：先关闭所有 tab 再删除 |
| 代理修改后运行中 session 未更新 | 已补充热更新方案：setProxy + 自动刷新 |

## Resources
- 设计文档：docs/superpowers/specs/2026-04-08-session-box-design.md
- electron-vite: https://electron-vite.org/
- shadcn-vue: https://www.shadcn-vue.com/
- WebContentsView API: Electron 33+ 新 API

## Visual/Browser Findings
-

---
*Update this file after every 2 view/browser/search operations*
