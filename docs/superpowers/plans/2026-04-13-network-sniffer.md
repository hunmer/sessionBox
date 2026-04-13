# Network Resource Sniffer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a network resource sniffer to the right sidebar that captures video/audio/image URLs from web requests in each tab, with per-site auto-enable rules, type filtering, and actions (copy, open, download via Aria2).

**Architecture:** Main process monitors `webRequest.onCompleted` on each WebContentsView session, filters by MIME type, and pushes matched resources to the renderer via IPC events. Renderer stores resources in a Pinia store (in-memory, per-tab Map). A MiniPopover in the right sidebar displays the UI.

**Tech Stack:** Electron webRequest API, Pinia store, Vue 3 SFC, shadcn-vue Popover/Switch/Badge/ScrollArea, lucide-vue-next icons, nanoid for IDs.

---

### Task 1: Add SniffedResource type to renderer types

**Files:**
- Modify: `src/types/index.ts` (append at end, before export block)

- [ ] **Step 1: Add SniffedResource interface**

In `src/types/index.ts`, add before the existing `export type {` block at line 110:

```typescript
// 嗅探到的网络资源
export interface SniffedResource {
  id: string
  url: string
  type: 'video' | 'audio' | 'image'
  mimeType: string
  size?: number
  timestamp: number
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(sniffer): add SniffedResource type definition"
```

---

### Task 2: Add snifferDomains to electron-store

**Files:**
- Modify: `electron/services/store.ts` (StoreSchema interface + defaults)

- [ ] **Step 1: Add snifferDomains to StoreSchema**

In `electron/services/store.ts`, add to `StoreSchema` interface (after line 176, before the closing `}`):

```typescript
  snifferDomains: string[]
```

- [ ] **Step 2: Add default value**

In the `defaults` object (after line 208, `activeUpdateSourceId: 'github'`), add:

```typescript
  snifferDomains: [],
```

- [ ] **Step 3: Add CRUD functions for sniffer domains**

Append at the end of `electron/services/store.ts` (before the last line):

```typescript
// ====== 嗅探器域名规则 ======

export function getSnifferDomains(): string[] {
  return store.get('snifferDomains', defaults.snifferDomains)
}

export function setSnifferDomains(domains: string[]): void {
  store.set('snifferDomains', domains)
}

export function addSnifferDomain(domain: string): void {
  const domains = getSnifferDomains()
  if (!domains.includes(domain)) {
    domains.push(domain)
    store.set('snifferDomains', domains)
  }
}

export function removeSnifferDomain(domain: string): void {
  const domains = getSnifferDomains().filter(d => d !== domain)
  store.set('snifferDomains', domains)
}
```

- [ ] **Step 4: Commit**

```bash
git add electron/services/store.ts
git commit -m "feat(sniffer): add snifferDomains to electron-store"
```

---

### Task 3: Add sniffer webRequest monitoring to WebviewManager

**Files:**
- Modify: `electron/services/webview-manager.ts`

- [ ] **Step 1: Add sniffer state tracking properties**

In the `WebviewManager` class, add after the `aria2Enabled` property (line 64):

```typescript
  private snifferEnabled = new Map<string, boolean>() // tabId -> enabled
  private snifferListeners = new Map<string, (...args: any[]) => void>() // tabId -> webRequest listener
```

- [ ] **Step 2: Add sniffer toggle and domain check methods**

Add these methods to the class (before the closing `}` of the class, around line 1097):

```typescript
  /** 切换标签页的嗅探开关 */
  toggleSniffer(tabId: string, enabled: boolean): void {
    this.snifferEnabled.set(tabId, enabled)
    if (enabled) {
      this.startSniffing(tabId)
    } else {
      this.stopSniffing(tabId)
    }
  }

  /** 检查 URL 的域名是否在自动启用列表中 */
  private shouldAutoSniff(tabId: string, url: string): boolean {
    try {
      const hostname = new URL(url).hostname
      const { getSnifferDomains } = require('./store')
      const domains: string[] = getSnifferDomains()
      return domains.some(d => hostname === d || hostname.endsWith(`.${d}`))
    } catch {
      return false
    }
  }

  /** 为标签页启动网络请求嗅探 */
  private startSniffing(tabId: string): void {
    const entry = this.views.get(tabId)
    if (!entry || entry.view.webContents.isDestroyed()) return

    // 防止重复注册
    if (this.snifferListeners.has(tabId)) return

    const win = this.mainWindow
    if (!win || win.isDestroyed()) return

    const session = entry.view.webContents.session

    const listener = (details: Electron.OnCompletedListenerDetails) => {
      // 只处理主资源类型请求（非 favicon 等）
      if (!details.resourceType || details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') return

      const contentType = details.responseHeaders?.['content-type']?.[0]
        || details.responseHeaders?.['Content-Type']?.[0]
        || ''

      let resourceType: 'video' | 'audio' | 'image' | null = null
      if (/^video\//i.test(contentType)) resourceType = 'video'
      else if (/^audio\//i.test(contentType)) resourceType = 'audio'
      else if (/^image\//i.test(contentType)) resourceType = 'image'

      if (!resourceType) return

      const contentLength = details.responseHeaders?.['content-length']?.[0]
        || details.responseHeaders?.['Content-Length']?.[0]

      const resource = {
        id: `sniff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: details.url,
        type: resourceType,
        mimeType: contentType.split(';')[0].trim(),
        size: contentLength ? parseInt(contentLength, 10) : undefined,
        timestamp: Date.now()
      }

      if (!win.isDestroyed()) {
        win.webContents.send('on:sniffer:resource', tabId, resource)
      }
    }

    session.webRequest.onCompleted(listener)
    this.snifferListeners.set(tabId, listener)
  }

  /** 停止标签页的网络请求嗅探 */
  private stopSniffing(tabId: string): void {
    const listener = this.snifferListeners.get(tabId)
    if (!listener) return

    const entry = this.views.get(tabId)
    if (entry && !entry.view.webContents.isDestroyed()) {
      try {
        entry.view.webContents.session.webRequest.onCompleted(null as any)
      } catch {
        // 忽略清理异常
      }
    }
    this.snifferListeners.delete(tabId)
  }

  /** 获取标签页的嗅探启用状态 */
  isSnifferEnabled(tabId: string): boolean {
    return this.snifferEnabled.get(tabId) ?? false
  }

  /** 清理标签页嗅探资源（由渲染进程通过 IPC 调用，实际清理在渲染进程 store 中） */
  clearSnifferResources(tabId: string): void {
    // 仅清理主进程中的监听器状态，渲染进程自行清理 store
    // 不需要额外操作，资源数据在渲染进程 store 中
  }
```

- [ ] **Step 3: Auto-sniff on navigation in setupEventForwarding**

In `setupEventForwarding`, after the `did-navigate` handler (line 410-414), add auto-sniffing check:

```typescript
    // 自动嗅探：如果当前 URL 域名在自动启用列表中
    const autoSniff = (url: string) => {
      if (!this.snifferEnabled.get(tabId)) {
        if (this.shouldAutoSniff(tabId, url)) {
          this.snifferEnabled.set(tabId, true)
          this.startSniffing(tabId)
        }
      }
    }
```

Then add `autoSniff(url)` call inside the `did-navigate` handler after `this.checkAutoMute(tabId, url)`:

```typescript
      autoSniff(url)
```

And inside the `did-navigate-in-page` handler after `this.checkAutoMute(tabId, url)`:

```typescript
      autoSniff(url)
```

- [ ] **Step 4: Clean up sniffer state in destroyView**

In `destroyView` method (line 602), add after `this.visibleTabIds.delete(tabId)`:

```typescript
    this.snifferEnabled.delete(tabId)
    this.stopSniffing(tabId)
```

- [ ] **Step 5: Clean up sniffer state in checkFreeze**

In `checkFreeze` method, inside the freeze loop before `this.views.delete(tabId)` (around line 1063), add:

```typescript
      this.snifferEnabled.delete(tabId)
      this.stopSniffing(tabId)
```

- [ ] **Step 6: Commit**

```bash
git add electron/services/webview-manager.ts
git commit -m "feat(sniffer): add webRequest monitoring to WebviewManager"
```

---

### Task 4: Add sniffer IPC handlers

**Files:**
- Create: `electron/ipc/sniffer.ts`
- Modify: `electron/ipc/index.ts`

- [ ] **Step 1: Create sniffer IPC handler file**

Create `electron/ipc/sniffer.ts`:

```typescript
import { ipcMain } from 'electron'
import { webviewManager } from '../services/webview-manager'
import { getSnifferDomains, addSnifferDomain, removeSnifferDomain } from '../services/store'

export function registerSnifferIpcHandlers(): void {
  // 切换标签页嗅探开关
  ipcMain.handle('sniffer:toggle', (_e, tabId: string, enabled: boolean) => {
    webviewManager.toggleSniffer(tabId, enabled)
  })

  // 添加自动启用域名
  ipcMain.handle('sniffer:setDomainEnabled', (_e, domain: string, enabled: boolean) => {
    if (enabled) {
      addSnifferDomain(domain)
    } else {
      removeSnifferDomain(domain)
    }
  })

  // 获取自动启用域名列表
  ipcMain.handle('sniffer:getDomainList', () => {
    return getSnifferDomains()
  })

  // 清空指定标签页的捕获资源（主进程侧无操作，资源在渲染进程 store）
  ipcMain.handle('sniffer:clearResources', (_e, _tabId: string) => {
    // 资源存储在渲染进程 store 中，这里无需操作
  })

  // 获取标签页嗅探状态
  ipcMain.handle('sniffer:getState', (_e, tabId: string) => {
    return {
      enabled: webviewManager.isSnifferEnabled(tabId)
    }
  })
}
```

- [ ] **Step 2: Register sniffer IPC in index.ts**

In `electron/ipc/index.ts`, add import (after line 64):

```typescript
import { registerSnifferIpcHandlers } from './sniffer'
```

Then add the registration call inside `registerIpcHandlers()` function (after the existing registrations, around line 75, after `migrateBookmarks()`):

```typescript
  // ====== 嗅探器 ======
  registerSnifferIpcHandlers()
```

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/sniffer.ts electron/ipc/index.ts
git commit -m "feat(sniffer): add sniffer IPC handlers"
```

---

### Task 5: Add sniffer API to preload bridge

**Files:**
- Modify: `preload/index.ts`

- [ ] **Step 1: Add sniffer API namespace**

In `preload/index.ts`, add before the `// 主进程 → 渲染进程事件监听` comment (around line 431):

```typescript
  sniffer: {
    toggle: (tabId: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('sniffer:toggle', tabId, enabled),
    setDomainEnabled: (domain: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('sniffer:setDomainEnabled', domain, enabled),
    getDomainList: (): Promise<string[]> =>
      ipcRenderer.invoke('sniffer:getDomainList'),
    clearResources: (tabId: string): Promise<void> =>
      ipcRenderer.invoke('sniffer:clearResources', tabId),
    getState: (tabId: string): Promise<{ enabled: boolean }> =>
      ipcRenderer.invoke('sniffer:getState', tabId),
  },
```

- [ ] **Step 2: Commit**

```bash
git add preload/index.ts
git commit -m "feat(sniffer): add sniffer API to preload bridge"
```

---

### Task 6: Create sniffer Pinia store

**Files:**
- Create: `src/stores/sniffer.ts`

- [ ] **Step 1: Create sniffer store**

Create `src/stores/sniffer.ts`:

```typescript
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { SniffedResource } from '@/types'

const MAX_RESOURCES_PER_TAB = 500

export const useSnifferStore = defineStore('sniffer', () => {
  /** 每个标签页的资源列表 */
  const resources = ref<Map<string, SniffedResource[]>>(new Map())

  /** 每个标签页的嗅探启用状态 */
  const enabled = ref<Map<string, boolean>>(new Map())

  /** 过滤器：显示哪些类型 */
  const filterTypes = ref<Set<'video' | 'audio' | 'image'>>(new Set(['video', 'audio', 'image']))

  /** 自动启用域名列表 */
  const domains = ref<string[]>([])

  /** 初始化：加载域名列表 + 注册 IPC 监听 */
  async function init() {
    domains.value = await window.api.sniffer.getDomainList()
    setupListeners()
  }

  /** 注册 IPC 事件监听 */
  function setupListeners() {
    window.api.on('sniffer:resource', (tabId: unknown, resource: unknown) => {
      const tid = tabId as string
      const res = resource as SniffedResource
      if (!resources.value.has(tid)) {
        resources.value.set(tid, [])
      }
      const list = resources.value.get(tid)!
      list.unshift(res)
      // FIFO 淘汰
      if (list.length > MAX_RESOURCES_PER_TAB) {
        list.splice(MAX_RESOURCES_PER_TAB)
      }
    })

    window.api.on('tab:removed', (tabId: unknown) => {
      onTabClosed(tabId as string)
    })
  }

  /** 获取指定标签页的过滤后资源列表 */
  function getFilteredResources(tabId: string): SniffedResource[] {
    const list = resources.value.get(tabId) ?? []
    const filters = filterTypes.value
    if (filters.size === 3) return list
    return list.filter(r => filters.has(r.type))
  }

  /** 获取指定标签页的资源总数 */
  function getResourceCount(tabId: string): number {
    return resources.value.get(tabId)?.length ?? 0
  }

  /** 切换嗅探开关 */
  async function toggle(tabId: string, isEnabled: boolean) {
    enabled.value.set(tabId, isEnabled)
    await window.api.sniffer.toggle(tabId, isEnabled)
  }

  /** 切换域名自动启用规则 */
  async function toggleDomain(domain: string, isEnabled: boolean) {
    await window.api.sniffer.setDomainEnabled(domain, isEnabled)
    if (isEnabled) {
      if (!domains.value.includes(domain)) {
        domains.value.push(domain)
      }
    } else {
      domains.value = domains.value.filter(d => d !== domain)
    }
  }

  /** 检查域名是否在自动启用列表中 */
  function isDomainEnabled(domain: string): boolean {
    return domains.value.includes(domain)
  }

  /** 清空指定标签页的资源 */
  async function clearResources(tabId: string) {
    resources.value.set(tabId, [])
    await window.api.sniffer.clearResources(tabId)
  }

  /** 标签关闭时清理 */
  function onTabClosed(tabId: string) {
    resources.value.delete(tabId)
    enabled.value.delete(tabId)
  }

  /** 切换过滤器类型 */
  function toggleFilter(type: 'video' | 'audio' | 'image') {
    const filters = new Set(filterTypes.value)
    if (filters.has(type)) {
      if (filters.size > 1) {
        filters.delete(type)
      }
    } else {
      filters.add(type)
    }
    filterTypes.value = filters
  }

  return {
    resources,
    enabled,
    filterTypes,
    domains,
    init,
    getFilteredResources,
    getResourceCount,
    toggle,
    toggleDomain,
    isDomainEnabled,
    clearResources,
    onTabClosed,
    toggleFilter
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/sniffer.ts
git commit -m "feat(sniffer): create sniffer Pinia store"
```

---

### Task 7: Create SnifferMiniPopover component

**Files:**
- Create: `src/components/common/SnifferMiniPopover.vue`

- [ ] **Step 1: Create the MiniPopover component**

Create `src/components/common/SnifferMiniPopover.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import {
  Radar,
  ArrowRight,
  Copy,
  ExternalLink,
  Download,
  Trash2,
  Video,
  Music,
  ImageIcon,
  Power,
  Globe
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useSnifferStore } from '@/stores/sniffer'
import { useTabStore } from '@/stores/tab'
import { useDownloadStore } from '@/stores/download'
import { toast } from 'vue-sonner'

const snifferStore = useSnifferStore()
const tabStore = useTabStore()
const downloadStore = useDownloadStore()

onMounted(async () => {
  await snifferStore.init()
})

const activeTabId = computed(() => tabStore.activeTabId)
const currentUrl = computed(() => {
  const tid = activeTabId.value
  if (!tid) return ''
  const tab = tabStore.tabs.find(t => t.id === tid)
  return tab?.url ?? ''
})

const currentDomain = computed(() => {
  try {
    return new URL(currentUrl.value).hostname
  } catch {
    return ''
  }
})

const isSniffing = computed(() => {
  const tid = activeTabId.value
  if (!tid) return false
  return snifferStore.enabled.get(tid) ?? false
})

const isDomainAutoEnabled = computed(() => {
  return snifferStore.isDomainEnabled(currentDomain.value)
})

const filteredResources = computed(() => {
  const tid = activeTabId.value
  if (!tid) return []
  return snifferStore.getFilteredResources(tid)
})

const resourceCount = computed(() => {
  const tid = activeTabId.value
  if (!tid) return 0
  return snifferStore.getResourceCount(tid)
})

function formatSize(bytes?: number): string {
  if (!bytes || bytes === 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

function typeIcon(type: 'video' | 'audio' | 'image') {
  if (type === 'video') return Video
  if (type === 'audio') return Music
  return ImageIcon
}

function typeColor(type: 'video' | 'audio' | 'image'): string {
  if (type === 'video') return 'text-blue-500'
  if (type === 'audio') return 'text-green-500'
  return 'text-orange-500'
}

function typeBgColor(type: 'video' | 'audio' | 'image'): string {
  if (type === 'video') return 'bg-blue-500/10'
  if (type === 'audio') return 'bg-green-500/10'
  return 'bg-orange-500/10'
}

async function handleToggleSniffing(enabled: boolean) {
  const tid = activeTabId.value
  if (!tid) return
  await snifferStore.toggle(tid, enabled)
}

async function handleToggleDomain(enabled: boolean) {
  const domain = currentDomain.value
  if (!domain) return
  await snifferStore.toggleDomain(domain, enabled)
}

function isFilterActive(type: 'video' | 'audio' | 'image'): boolean {
  return snifferStore.filterTypes.has(type)
}

function handleToggleFilter(type: 'video' | 'audio' | 'image') {
  snifferStore.toggleFilter(type)
}

async function handleCopy(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success('链接已复制')
  } catch {
    toast.error('复制失败')
  }
}

function handleOpenInNewWindow(url: string) {
  tabStore.createTab(null, url)
}

async function handleDownload(url: string) {
  try {
    await downloadStore.add(url)
    toast.success('已添加到下载')
  } catch (e) {
    toast.error('添加下载失败')
  }
}

async function handleClear() {
  const tid = activeTabId.value
  if (!tid) return
  await snifferStore.clearResources(tid)
}
</script>

<template>
  <div class="w-80">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between px-3 pt-2 pb-2">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Radar class="h-3.5 w-3.5 text-muted-foreground" />
        网络嗅探
        <Badge v-if="resourceCount > 0" variant="secondary" class="text-[10px] h-4">
          {{ resourceCount }}
        </Badge>
      </div>
    </div>
    <Separator />

    <!-- 开关区域 -->
    <div class="px-3 py-2 space-y-2">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-xs">
          <Power class="h-3 w-3 text-muted-foreground" />
          <span>启用嗅探</span>
        </div>
        <Switch
          :checked="isSniffing"
          @update:checked="handleToggleSniffing"
        />
      </div>
      <div v-if="currentDomain" class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-xs">
          <Globe class="h-3 w-3 text-muted-foreground" />
          <span class="truncate max-w-[160px]">自动启用 *.{{ currentDomain }}</span>
        </div>
        <Switch
          :checked="isDomainAutoEnabled"
          @update:checked="handleToggleDomain"
        />
      </div>
    </div>
    <Separator />

    <!-- 过滤器 -->
    <div class="flex items-center gap-1 px-3 py-2">
      <Button
        v-for="ft in (['video', 'audio', 'image'] as const)"
        :key="ft"
        variant="ghost"
        size="sm"
        :class="[
          'h-6 text-[10px] px-2',
          isFilterActive(ft) ? typeBgColor(ft) : 'opacity-50'
        ]"
        @click="handleToggleFilter(ft)"
      >
        {{ ft === 'video' ? '视频' : ft === 'audio' ? '音频' : '图片' }}
      </Button>
    </div>
    <Separator />

    <!-- 资源列表 -->
    <ScrollArea class="h-[280px]">
      <div v-if="filteredResources.length === 0" class="flex items-center justify-center py-8">
        <p class="text-xs text-muted-foreground">
          {{ isSniffing ? '等待捕获资源...' : '开启嗅探以捕获资源' }}
        </p>
      </div>
      <div v-else class="py-1">
        <div
          v-for="res in filteredResources"
          :key="res.id"
          class="px-3 py-1.5 hover:bg-muted/50 rounded-sm transition-colors"
        >
          <div class="flex items-start gap-2">
            <!-- 类型图标 -->
            <div :class="['shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5', typeBgColor(res.type)]">
              <component :is="typeIcon(res.type)" :class="['h-3 w-3', typeColor(res.type)]" />
            </div>
            <!-- 信息 -->
            <div class="flex-1 min-w-0 space-y-0.5">
              <div class="flex items-center gap-1">
                <span class="text-[10px] text-muted-foreground shrink-0">{{ res.mimeType }}</span>
                <span v-if="res.size" class="text-[10px] text-muted-foreground">{{ formatSize(res.size) }}</span>
              </div>
              <p class="text-xs truncate text-foreground/80" :title="res.url">{{ res.url }}</p>
              <!-- 操作按钮 -->
              <div class="flex items-center gap-1">
                <Button variant="ghost" size="sm" class="h-5 px-1.5 text-[10px]" @click="handleCopy(res.url)">
                  <Copy class="h-2.5 w-2.5 mr-0.5" />
                  复制
                </Button>
                <Button variant="ghost" size="sm" class="h-5 px-1.5 text-[10px]" @click="handleOpenInNewWindow(res.url)">
                  <ExternalLink class="h-2.5 w-2.5 mr-0.5" />
                  打开
                </Button>
                <Button variant="ghost" size="sm" class="h-5 px-1.5 text-[10px]" @click="handleDownload(res.url)">
                  <Download class="h-2.5 w-2.5 mr-0.5" />
                  下载
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>

    <Separator />
    <!-- 底部 -->
    <div class="flex items-center justify-between px-3 py-1.5">
      <span class="text-[10px] text-muted-foreground">
        共 {{ resourceCount }} 个资源
      </span>
      <Button
        v-if="resourceCount > 0"
        variant="ghost"
        size="sm"
        class="h-5 gap-1 text-[10px] text-destructive hover:text-destructive"
        @click="handleClear"
      >
        <Trash2 class="h-2.5 w-2.5" />
        清空
      </Button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/common/SnifferMiniPopover.vue
git commit -m "feat(sniffer): create SnifferMiniPopover component"
```

---

### Task 8: Add sniffer entry to RightPanel

**Files:**
- Modify: `src/components/common/RightPanel.vue`

- [ ] **Step 1: Add import**

In `RightPanel.vue`, add the `Radar` icon import from lucide-vue-next (line 3):

```typescript
import { Bookmark, History, Download, Shield, Settings2, Network, Keyboard, Box, Radar } from 'lucide-vue-next'
```

Add the SnifferMiniPopover import (after line 23):

```typescript
import SnifferMiniPopover from './SnifferMiniPopover.vue'
```

- [ ] **Step 2: Add popover state**

After `const containerOpen = ref(false)` (line 39), add:

```typescript
const snifferOpen = ref(false)
```

Add `snifferOpen` to the `openFullPage` function's reset list (line 42-48):

```typescript
function openFullPage(site: string) {
  bookmarkOpen.value = false
  historyOpen.value = false
  downloadOpen.value = false
  proxyOpen.value = false
  containerOpen.value = false
  snifferOpen.value = false
  tabStore.createTabForSite(site)
}
```

- [ ] **Step 3: Add Popover UI**

After the container Popover block (after line 115, before the closing `</div>` of Section 1), add:

```vue
          <!-- 网络嗅探 -->
          <Popover v-model:open="snifferOpen">
            <PopoverTrigger as-child>
              <Button variant="ghost" size="icon" class="h-8 w-8">
                <Radar class="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="left" :side-offset="4" :collision-padding="30" class="p-0 w-auto overflow-hidden">
              <SnifferMiniPopover />
            </PopoverContent>
          </Popover>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/common/RightPanel.vue
git commit -m "feat(sniffer): add sniffer entry to RightPanel"
```

---

### Task 9: Integrate sniffer store with tab store for lifecycle cleanup

**Files:**
- Modify: `src/stores/tab.ts`

- [ ] **Step 1: Import sniffer store and clean up on tab close**

In `src/stores/tab.ts`, import the sniffer store (add at top imports area):

```typescript
import { useSnifferStore } from './sniffer'
```

Find the `closeTab` function. After the `await api.tab.close(tabId)` call (which removes the tab from main process), add sniffer cleanup:

```typescript
    // 清理嗅探器数据
    const snifferStore = useSnifferStore()
    snifferStore.onTabClosed(tabId)
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/tab.ts
git commit -m "feat(sniffer): integrate sniffer cleanup with tab lifecycle"
```

---

### Task 10: Wire up download via Aria2 in SnifferMiniPopover

**Files:**
- Modify: `src/components/common/SnifferMiniPopover.vue` (already done in Task 7)

This is already implemented in Task 7's `handleDownload` function which calls `downloadStore.add(url)`. Verify that `useDownloadStore` has an `add` method.

- [ ] **Step 1: Verify download store has add method**

Check `src/stores/download.ts` for an `add` method. If it delegates to `api.download.add`, the wiring is correct. If not, the `handleDownload` in SnifferMiniPopover should use `window.api.download.add(url)` directly.

Update `handleDownload` in SnifferMiniPopover if needed:

```typescript
async function handleDownload(url: string) {
  try {
    await window.api.download.add(url)
    toast.success('已添加到下载')
  } catch (e) {
    toast.error('添加下载失败')
  }
}
```

Remove the `downloadStore` import and reference if switching to direct API call.

- [ ] **Step 2: Commit if changes were needed**

```bash
git add src/components/common/SnifferMiniPopover.vue
git commit -m "fix(sniffer): wire download to Aria2 API"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All requirements from design doc covered:
  - Right sidebar entry: Task 8
  - MiniPopover: Task 7
  - Per-tab data store: Task 6
  - Switch toggle: Task 7 (UI) + Task 3 (main process)
  - Domain auto-enable: Task 3 (auto-sniff) + Task 2 (store) + Task 7 (UI)
  - Type filters: Task 7
  - Copy link: Task 7
  - Open in new window: Task 7
  - Download via Aria2: Task 10
  - webRequest monitoring: Task 3
  - IPC channels: Task 4
  - Preload bridge: Task 5
  - Lifecycle cleanup: Task 9
- [x] **Placeholder scan:** No TBDs, TODOs, or vague steps
- [x] **Type consistency:** SniffedResource type consistent across `src/types/index.ts`, `src/stores/sniffer.ts`, and IPC payloads
