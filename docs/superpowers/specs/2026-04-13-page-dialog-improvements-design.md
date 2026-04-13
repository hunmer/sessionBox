# PageDialog 改进设计

## 变更概要

对 `src/components/sidebar/PageDialog.vue` 进行三项改进：修复输入框溢出、容器内联选择、自动创建容器 checkbox。

---

## 需求 1：输入框溢出修复

### 问题

DialogContent 没有 overflow 控制，Input 和 URL Combobox 的 Popover 下拉可能溢出对话框边界。

### 方案

1. `DialogContent` 添加 `overflow-y-auto max-h-[85vh]`，内容过多时允许滚动
2. 表单区域（flex 子项）加 `min-w-0`，防止 flex 子项撑开父容器
3. 确保 URL Combobox 的 PopoverContent 宽度跟随触发按钮（当前已有动态宽度绑定，无需改动）

### 涉及文件

- `src/components/sidebar/PageDialog.vue` — 修改 template 样式类

---

## 需求 2：容器设置用 Popover 替代打开新标签页

### 问题

当前点击容器旁的设置图标会调用 `tabStore.createTabForSite('sessionbox://containers')`，打开一个新标签页，导致对话框被遮挡。

### 方案

将设置按钮改为 Popover 触发器，弹出一个轻量的容器选择面板（参考 `ContainerMiniPopover` 的视觉风格）：

- 展示所有容器列表，带选中标记
- 点击直接设置 `containerId`
- 底部「管理容器」按钮打开 `sessionbox://containers` 新标签页（此时对话框关闭）
- 不复用 ContainerMiniPopover 组件（交互逻辑不同：选择值 vs 切换页面容器绑定），直接在 PageDialog 内实现

### 涉及文件

- `src/components/sidebar/PageDialog.vue` — 将 Settings 按钮改为 Popover + 容器列表

---

## 需求 3：自动创建新容器 checkbox

### 问题

新建页面时，如果想使用新容器，需要先去容器管理页创建，再回来选。流程割裂。

### 方案

在容器选择区域上方添加 checkbox「自动创建新容器」：

**交互流程：**
1. 默认不勾选 —— 显示原有容器下拉选择 + Popover 设置按钮
2. 勾选后 —— 隐藏容器下拉，展开折叠编辑区：
   - 容器名称 Input（自动同步页面名称，可手动修改）
   - 代理选择 Select（可选）
   - 图标默认 📦
3. 保存时 —— 如果勾选了自动创建，先调用 `containerStore.createContainer()` 创建容器，拿到新容器 ID，再创建/更新页面
4. 取消勾选 —— 恢复容器下拉选择，清除临时容器数据

**数据流：**
```
勾选 checkbox
  → autoCreateContainer = true
  → newContainerName = name.value (同步)
  → 隐藏 Select, 展开编辑区

保存
  → if autoCreateContainer:
      container = await containerStore.createContainer({
        name: newContainerName,
        icon: '📦',
        proxyId: newContainerProxyId || undefined,
        order: containerStore.containers.length
      })
      containerId = container.id
  → emit('save', { ...data, containerId })
```

### 涉及文件

- `src/components/sidebar/PageDialog.vue` — 添加 checkbox、折叠编辑区、保存逻辑

---

## 实现要点

### 编辑模式处理

当 `props.page` 存在时（编辑模式），页面已经绑定了容器，此时：
- checkbox 默认不勾选
- 如果用户勾选并创建新容器，替换原有 containerId

### 容器名称同步

- 勾选 checkbox 时，用当前页面名称初始化容器名称
- 页面名称变更时，如果容器名称未被手动修改过，自动同步
- 用一个 `isContainerNameManual` flag 追踪用户是否手动修改过容器名称

### 组件依赖

新增导入：
- `Checkbox` from `@/components/ui/checkbox`
- `Collapsible` / `CollapsibleContent` from `@/components/ui/collapsible`（或用 v-if 简单切换）
- `Label` from `@/components/ui/label`

---

## 测试场景

| 场景 | 预期 |
|------|------|
| 打开新建页面对话框，输入长名称 | 输入框不溢出，可正常输入 |
| URL Combobox 输入搜索关键词 | 下拉在对话框内正常显示 |
| 点击容器设置图标 | 弹出 Popover，展示容器列表 |
| 在 Popover 中选择容器 | containerId 更新，Popover 关闭 |
| 勾选「自动创建新容器」 | 展开编辑区，容器名称自动同步页面名 |
| 修改页面名称 | 容器名称同步更新（未手动修改时） |
| 手动修改容器名称后再改页面名 | 容器名称不自动同步 |
| 保存（勾选自动创建） | 先创建容器，再保存页面，页面绑定新容器 |
| 保存（不勾选） | 直接保存，使用选中的容器 |
| 编辑已有页面 | checkbox 默认不勾选，正常显示 |
