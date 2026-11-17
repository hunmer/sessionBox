[根目录](../../CLAUDE.md) > [preload](../CLAUDE.md) > 详情

# preload/ 索引变更记录（仅最近 5 条，倒序）

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-11-17 23:45 | 全量同步 | HEAD 9fb5213：命名空间 32→36（新增 wallpaper/siteData/sync/data/profile，实测 api 对象顶层键）；index.ts 885 行；调试器 preload 引用改为悬浮球 `electron/floating-ball-preload.ts`（第二构建入口）；debugger 命名空间职责更新（录制回放+preset，无窗口方法）；补 5 个新命名空间方法级职责 |
| 2026-07-29 15:39 | 重构 + 同步现状 | 拆为 index + claude/ 详情；据当前代码纠正：命名空间数 32（非 33）；补录 theme/system/debugger；移除已不存在的 workflow/workflowFolder/workflowVersion/executionLog 命名空间 |
| 2026-04-17 18:08 | 增量更新 | 新增 chat/ai-provider/browser/workflow 等命名空间（含现已移除项） |
| 2026-04-13 10:44 | 增量更新 | 更新 IPC API 列表 |
| 2026-04-09 02:12 | 初始化 | 首次生成模块文档 |
