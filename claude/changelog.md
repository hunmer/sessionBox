[根目录](../CLAUDE.md) > 详情

# 索引变更记录（仅最近 5 条，倒序）

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-11-17 23:45 | 全量同步 + 图谱 + 自检 | HEAD 9fb5213（上次后 118 commits）：Electron 44 / 23 Store / preload 36 命名空间 / ipc 20 模块；移除已删的调试器窗口与 docs/superpowers 引用，改录悬浮球 preload、多 Profile 启动、数据同步（sync-* + server/）、vendored packages/electron-chrome-extensions、resources/plugins 内置 AI 网关插件；新增 docs/feature_map.json+.html（37 节点、676 文件+30 测试、覆盖率 100%）与 claude/report.md 四组自检 |
| 2026-07-29 15:39 | 重构 + 同步现状 | 按"CLAUDE.md 仅索引 + claude/ 详情"策略重构：根/electron/preload/src 各生成 12 文件；据当前代码纠正旧文档（移除已删除的工作流 UI/store/preload 命名空间；补录 rrweb 调试器与操作录制/回放系统、webview-manager 拆分为 webview/ 子模块、preload 实际 32 命名空间、store.ts 完整 schema keys） |
| 2026-04-17 18:08 | 增量更新 | 旧单体 CLAUDE.md：新增 AI/Agent/MCP/插件/工作流/嗅探/密码/命令面板/Favicon/页面提取/技能系统等 |
| 2026-04-13 10:44 | 增量更新 | 旧文档：新增工作区/容器/页面模型、分屏、下载、扩展、自动更新、托盘、快捷键、书签导入导出、主题预设、历史记录、Dexie |
| 2026-04-09 02:12 | 初始化 | 首次生成项目 AI 上下文，覆盖全部源码 |
