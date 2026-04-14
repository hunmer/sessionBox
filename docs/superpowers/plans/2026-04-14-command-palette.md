# Command Palette 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现插件式命令面板，`Cmd/Ctrl+K` 触发，支持 `bookmark/page/tab/history` 前缀搜索及全局命令。

**Architecture:** 每个 数据源 (bookmark/page/tab/history) 实现 `CommandProvider` 接口，注册到 `useCommandPalette` composable 的中心注册表。前缀解析器根据输入第一个 token 匹配 Provider，匹配到则仅查询该 Provider，否则查询全部。组件使用已有的 `CommandDialog` (shadcn-vue)。

**Tech Stack:** Vue 3 Composition API, @vueuse/core (useMagicKeys), shadcn-vue Command/Dialog, lucide-vue-next, Pinia stores, Dexie (history)

**注意：** 项目当前无测试框架，不包含测试步骤。每个 Task 以可编译运行的提交为验收标准。

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/types/command.ts` | 创建 | CommandItem, CommandProvider 接口定义 |
| `src/composables/useCommandPalette.ts` | 创建 | Provider 注册表、前缀解析、搜索状态管理 |
| `src/components/command-palette/providers/bookmark.ts` | 创建 | BookmarkProvider 实现 |
| `src/components/command-palette/providers/page.ts` | 创建 | PageProvider 实现 |
| `src/components/command-palette/providers/tab.ts` | 创建 | TabProvider 实现 |
| `src/components/command-palette/providers/history.ts` | 创建 | HistoryProvider 实现 |
| `src/components/command-palette/providers/global.ts` | 创建 | GlobalCommandProvider 实现 |
| `src/components/command-palette/providers/index.ts` | 创建 | 注册所有 Provider 并导出 |
| `src/components/command-palette/CommandPaletteDialog.vue` | 创建 | Dialog 组件，组合 CommandDialog + useCommandPalette |
| `src/App.vue` | 修改 | 导入并挂载 CommandPaletteDialog |

---

### Task 1: 定义类型接口

**Files:**
- Create: `src/types/command.ts`

- [ ] **Step 1: 创建 CommandItem 和 CommandProvider 接口**

```typescript
// src/types/command.ts

import type { Component } from 'vue'

/** 命令面板中的单个可选项 */
export interface CommandItem {
  /** 唯一标识 */
  id: string
  /** 显示名称 */
  label: string
  /** 副标题（如 URL、描述） */
  description?: string
  /** lucide 图标组件 */
  icon?: Component
  /** 右侧显示的快捷键提示 */
  shortcut?: string
  /** 额外搜索关键词（提升模糊匹配率） */
  keywords?: string[]
  /** 选中时执行的动作 */
  run: () => void | Promise<void>
}

/** 命令数据源提供者接口 */
export interface CommandProvider {
  /** 提供者唯一标识 */
  id: string
  /** 触发前缀（完整形式，如 'bookmark'） */
  prefix: string
  /** 触发前缀（简写形式，如 'bm'） */
  prefixShort?: string
  /** 分组标题 */
  label: string
  /** 分组图标 */
  icon: Component
  /** 根据关键词搜索并返回匹配项 */
  search(query: string): Promise<CommandItem[]>
}
```

- [ ] **Step 2: 提交**

```bash
git add src/types/command.ts
git commit -m "feat(command-palette): add CommandItem and CommandProvider type definitions"
```

---

### Task 2: 实现 useCommandPalette composable

**Files:**
- Create: `src/composables/useCommandPalette.ts`
- Depends on: Task 1 (`src/types/command.ts`)

- [ ] **Step 1: 实现 composable — 注册表、前缀解析、搜索**

```typescript
// src/composables/useCommandPalette.ts

import { ref, shallowRef, type Component } from 'vue'
import type { CommandItem, CommandProvider } from '@/types/command'
import { Search } from 'lucide-vue-next'

export interface ParsedQuery {
  /** 匹配到的 Provider（null 表示无匹配或空输入） */
  provider: CommandProvider | null
  /** 搜索关键词 */
  query: string
}

export function useCommandPalette() {
  const providers = shallowRef<CommandProvider[]>([])
  const results = ref<Map<string, CommandItem[]>>(new Map())
  const loading = ref(false)

  /** 注册一个 Provider */
  function registerProvider(provider: CommandProvider) {
    providers.value = [...providers.value, provider]
  }

  /** 批量注册 Provider */
  function registerProviders(list: CommandProvider[]) {
    providers.value = [...providers.value, ...list]
  }

  /** 解析输入的前缀，返回匹配的 Provider 和剩余 query */
  function parseQuery(input: string): ParsedQuery {
    const trimmed = input.trim()
    if (!trimmed) return { provider: null, query: '' }

    const spaceIdx = trimmed.indexOf(' ')
    const firstToken = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase()
    const restQuery = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()

    // 前缀完全匹配时，空 query 也算有效（用户输入 "bookmark " 后等待输入关键词）
    // 但如果 firstToken 后面没有空格（用户还在打字前缀），不触发匹配
    if (spaceIdx === -1) {
      return { provider: null, query: trimmed }
    }

    const matched = providers.value.find(
      (p) => p.prefix.toLowerCase() === firstToken || (p.prefixShort && p.prefixShort.toLowerCase() === firstToken)
    )

    if (matched) {
      return { provider: matched, query: restQuery }
    }

    return { provider: null, query: trimmed }
  }

  /** 执行搜索 */
  async function search(input: string) {
    const { provider, query } = parseQuery(input)
    const resultMap = new Map<string, CommandItem[]>()
    loading.value = true

    try {
      if (provider) {
        // 单一 Provider 搜索
        const items = await provider.search(query)
        resultMap.set(provider.id, items)
      } else if (!input.trim()) {
        // 空输入：查找全局命令 Provider
        const globalProvider = providers.value.find((p) => p.prefix === '')
        if (globalProvider) {
          const items = await globalProvider.search('')
          resultMap.set(globalProvider.id, items)
        }
      } else {
        // 无前缀匹配：跨所有 Provider 搜索
        const settled = await Promise.allSettled(
          providers.value
            .filter((p) => p.prefix !== '') // 排除全局命令 Provider
            .map(async (p) => {
              const items = await p.search(input.trim())
              return { id: p.id, items }
            })
        )
        for (const r of settled) {
          if (r.status === 'fulfilled' && r.value.items.length > 0) {
            resultMap.set(r.value.id, r.value.items)
          }
        }
      }
    } finally {
      loading.value = false
    }

    results.value = resultMap
  }

  return {
    providers,
    results,
    loading,
    registerProvider,
    registerProviders,
    parseQuery,
    search,
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/composables/useCommandPalette.ts
git commit -m "feat(command-palette): add useCommandPalette composable with registry and prefix parser"
```

---

### Task 3: 实现 BookmarkProvider

**Files:**
- Create: `src/components/command-palette/providers/bookmark.ts`
- Depends on: Task 1

- [ ] **Step 1: 实现 BookmarkProvider**

```typescript
// src/components/command-palette/providers/bookmark.ts

import type { CommandProvider, CommandItem } from '@/types/command'
import { Bookmark } from 'lucide-vue-next'
import { useBookmarkStore } from '@/stores/bookmark'
import { useTabStore } from '@/stores/tab'

export function createBookmarkProvider(): CommandProvider {
  return {
    id: 'bookmark',
    prefix: 'bookmark',
    prefixShort: 'bm',
    label: '书签',
    icon: Bookmark,
    async search(query: string): Promise<CommandItem[]> {
      const bookmarkStore = useBookmarkStore()
      const tabStore = useTabStore()
      const q = query.toLowerCase()

      const filtered = q
        ? bookmarkStore.bookmarks.filter(
            (b) =>
              b.title.toLowerCase().includes(q) ||
              b.url.toLowerCase().includes(q)
          )
        : bookmarkStore.bookmarks.slice(0, 20)

      return filtered.map((b) => ({
        id: `bookmark-${b.id}`,
        label: b.title || b.url,
        description: b.url,
        icon: Bookmark,
        keywords: [b.title, b.url],
        run: () => {
          const tab = tabStore.activeTab
          if (tab) tabStore.navigate(tab.id, b.url)
        },
      }))
    },
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/components/command-palette/providers/bookmark.ts
git commit -m "feat(command-palette): add BookmarkProvider"
```

---

### Task 4: 实现 PageProvider

**Files:**
- Create: `src/components/command-palette/providers/page.ts`
- Depends on: Task 1

- [ ] **Step 1: 实现 PageProvider**

```typescript
// src/components/command-palette/providers/page.ts

import type { CommandProvider, CommandItem } from '@/types/command'
import { LayoutGrid } from 'lucide-vue-next'
import { usePageStore } from '@/stores/page'
import { useTabStore } from '@/stores/tab'

export function createPageProvider(): CommandProvider {
  return {
    id: 'page',
    prefix: 'page',
    prefixShort: 'p',
    label: '页面',
    icon: LayoutGrid,
    async search(query: string): Promise<CommandItem[]> {
      const pageStore = usePageStore()
      const tabStore = useTabStore()
      const q = query.toLowerCase()

      const filtered = q
        ? pageStore.pages.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.url.toLowerCase().includes(q)
          )
        : pageStore.pages.slice(0, 20)

      return filtered.map((p) => ({
        id: `page-${p.id}`,
        label: p.name,
        description: p.url,
        icon: LayoutGrid,
        keywords: [p.name, p.url],
        run: () => {
          const tab = tabStore.activeTab
          if (tab) tabStore.navigate(tab.id, p.url)
        },
      }))
    },
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/components/command-palette/providers/page.ts
git commit -m "feat(command-palette): add PageProvider"
```

---

### Task 5: 实现 TabProvider

**Files:**
- Create: `src/components/command-palette/providers/tab.ts`
- Depends on: Task 1

- [ ] **Step 1: 实现 TabProvider**

```typescript
// src/components/command-palette/providers/tab.ts

import type { CommandProvider, CommandItem } from '@/types/command'
import { AppWindow } from 'lucide-vue-next'
import { useTabStore } from '@/stores/tab'

export function createTabProvider(): CommandProvider {
  return {
    id: 'tab',
    prefix: 'tab',
    prefixShort: 't',
    label: '标签页',
    icon: AppWindow,
    async search(query: string): Promise<CommandItem[]> {
      const tabStore = useTabStore()
      const q = query.toLowerCase()

      const filtered = q
        ? tabStore.tabs.filter(
            (t) =>
              t.title.toLowerCase().includes(q) ||
              t.url.toLowerCase().includes(q)
          )
        : tabStore.tabs.slice(0, 20)

      return filtered.map((t) => ({
        id: `tab-${t.id}`,
        label: t.title || t.url,
        description: t.url,
        icon: AppWindow,
        keywords: [t.title, t.url],
        run: () => {
          tabStore.switchTab(t.id)
        },
      }))
    },
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/components/command-palette/providers/tab.ts
git commit -m "feat(command-palette): add TabProvider"
```

---

### Task 6: 实现 HistoryProvider

**Files:**
- Create: `src/components/command-palette/providers/history.ts`
- Depends on: Task 1

- [ ] **Step 1: 实现 HistoryProvider**

注意：History Store 的搜索是异步的（IndexedDB）。

```typescript
// src/components/command-palette/providers/history.ts

import type { CommandProvider, CommandItem } from '@/types/command'
import { History } from 'lucide-vue-next'
import { useHistoryStore } from '@/stores/history'
import { useTabStore } from '@/stores/tab'

export function createHistoryProvider(): CommandProvider {
  return {
    id: 'history',
    prefix: 'history',
    prefixShort: 'h',
    label: '历史记录',
    icon: History,
    async search(query: string): Promise<CommandItem[]> {
      const historyStore = useHistoryStore()
      const tabStore = useTabStore()

      if (!query) {
        // 无 query 时返回最近 20 条
        const recent = await historyStore.getRecentHistory(20)
        return recent.map((e) => ({
          id: `history-${e.id}`,
          label: e.title || e.url,
          description: e.url,
          icon: History,
          keywords: [e.title, e.url],
          run: () => {
            const tab = tabStore.activeTab
            if (tab) tabStore.navigate(tab.id, e.url)
          },
        }))
      }

      const entries = await historyStore.searchHistory(query, 20)
      return entries.map((e) => ({
        id: `history-${e.id}`,
        label: e.title || e.url,
        description: e.url,
        icon: History,
        keywords: [e.title, e.url],
        run: () => {
          const tab = tabStore.activeTab
          if (tab) tabStore.navigate(tab.id, e.url)
        },
      }))
    },
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/components/command-palette/providers/history.ts
git commit -m "feat(command-palette): add HistoryProvider"
```

---

### Task 7: 实现 GlobalCommandProvider

**Files:**
- Create: `src/components/command-palette/providers/global.ts`
- Depends on: Task 1

- [ ] **Step 1: 实现 GlobalCommandProvider**

prefix 为空字符串，仅在无输入时激活。提供常用操作命令列表。

```typescript
// src/components/command-palette/providers/global.ts

import type { CommandProvider, CommandItem } from '@/types/command'
import { Plus, X, PanelLeft, Settings, Bookmark, History, Download } from 'lucide-vue-next'
import { useTabStore } from '@/stores/tab'

export function createGlobalCommandProvider(
  callbacks: {
    toggleSidebar: () => void
    openSettings: () => void
  }
): CommandProvider {
  return {
    id: 'global',
    prefix: '',
    label: '命令',
    icon: Settings,
    async search(query: string): Promise<CommandItem[]> {
      const tabStore = useTabStore()
      const q = query.toLowerCase()

      const commands: CommandItem[] = [
        {
          id: 'cmd-new-tab',
          label: '新建标签页',
          icon: Plus,
          shortcut: '⌘T',
          keywords: ['new', 'tab', '新建', '标签'],
          run: () => {
            const pageId = tabStore.activeTab?.pageId
            if (pageId) tabStore.createTab(pageId)
          },
        },
        {
          id: 'cmd-close-tab',
          label: '关闭当前标签页',
          icon: X,
          shortcut: '⌘W',
          keywords: ['close', 'tab', '关闭', '标签'],
          run: () => {
            const tab = tabStore.activeTab
            if (tab) tabStore.closeTab(tab.id)
          },
        },
        {
          id: 'cmd-toggle-sidebar',
          label: '切换侧边栏',
          icon: PanelLeft,
          shortcut: '⌘B',
          keywords: ['sidebar', 'toggle', '侧边栏'],
          run: () => callbacks.toggleSidebar(),
        },
        {
          id: 'cmd-open-settings',
          label: '打开设置',
          icon: Settings,
          shortcut: '⌘,',
          keywords: ['settings', '设置', '配置'],
          run: () => callbacks.openSettings(),
        },
        {
          id: 'cmd-open-bookmarks',
          label: '打开书签管理',
          icon: Bookmark,
          keywords: ['bookmark', '书签', '管理'],
          run: () => tabStore.openInternalPage('bookmarks'),
        },
        {
          id: 'cmd-open-history',
          label: '打开历史记录',
          icon: History,
          keywords: ['history', '历史', '记录'],
          run: () => tabStore.openInternalPage('history'),
        },
        {
          id: 'cmd-open-downloads',
          label: '打开下载管理',
          icon: Download,
          keywords: ['download', '下载', '管理'],
          run: () => tabStore.openInternalPage('downloads'),
        },
      ]

      if (!q) return commands
      return commands.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          (c.keywords && c.keywords.some((k) => k.toLowerCase().includes(q)))
      )
    },
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/components/command-palette/providers/global.ts
git commit -m "feat(command-palette): add GlobalCommandProvider with common commands"
```

---

### Task 8: 创建 Provider 注册入口

**Files:**
- Create: `src/components/command-palette/providers/index.ts`
- Depends on: Tasks 3-7

- [ ] **Step 1: 注册所有 Provider 并导出工厂函数**

```typescript
// src/components/command-palette/providers/index.ts

import type { CommandProvider } from '@/types/command'
import { createBookmarkProvider } from './bookmark'
import { createPageProvider } from './page'
import { createTabProvider } from './tab'
import { createHistoryProvider } from './history'
import { createGlobalCommandProvider } from './global'

interface GlobalCallbacks {
  toggleSidebar: () => void
  openSettings: () => void
}

/** 创建并返回所有已注册的 Provider 列表 */
export function createAllProviders(callbacks: GlobalCallbacks): CommandProvider[] {
  return [
    createGlobalCommandProvider(callbacks),
    createBookmarkProvider(),
    createPageProvider(),
    createTabProvider(),
    createHistoryProvider(),
  ]
}
```

- [ ] **Step 2: 提交**

```bash
git add src/components/command-palette/providers/index.ts
git commit -m "feat(command-palette): add provider registry entry point"
```

---

### Task 9: 实现 CommandPaletteDialog 组件

**Files:**
- Create: `src/components/command-palette/CommandPaletteDialog.vue`
- Depends on: Tasks 2, 8

- [ ] **Step 1: 创建 Dialog 组件**

组件使用已有的 `CommandDialog`，结合 `useCommandPalette` composable。通过 `useMagicKeys` 监听 `Cmd/Ctrl+K`。

```vue
<!-- src/components/command-palette/CommandPaletteDialog.vue -->

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMagicKeys, whenever } from '@vueuse/core'
import CommandDialog from '@/components/ui/command/CommandDialog.vue'
import CommandInput from '@/components/ui/command/CommandInput.vue'
import CommandList from '@/components/ui/command/CommandList.vue'
import CommandEmpty from '@/components/ui/command/CommandEmpty.vue'
import CommandGroup from '@/components/ui/command/CommandGroup.vue'
import CommandItem from '@/components/ui/command/CommandItem.vue'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { createAllProviders } from './providers'
import type { CommandItem as CommandItemType } from '@/types/command'

const props = defineProps<{
  toggleSidebar: () => void
  openSettings: () => void
}>()

const emit = defineEmits<{
  (e: 'run'): void
}>()

const open = ref(false)
const input = ref('')

const { providers, results, loading, search, registerProviders } = useCommandPalette()

// 注册所有 Provider（只执行一次）
registerProviders(
  createAllProviders({
    toggleSidebar: props.toggleSidebar,
    openSettings: props.openSettings,
  })
)

// 快捷键 Cmd/Ctrl+K
const { meta_k, ctrl_k } = useMagicKeys()
whenever(meta_k!, () => {
  open.value = true
})
whenever(ctrl_k!, () => {
  open.value = true
})

// 输入变化时搜索（防抖 150ms）
let debounceTimer: ReturnType<typeof setTimeout> | null = null
watch(input, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    search(val)
  }, 150)
})

// 打开时初始化搜索
watch(open, (val) => {
  if (val) {
    input.value = ''
    search('')
  }
})

// 选中项目
function handleSelect(item: CommandItemType) {
  open.value = false
  item.run()
  emit('run')
}

// 获取 Provider 的分组标题（排除无搜索结果的分组）
const visibleGroups = computed(() => {
  return providers.value.filter((p) => results.value.has(p.id))
})
</script>

<template>
  <CommandDialog v-model:open="open" title="命令面板" description="搜索书签、页面、标签页或输入命令...">
    <CommandInput v-model="input" placeholder="输入命令或搜索..." />
    <CommandList>
      <CommandEmpty v-if="!loading && input.trim() && visibleGroups.length === 0">
        未找到结果
      </CommandEmpty>
      <CommandGroup
        v-for="provider in visibleGroups"
        :key="provider.id"
        :heading="provider.label"
      >
        <CommandItem
          v-for="item in results.get(provider.id)"
          :key="item.id"
          :value="item.label + ' ' + (item.description || '') + ' ' + (item.keywords?.join(' ') || '')"
          @select="handleSelect(item)"
        >
          <component :is="item.icon" class="mr-2 h-4 w-4 shrink-0" />
          <div class="flex flex-1 flex-col overflow-hidden">
            <span class="truncate text-sm">{{ item.label }}</span>
            <span v-if="item.description" class="truncate text-xs text-muted-foreground">
              {{ item.description }}
            </span>
          </div>
          <span v-if="item.shortcut" class="ml-2 text-xs text-muted-foreground">
            {{ item.shortcut }}
          </span>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>
```

**注意：** `import { computed } from 'vue'` 需要在 script setup 顶部添加。上面的 `computed` 用于 `visibleGroups`。修正导入行：

```typescript
import { ref, watch, computed } from 'vue'
```

- [ ] **Step 2: 提交**

```bash
git add src/components/command-palette/CommandPaletteDialog.vue
git commit -m "feat(command-palette): add CommandPaletteDialog component"
```

---

### Task 10: 集成到 App.vue

**Files:**
- Modify: `src/App.vue:1-21` (imports)
- Modify: `src/App.vue:833` (template，在 TabOverviewDialog 后添加)
- Depends on: Task 9

- [ ] **Step 1: 添加 import**

在 `src/App.vue` 的 `<script setup>` 中，`import TabOverviewDialog` 行（第 21 行）后添加：

```typescript
import CommandPaletteDialog from '@/components/command-palette/CommandPaletteDialog.vue'
```

- [ ] **Step 2: 添加 toggleSidebar 和 openSettings 回调**

App.vue 中已有 `proxyDialogOpen` 和 `settingsDialogOpen` ref。需要确认 `toggleSidebar` 函数的位置。

在 App.vue 的 script setup 中已有 sidebar toggle 逻辑（`toggleSidebar` 方法或 `immersiveMode` 相关逻辑）。全局命令的 `toggleSidebar` 回调需要直接调用已有的逻辑。

在 `proxyDialogOpen` 和 `settingsDialogOpen` 定义附近（约第 46-48 行后），确保 `openSettings` 方法可用：

```typescript
function openSettings(tab = 'general') {
  settingsInitialTab.value = tab
  settingsDialogOpen.value = true
}
```

注意：如果 App.vue 中已有类似方法，直接复用即可，不要重复定义。

- [ ] **Step 3: 在 template 中挂载组件**

在 `src/App.vue` 的 template 中，`<TabOverviewDialog>` 行（第 833 行）后、`<UpdateNotification>` 行（第 836 行）前添加：

```vue
    <!-- 命令面板 -->
    <CommandPaletteDialog
      :toggle-sidebar="toggleSidebar"
      :open-settings="() => openSettings()"
    />
```

注意：`toggleSidebar` 需要确认是已定义的函数名。如果 App.vue 中 sidebar 切换是通过其他方式实现的（如 `immersiveMode`），需要包装一个函数。搜索 App.vue 中的 sidebar 切换逻辑来确认。

- [ ] **Step 4: 验证编译**

```bash
pnpm build
```

Expected: 编译成功，无 TypeScript 错误。

- [ ] **Step 5: 提交**

```bash
git add src/App.vue
git commit -m "feat(command-palette): integrate CommandPaletteDialog into App.vue"
```

---

### Task 11: 开发模式验证

**Files:**
- 无新文件
- Depends on: Task 10

- [ ] **Step 1: 启动开发服务器验证功能**

```bash
pnpm dev
```

验证清单：
1. 按 `Cmd/Ctrl + K` → 命令面板弹窗打开
2. 无输入时 → 显示全局命令列表（7 个命令）
3. 输入 `bookmark google` → 显示匹配的书签结果
4. 输入 `tab github` → 显示匹配的标签页结果
5. 输入 `history youtube` → 显示匹配的历史记录
6. 输入 `page ` → 显示页面列表
7. 输入非前缀文本 → 跨所有数据源搜索
8. 选中结果 → 执行对应动作并关闭面板
9. ESC 或点击外部 → 面板关闭

- [ ] **Step 2: 修复发现的问题（如有）**

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "fix(command-palette): fix integration issues found during dev verification"
```

---

## 自审清单

### Spec 覆盖率

| 规格要求 | 对应 Task |
|----------|-----------|
| CommandItem 接口 | Task 1 |
| CommandProvider 接口 | Task 1 |
| Provider 注册表 | Task 2 |
| 前缀解析（bookmark/bm, page/p, tab/t, history/h） | Task 2 |
| 空输入 → 全局命令 | Task 2 + Task 7 |
| 无前缀匹配 → 跨源搜索 | Task 2 |
| BookmarkProvider | Task 3 |
| PageProvider | Task 4 |
| TabProvider | Task 5 |
| HistoryProvider（异步） | Task 6 |
| GlobalCommandProvider | Task 7 |
| 选中行为：bookmark/page/history → 导航 | Task 3, 4, 6 |
| 选中行为：tab → 切换 | Task 5 |
| 选中行为：全局命令 → 执行动作 | Task 7 |
| 选中后关闭面板 | Task 9 |
| Cmd/Ctrl+K 快捷键 | Task 9 |
| CommandDialog UI | Task 9 |
| 集成到 App.vue | Task 10 |
| 防抖搜索 | Task 9 (150ms debounce) |

### 占位符扫描

无 TBD、TODO、"implement later" 等占位符。所有代码完整。

### 类型一致性

- `CommandItem` 和 `CommandProvider` 在 Task 1 定义，Task 3-8 一致使用
- `createAllProviders` 工厂函数接受 `GlobalCallbacks`，与 `CommandPaletteDialog` 传入的 props 匹配
- `handleSelect` 参数类型为 `CommandItemType`（即 `CommandItem`），与 Provider 返回类型一致
