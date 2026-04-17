# 工具分层披露改造计划

## 目标
将当前一次性暴露全部浏览器业务工具的方式，改造成按分类、工具列表、工具详情、执行四层逐步披露的 MVP。

## 阶段
1. [in_progress] 调研现有工具注册、prompt、执行链路。
2. [pending] 设计最小类型与 registry，保持现有业务工具兼容。
3. [pending] 实现发现工具：list_categories、list_tools_by_category、get_tool_detail、execute_tool。
4. [pending] 调整 agent 暴露策略与 system prompt 规则。
5. [pending] 记录用户可执行的验证步骤。

## 约束
- 不执行 git 提交或分支操作。
- 先读后写，避免改动无关文件。
- 完成后给出测试步骤，由用户执行验证。

## 错误记录
暂无。
