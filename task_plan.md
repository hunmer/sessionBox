# 工具分层披露改造计划

## 目标
将当前一次性暴露全部浏览器业务工具的方式，改造成按分类、工具列表、工具详情、执行四层逐步披露的 MVP。

## 阶段
1. [complete] 调研现有工具注册、prompt、执行链路。
2. [complete] 设计最小类型与 registry，保持现有业务工具兼容。
3. [complete] 实现发现工具：list_categories、list_tools_by_category、get_tool_detail、execute_tool。
4. [complete] 调整 agent 暴露策略与 system prompt 规则。
5. [complete] 记录用户可执行的验证步骤。

## 约束
- 不执行 git 提交或分支操作。
- 先读后写，避免改动无关文件。
- 完成后给出测试步骤，由用户执行验证。

## 错误记录
| 错误 | 尝试 | 结论 |
| --- | --- | --- |
| `tsc --noEmit` 报多个类型错误 | 执行 `npx tsc -p tsconfig.web.json --noEmit` 和 `npx tsc -p tsconfig.node.json --noEmit` | 主要为项目既有类型问题；本次改造相关的 `tools.ts` 引用、`enabledToolNames`、IPC 类型已处理，实际 `electron-vite build` 通过。 |
