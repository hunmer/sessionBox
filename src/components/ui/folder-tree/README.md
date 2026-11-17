# FolderTree 文件夹树

侧栏文件夹/标签树组件，移植自 mira-client 的 `FolderTreeComponent`（Vue 版原生实现）。在源 UI 展示效果基础上扩展了交互注入能力（右键菜单、行尾操作区、拖拽排序、外部拖放、折叠状态受控），可直接承载业务树（如 SessionBox 左侧栏账号分组）。

视觉特性（与源一致）：

- **SVG 分支连线三层覆盖**
  - 基础层：灰色，节点首次出现时 SMIL 描画入场（`stroke-dashoffset 105→0`）
  - hover 层：半透明（0.45），悬停节点时其祖先链 200ms 点亮，移出 120ms 延迟熄灭
  - active 层：选中节点的祖先链 300ms 全亮
  - 连线颜色取父节点 `color`（hex），缺省用主题色 `var(--primary)`
- **展开/折叠**：`grid-template-rows 0fr↔1fr` 高度过渡 + 子行 `translateX(±24px)` 滑入/滑出（240ms `cubic-bezier(0.23,1,0.32,1)`）
- **计数逐位弹出**：count 变化时每一位数字依次上浮淡入（500ms，stagger 70ms，带模糊），位间延迟最多支持 3 位
- **搜索框**：标题栏按钮展开/收起，`grid-rows` 高度过渡 + 上滑淡入；过滤时子命中保留父链、父命中保留全部子，并强制展开
- **基础分类**（仅 folder 模式）：全部素材 / 未分类 / 未打标 / 回收站，回收站图标为 destructive 色
- **图标**：18px，支持 http(s) URL（favicon），加载失败自动回退 lucide 图标
- 空状态、`prefers-reduced-motion` 降级、dark 模式（颜色桥接主题变量）

主题变量桥接：`--primary` / `--border` / `--foreground` / `--muted-foreground` / `--destructive` / `--muted`，缺省时使用内置 fallback。

## 用法

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { FolderTree, type FolderTreeNodeData } from '@/components/ui/folder-tree'

const selectedKey = ref<string>()
const nodes: FolderTreeNodeData[] = [
  {
    id: 'design',
    label: '设计灵感',
    color: '#f59e0b', // 分支线颜色
    count: 24,
    open: true,
    children: [
      { id: 'motion', label: 'UI 动效', count: 12, children: [
        { id: 'trans', label: '转场动效', count: 6 },
        { id: 'micro', label: '微交互', count: 7 },
      ]},
      { id: 'color', label: '配色方案', count: 8 },
    ],
  },
  {
    id: 'dev',
    label: '开发资源',
    color: '#3b82f6',
    count: 31,
    children: [
      // icon 支持 http(s) URL（favicon），失败自动回退默认图标
      { id: 'lib', label: '组件库', icon: 'https://www.google.com/s2/favicons?domain=github.com&sz=32', count: 9 },
    ],
  },
]
</script>

<template>
  <FolderTree
    v-model:selected-key="selectedKey"
    show-base-categories
    :nodes="nodes"
    @select="(id) => console.log('select', id)"
  />
</template>
```

## Props

| Prop | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `itemType` | `'folder' \| 'tag'` | `'folder'` | 决定默认标题（文件夹/标签）、默认图标与空状态 |
| `nodes` | `FolderTreeNodeData[]` | `[]` | 树数据（支持多层） |
| `title` | `string` | 按 itemType | 标题栏文字 |
| `showBaseCategories` | `boolean` | `false` | 展示顶部基础分类（仅 folder 模式） |
| `baseCategories` | `BaseCategoryData[]` | 内置四项 | 自定义基础分类 |
| `defaultShowSearch` | `boolean` | `false` | 初始展开搜索框 |
| `emptyText` | `string` | `暂无{title}…` | 空状态文案 |
| `hideHeader` | `boolean` | `false` | 不渲染标题栏（嵌入已有分组标题的容器用） |
| `maxHeight` | `string \| false` | `'16rem'` | 滚动区最大高度；`false` 时不限高不滚动（跟随容器） |
| `hideEmpty` | `boolean` | `false` | 隐藏内置空状态（业务自渲染） |
| `draggable` | `boolean` | `false` | 行可拖拽排序（HTML5 DnD，`application/x-folder-tree` MIME） |
| `openStates` | `Record<string, boolean>` | — | 折叠状态受控初值（按 node.id 覆盖 `open`，用户手动操作优先） |
| `menuRenderer` | `(node) => VNode \| null` | — | 非空时行包右键菜单（ContextMenu），VNode 渲染进菜单内容 |
| `actionsRenderer` | `(node) => VNode \| null` | — | 行尾操作区内容；VNode 内带 `.ft-action-hover` 类的元素仅行 hover 时显示 |

## v-model / Emits

| 名称 | 说明 |
| --- | --- |
| `v-model:selected-key` | 选中节点 id（树行 + 基础分类共用） |
| `@select` | 选中回调 `(id: string)`，与 v-model 同时触发 |
| `@node-click` | 行点击 `(id: string)`，先于选中/折叠语义触发（业务做单击/双击判定用） |
| `@open-change` | 折叠状态变化 `(states: Record<string, boolean>)`，返回全量快照（业务持久化） |
| `@node-drop` | 内部拖拽落点 `({ dragId, targetId, position })`，position 为 `before/after/inside` |
| `@node-external-dragover` | 外部拖入悬停 `(node, event)`；业务 `event.preventDefault()` 后行高亮 |
| `@node-external-dragleave` | 外部拖入离开行 `(node)` |
| `@node-external-drop` | 外部拖入松手 `(node, event)` |

## 数据类型

```ts
interface FolderTreeNodeData {
  id: string
  label: string
  icon?: string          // ICONS 键（folder/folder_open/folder_special/label/label_off/delete）、http(s)/site-icon:// URL（img，失败回退）、`lucide:名称`、`img:本地id`（account-icon://）、其他非空字符串按 emoji 文本渲染
  count?: number         // 0/undefined 不渲染；变化时逐位弹出动画
  color?: string         // 分支线颜色（hex），子节点连线用它，缺省 var(--primary)
  selectable?: boolean   // false 时行点击仅折叠/展开，不触发选中（默认 true）
  children?: FolderTreeNodeData[]
  open?: boolean         // 初始展开（openStates prop 同 key 覆盖优先）
}

interface BaseCategoryData {
  id: string
  label: string
  icon?: string
  iconColor?: 'muted' | 'destructive'
  count?: number
}
```

## 行为语义（同源组件）

- 有子节点的行：折叠态点击 = 展开 + 选中；展开态点击 = 仅折叠
- 叶子行：点击 = 选中
- chevron 始终显示在行尾（即使无子节点层级也有缩进对齐）
- 搜索期间强制全部展开，关闭搜索框自动清空关键词
- `nodes` 数据更新（如轮询刷新 count）不会重置用户手动折叠/展开状态
- `selectable: false` 的行：点击仅折叠/展开，不触发 select 与 v-model
- chevron 独立响应点击（`@click.stop`），仅折叠子级不影响行选中
- 内部拖拽：目标行上 30% 判 `before`、下 30% 判 `after`、中部判 `inside`（无子节点退化为 `after`），插入线/高亮框反馈由组件内置；`inside` 是否合法由业务在 `@node-drop` 里裁决
- 外部拖放：业务在 `@node-external-dragover` 中 `preventDefault()` 即表示接受，组件对目标行加高亮；dragleave/drop 自动清理

## 实现备注（移植时踩过的坑）

- 动态连线颜色必须走内联 `style`（`stroke` presentation attribute 不支持 `var()`，整层会隐形）
- rAF 防重入守卫在卸载清理时必须归零，否则一次 cancel 之后测量调度死锁，SVG 停留 1×1 空壳

## 文件结构

- `FolderTree.vue` — 主组件（标题栏/基础分类/滚动区/SVG 三层/空状态）
- `FolderTreeNode.vue` — 递归树行（展开动画、digit pop 指令）
- `FolderTreeHeader.vue` — 标题栏 + 搜索框
- `FolderTreeBaseCategories.vue` — 基础分类
- `NodeIcon.vue` — 图标（URL + 回退）
- `useBranchLines.ts` — 分支线测量 composable
- `types.ts` — 类型、常量与工具函数
