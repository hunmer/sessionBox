# Task Plan: SessionBox 多账号浏览器工具

## Goal
基于 Electron + Vue 3 + shadcn-vue + Vite + TailwindCSS，构建一个支持多账号（partition）隔离的浏览器工具，包含侧边栏分组管理、多标签页、代理管理和 WebContentsView 集成。

## Current Phase
Phase 8

## Phases

### Phase 1: 项目初始化与基础配置
- [ ] 使用 electron-vite 初始化项目（Vue 3 + TypeScript 模板）
- [ ] 安装依赖：tailwindcss、pinia、vuedraggable、electron-store
- [ ] 配置 shadcn-vue（components.json）并添加基础组件
- [ ] 配置 TailwindCSS 深色主题配色方案
- [ ] 设置目录结构（electron/、src/、preload/）
- **Status:** complete

### Phase 2: 主进程基础架构
- [ ] electron/main.ts — 窗口创建、生命周期管理
- [ ] electron/services/store.ts — electron-store 封装（JSON 持久化）
- [ ] electron/utils/user-agent.ts — UA 覆盖逻辑
- [ ] preload/index.ts — IPC API 暴露（contextBridge）
- [ ] electron/ipc/index.ts — IPC 处理器统一注册
- **Status:** complete

### Phase 3: 数据模型与状态管理
- [x] src/types/index.ts — TypeScript 类型定义（Proxy、Group、Account、Tab、NavState）
- [x] src/stores/account.ts — 账号/分组 Pinia store
- [x] src/stores/tab.ts — Tab 状态 Pinia store
- [x] src/stores/proxy.ts — 代理 Pinia store
- [x] src/composables/useIpc.ts — IPC 调用封装
- **Status:** complete

### Phase 4: 侧边栏 UI
- [x] src/components/sidebar/Sidebar.vue — 侧边栏容器（可折叠）
- [x] src/components/sidebar/GroupList.vue — 分组列表（拖拽排序）
- [x] src/components/sidebar/GroupItem.vue — 单个分组（可折叠）
- [x] src/components/sidebar/AccountItem.vue — 账号项（图标+名称+代理标记+菜单）
- [x] src/composables/useDragSort.ts — 拖拽排序通用逻辑
- [x] 编辑账号/分组的 Dialog 弹窗
- **Status:** complete

### Phase 5: 标签栏与工具栏
- [x] src/components/tabs/TabBar.vue — 标签栏容器（拖拽排序）
- [x] src/components/tabs/TabItem.vue — 单个标签
- [x] src/components/toolbar/BrowserToolbar.vue — 后退/前进/刷新/地址栏
- [x] 新建 tab 的账号选择 dropdown
- [x] Tab 状态与工具栏联动
- **Status:** complete

### Phase 6: WebContentsView 集成
- [x] electron/services/webview-manager.ts — WebContentsView 生命周期管理
- [x] electron/ipc/tab.ts — Tab 相关 IPC（创建/关闭/切换/导航）
- [x] 位置同步：ResizeObserver + IPC bounds 更新 + DPI 处理
- [x] Tab 切换可见性管理
- [x] 主进程 → 渲染进程事件转发（title/url/navState 更新）
- **Status:** complete

### Phase 7: 代理管理
- [x] electron/services/proxy.ts — 代理设置应用（session.setProxy）
- [x] electron/ipc/proxy.ts — 代理 IPC（CRUD + 测试）
- [x] src/components/proxy/ProxyDialog.vue — 代理管理弹窗
- [x] 代理测试功能（请求 httpbin.org/ip）
- [x] 代理绑定到分组/账号（Select 下拉）
- [x] 代理热更新（修改后自动刷新受影响的页面）
- **Status:** complete

### Phase 8: 边界场景与收尾
- [x] 级联操作：删除账号（先关闭 tab）、删除分组（检查是否为空）、删除代理（清除引用）
- [x] 应用退出保存 tab 状态 + 启动恢复
- [x] 关闭最后一个 tab 的空状态引导页
- [x] 全局样式优化与细节打磨
- [x] 端到端功能验证
- **Status:** complete

## Key Questions
1. electron-vite 的 WebContentsView 项目模板如何配置？→ 需研究
2. WebContentsView 在 Windows 上的 DPI 缩放处理方式？→ 需验证
3. shadcn-vue 在 electron-vite 项目中的集成步骤？→ 需确认

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| WebContentsView（而非 webview 标签） | 用户选择，较新 API，官方推荐 |
| electron-store JSON 持久化 | 简单轻量，适合工具类应用 |
| 深色主题 + emerald 点缀 | 用户要求不用紫色，深色主题适合浏览器工具 |
| vuedraggable 拖拽排序 | 基于 SortableJS，Vue 3 生态成熟方案 |
| Pinia 状态管理 | Vue 3 官方推荐，TypeScript 支持好 |
| 同账号多 tab 共享 session | 用户确认，通过相同 partition 实现 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       | 1       |            |

## Notes
- 设计文档：docs/superpowers/specs/2026-04-08-session-box-design.md
- 每个阶段完成后更新 phase status：pending → in_progress → complete
- 重大决策前重读 plan 文件保持目标清晰
- 记录所有错误避免重复
