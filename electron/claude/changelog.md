[根目录](../../CLAUDE.md) > [electron](../CLAUDE.md) > 详情

# electron/ 索引变更记录（仅最近 5 条，倒序）

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-11-17 23:45 | 全量同步 | HEAD 9fb5213：ipc 20 模块（补 sync/profile/site-data/extension-download 通道组）；services 50+（补 sync-store/sync-cookies/external-auth-*/procm）；移除已删的调试器窗口资产（debugger-window.html、debugger-preload.ts、debugger-replay-preload.ts、debugger-assets/、services/debugger.ts、RRWEB 常量）；ipc/debugger.ts 通道重校（18 通道、无 create-window）；main.ts 职责补多 Profile 启动/悬浮球/数据同步；floating-ball-preload.ts 为第二预加载入口 |
| 2026-07-29 15:39 | 重构 + 同步现状 | 拆为 index + claude/ 详情；据当前代码纠正：webview-manager 已拆 webview/ 子模块；补录 debugger.ts（rrweb）+ action-recorder/player + ipc/debugger.ts（18 通道）；ai-proxy/handlers 标注为空；store.ts 补全 schema keys（zoomPreferences/activeUpdateSourceId/restoreLastUrl/containerExtensions 等） |
| 2026-04-17 18:08 | 增量更新 | 新增 ai-proxy、mcp、plugin-*、密码/技能/Favicon/页面提取、嗅探、迁移等 |
| 2026-04-13 10:44 | 增量更新 | 新增工作区/页面/容器、分屏、下载、扩展、托盘、更新、快捷键、书签健康检查、标签冻结 |
| 2026-04-09 02:12 | 初始化 | 首次生成模块文档 |
