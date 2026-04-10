# 书签健康检查功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在书签管理页面增加"检查失效书签"功能，使用 queue 并发检测 URL 可达性，实时展示进度，支持批量删除失效书签。

**Architecture:** 主进程新增 `bookmark-checker.ts` 服务，通过 `queue` 包管理并发 HTTP 检查（`net.fetch`），IPC 实时推送结果。渲染进程新增 `BookmarkCheckDialog.vue` 对话框，含设置/检查/结果三阶段 UI。通过 preload 桥接通信。

**Tech Stack:** queue (npm)、Electron net.fetch、IPC、Vue 3 Dialog + shadcn-vue 组件

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `package.json` | 修改 | 添加 `queue` 依赖 |
| `electron/services/bookmark-checker.ts` | 新增 | 书签健康检查核心服务（queue + net.fetch + 重试） |
| `electron/ipc/bookmark-check.ts` | 新增 | IPC 处理器注册（checkStart / checkCancel） |
| `electron/ipc/index.ts` | 修改 | 导入并调用注册函数 |
| `preload/index.ts` | 修改 | 新增 `bookmarkCheck` API 命名空间 |
| `src/components/bookmarks/BookmarkCheckDialog.vue` | 新增 | 检查对话框 UI（设置 → 进度 → 结果） |
| `src/components/bookmarks/BookmarksPage.vue` | 修改 | 工具栏添加"检查失效"按钮 |

---

### Task 1: 安装 queue 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 queue 包**

```bash
cd /Users/Zhuanz/Documents/sessionBox && pnpm add queue
```

- [ ] **Step 2: 验证安装**

```bash
ls node_modules/queue/package.json
```

Expected: 文件存在

---

### Task 2: 创建主进程 bookmark-checker 服务

**Files:**
- Create: `electron/services/bookmark-checker.ts`

- [ ] **Step 1: 创建 bookmark-checker.ts**

```typescript
import { net } from 'electron'
import queue from 'queue'

/** 单个书签的检查输入 */
export interface CheckTask {
  id: string
  url: string
}

/** 单个书签的检查结果 */
export interface CheckResult {
  taskId: string
  bookmarkId: string
  status: 'valid' | 'invalid'
  statusCode?: number
  error?: string
  retries: number
}

/** 检查配置 */
export interface CheckConfig {
  bookmarks: CheckTask[]
  maxRetries: number
  concurrency: number
  useProxy: boolean
  timeout: number
}

/** 活跃的检查会话 */
interface CheckSession {
  q: queue
  abortController: AbortController
  cancelled: boolean
}

const sessions = new Map<string, CheckSession>()

/**
 * 检查单个 URL 是否可达
 * - 2xx/3xx/4xx → valid（URL 可达）
 * - 超时/网络错误/DNS 失败 → invalid
 */
async function checkSingleUrl(
  url: string,
  timeout: number,
  signal: AbortSignal
): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  // 外部取消也触发 abort
  const onExternalAbort = (): void => controller.abort()
  signal.addEventListener('abort', onExternalAbort, { once: true })

  try {
    const response = await net.fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow'
    })
    return { ok: true, statusCode: response.status }
  } catch (fetchError: unknown) {
    // HEAD 失败时降级为 GET（某些服务器不支持 HEAD）
    try {
      const retryController = new AbortController()
      const retryTimer = setTimeout(() => retryController.abort(), timeout)

      const response = await net.fetch(url, {
        method: 'GET',
        signal: retryController.signal,
        redirect: 'follow'
      })
      clearTimeout(retryTimer)
      return { ok: true, statusCode: response.status }
    } catch {
      // GET 也失败
    }

    const message = fetchError instanceof Error ? fetchError.message : String(fetchError)
    return { ok: false, error: message }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onExternalAbort)
  }
}

/** 带重试的检查 */
async function checkWithRetry(
  task: CheckTask,
  maxRetries: number,
  timeout: number,
  signal: AbortSignal,
  onResult: (result: CheckResult) => void
): Promise<void> {
  let lastError = ''
  let lastStatusCode: number | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal.aborted) {
      onResult({
        taskId: '',
        bookmarkId: task.id,
        status: 'invalid',
        error: '已取消',
        retries: attempt
      })
      return
    }

    const result = await checkSingleUrl(task.url, timeout, signal)

    if (result.ok) {
      onResult({
        taskId: '',
        bookmarkId: task.id,
        status: 'valid',
        statusCode: result.statusCode,
        retries: attempt
      })
      return
    }

    lastError = result.error ?? '未知错误'
    lastStatusCode = result.statusCode

    // 非最后一次重试，等待 1 秒
    if (attempt < maxRetries) {
      await new Promise<void>((resolve) => {
        const wait = setTimeout(resolve, 1000)
        signal.addEventListener('abort', () => {
          clearTimeout(wait)
          resolve()
        }, { once: true })
      })
    }
  }

  onResult({
    taskId: '',
    bookmarkId: task.id,
    status: 'invalid',
    statusCode: lastStatusCode,
    error: lastError,
    retries: maxRetries
  })
}

/**
 * 启动书签检查
 * @returns taskId 用于后续取消
 */
export function startCheck(
  config: CheckConfig,
  onProgress: (result: CheckResult) => void,
  onDone: (summary: { total: number; valid: number; invalid: number }) => void
): string {
  const taskId = `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const abortController = new AbortController()

  const q = queue({ concurrency: config.concurrency, autostart: false })

  const session: CheckSession = {
    q,
    abortController,
    cancelled: false
  }
  sessions.set(taskId, session)

  let valid = 0
  let invalid = 0

  for (const bookmark of config.bookmarks) {
    q.push(async () => {
      if (session.cancelled || abortController.signal.aborted) return

      await checkWithRetry(
        bookmark,
        config.maxRetries,
        config.timeout,
        abortController.signal,
        (result) => {
          result.taskId = taskId
          if (result.status === 'valid') valid++
          else invalid++
          onProgress(result)
        }
      )
    })
  }

  q.addEventListener('end', () => {
    sessions.delete(taskId)
    onDone({ total: config.bookmarks.length, valid, invalid })
  })

  q.start()

  return taskId
}

/** 取消检查 */
export function cancelCheck(taskId: string): void {
  const session = sessions.get(taskId)
  if (!session) return

  session.cancelled = true
  session.abortController.abort()
  session.q.stop()
  sessions.delete(taskId)
}
```

- [ ] **Step 2: 验证文件语法**

```bash
cd /Users/Zhuanz/Documents/sessionBox && npx tsc --noEmit electron/services/bookmark-checker.ts 2>&1 | head -20
```

Expected: 无错误或仅有类型引用问题（后续 Task 解决）

---

### Task 3: 创建 IPC 处理器

**Files:**
- Create: `electron/ipc/bookmark-check.ts`

- [ ] **Step 1: 创建 bookmark-check.ts**

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { startCheck, cancelCheck, type CheckConfig } from '../services/bookmark-checker'

export function registerBookmarkCheckIpc(): void {
  ipcMain.handle('bookmark:checkStart', (e, config: CheckConfig) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) throw new Error('Window not found')

    const taskId = startCheck(
      config,
      (result) => {
        if (!win.isDestroyed()) {
          win.webContents.send('on:bookmark-check:progress', result)
        }
      },
      (summary) => {
        if (!win.isDestroyed()) {
          win.webContents.send('on:bookmark-check:done', { taskId: '', ...summary })
        }
      }
    )

    return { taskId }
  })

  ipcMain.handle('bookmark:checkCancel', (_e, taskId: string) => {
    cancelCheck(taskId)
  })
}
```

---

### Task 4: 注册 IPC 到主进程

**Files:**
- Modify: `electron/ipc/index.ts`

- [ ] **Step 1: 在 `electron/ipc/index.ts` 添加导入和注册**

在文件顶部导入区域添加：

```typescript
import { registerBookmarkCheckIpc } from './bookmark-check'
```

在 `registerIpcHandlers()` 函数中，书签文件夹部分之后（约第 274 行 `reorderBookmarkFolders` 之后），添加：

```typescript
  // ====== 书签健康检查 ======
  registerBookmarkCheckIpc()
```

---

### Task 5: 添加 Preload 桥接

**Files:**
- Modify: `preload/index.ts`

- [ ] **Step 1: 在 `preload/index.ts` 的 `api` 对象中添加 `bookmarkCheck` 命名空间**

在 `bookmarkFolder` 命名空间之后、`extension` 命名空间之前（约第 212 行），添加：

```typescript
  bookmarkCheck: {
    start: (config: {
      bookmarks: Array<{ id: string; url: string }>
      maxRetries: number
      concurrency: number
      useProxy: boolean
      timeout: number
    }): Promise<{ taskId: string }> =>
      ipcRenderer.invoke('bookmark:checkStart', config),
    cancel: (taskId: string): Promise<void> =>
      ipcRenderer.invoke('bookmark:checkCancel', taskId),
  },
```

同时在 `api.on` 事件监听附近不需要改动——已有通用的 `api.on(event, callback)` 机制，可直接用 `api.on('bookmark-check:progress', cb)` 和 `api.on('bookmark-check:done', cb)` 监听。

---

### Task 6: 创建 BookmarkCheckDialog 组件

**Files:**
- Create: `src/components/bookmarks/BookmarkCheckDialog.vue`

- [ ] **Step 1: 创建完整的对话框组件**

```vue
<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { ShieldCheck, CheckCircle2, XCircle, Loader2, Trash2 } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useBookmarkStore } from '@/stores/bookmark'
import type { Bookmark } from '@/types'

interface CheckResultItem {
  bookmarkId: string
  title: string
  url: string
  status: 'valid' | 'invalid'
  statusCode?: number
  error?: string
  retries: number
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const bookmarkStore = useBookmarkStore()

// 配置参数
const maxRetries = ref(5)
const concurrency = ref(5)
const useProxy = ref(false)

// 阶段控制
type Phase = 'config' | 'checking' | 'result'
const phase = ref<Phase>('config')

// 检查状态
const taskId = ref('')
const results = ref<CheckResultItem[]>([])
const checkedCount = ref(0)
const totalCount = ref(0)
const isCancelled = ref(false)

// 结果页勾选
const selectedInvalidIds = ref<Set<string>>(new Set())

// 事件清理函数
let cleanupProgress: (() => void) | null = null
let cleanupDone: (() => void) | null = null

const invalidResults = computed(() => results.value.filter((r) => r.status === 'invalid'))
const validCount = computed(() => results.value.filter((r) => r.status === 'valid').length)

const progress = computed(() =>
  totalCount.value > 0 ? Math.round((checkedCount.value / totalCount.value) * 100) : 0
)

function resetState(): void {
  phase.value = 'config'
  taskId.value = ''
  results.value = []
  checkedCount.value = 0
  totalCount.value = 0
  isCancelled.value = false
  selectedInvalidIds.value = new Set()
  removeListeners()
}

function removeListeners(): void {
  cleanupProgress?.()
  cleanupProgress = null
  cleanupDone?.()
  cleanupDone = null
}

async function startCheck(): Promise<void> {
  const bookmarks = bookmarkStore.bookmarks.map((b) => ({
    id: b.id,
    url: b.url,
    title: b.title
  }))

  if (bookmarks.length === 0) return

  phase.value = 'checking'
  totalCount.value = bookmarks.length
  results.value = []
  checkedCount.value = 0
  isCancelled.value = false

  // 监听进度事件
  cleanupProgress = window.api.on('bookmark-check:progress', (result: unknown) => {
    const r = result as {
      bookmarkId: string
      status: 'valid' | 'invalid'
      statusCode?: number
      error?: string
      retries: number
    }
    const bm = bookmarks.find((b) => b.id === r.bookmarkId)
    if (!bm) return

    results.value.push({
      bookmarkId: r.bookmarkId,
      title: bm.title,
      url: bm.url,
      status: r.status,
      statusCode: r.statusCode,
      error: r.error,
      retries: r.retries
    })
    checkedCount.value++
  })

  cleanupDone = window.api.on('bookmark-check:done', (summary: unknown) => {
    const s = summary as { total: number; valid: number; invalid: number }
    // 确保最终计数准确
    checkedCount.value = s.total
    phase.value = 'result'
    // 默认全选失效项
    selectedInvalidIds.value = new Set(
      results.value.filter((r) => r.status === 'invalid').map((r) => r.bookmarkId)
    )
    removeListeners()
  })

  const result = await window.api.bookmarkCheck.start({
    bookmarks: bookmarks.map((b) => ({ id: b.id, url: b.url })),
    maxRetries: maxRetries.value,
    concurrency: concurrency.value,
    useProxy: useProxy.value,
    timeout: 10000
  })
  taskId.value = result.taskId
}

async function cancelCheck(): Promise<void> {
  if (taskId.value) {
    await window.api.bookmarkCheck.cancel(taskId.value)
  }
  isCancelled.value = true
  phase.value = 'result'
  selectedInvalidIds.value = new Set(
    results.value.filter((r) => r.status === 'invalid').map((r) => r.bookmarkId)
  )
  removeListeners()
}

async function deleteSelected(): Promise<void> {
  const ids = Array.from(selectedInvalidIds.value)
  if (ids.length === 0) return

  for (const id of ids) {
    await bookmarkStore.deleteBookmark(id)
  }

  // 从结果列表中移除已删除的
  results.value = results.value.filter((r) => !ids.includes(r.bookmarkId))
  selectedInvalidIds.value = new Set()
}

function toggleSelect(id: string): void {
  const next = new Set(selectedInvalidIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedInvalidIds.value = next
}

function toggleSelectAll(): void {
  if (selectedInvalidIds.value.size === invalidResults.value.length) {
    selectedInvalidIds.value = new Set()
  } else {
    selectedInvalidIds.value = new Set(invalidResults.value.map((r) => r.bookmarkId))
  }
}

function handleClose(): void {
  if (phase.value === 'checking') {
    cancelCheck()
  }
  resetState()
  emit('update:open', false)
}

onUnmounted(() => {
  removeListeners()
})
</script>

<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-[560px] max-h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <ShieldCheck class="w-4 h-4" />
          检查失效书签
        </DialogTitle>
      </DialogHeader>

      <!-- 配置阶段 -->
      <div v-if="phase === 'config'" class="space-y-4 py-2">
        <p class="text-xs text-muted-foreground">
          将检查所有 {{ bookmarkStore.bookmarks.length }} 个书签的 URL 是否可达。
        </p>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">最大重试次数</label>
            <Input v-model.number="maxRetries" type="number" min="1" max="10" class="h-8 text-sm" />
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">并行数</label>
            <Input v-model.number="concurrency" type="number" min="1" max="20" class="h-8 text-sm" />
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
            :class="useProxy ? 'bg-primary' : 'bg-muted'"
            @click="useProxy = !useProxy"
          >
            <span
              class="inline-block h-4 w-4 rounded-full bg-white transition-transform"
              :class="useProxy ? 'translate-x-4' : 'translate-x-0.5'"
            />
          </button>
          <span class="text-xs">使用系统代理</span>
        </div>
      </div>

      <!-- 检查阶段 -->
      <div v-else-if="phase === 'checking'" class="flex-1 min-h-0 flex flex-col gap-3">
        <!-- 进度条 -->
        <div class="space-y-1">
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>{{ isCancelled ? '正在取消...' : '检查中...' }}</span>
            <span>{{ checkedCount }} / {{ totalCount }} ({{ progress }}%)</span>
          </div>
          <div class="h-2 bg-muted rounded-full overflow-hidden">
            <div
              class="h-full bg-primary transition-all duration-300"
              :style="{ width: `${progress}%` }"
            />
          </div>
          <div class="flex gap-3 text-xs text-muted-foreground">
            <span class="text-green-500">有效: {{ validCount }}</span>
            <span class="text-red-500">失效: {{ invalidResults.length }}</span>
          </div>
        </div>

        <Separator />

        <!-- 实时结果 -->
        <ScrollArea class="flex-1 min-h-0 max-h-[300px]">
          <div class="space-y-1 pr-2">
            <div
              v-for="item in results"
              :key="item.bookmarkId"
              class="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
              :class="item.status === 'valid' ? 'bg-green-500/5' : 'bg-red-500/5'"
            >
              <CheckCircle2 v-if="item.status === 'valid'" class="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              <XCircle v-else class="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="truncate font-medium">{{ item.title || item.url }}</p>
                <p v-if="item.status === 'invalid'" class="text-[10px] text-muted-foreground truncate">
                  {{ item.error || `HTTP ${item.statusCode}` }}{{ item.retries > 0 ? ` (重试 ${item.retries} 次)` : '' }}
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      <!-- 结果阶段 -->
      <div v-else-if="phase === 'result'" class="flex-1 min-h-0 flex flex-col gap-3">
        <!-- 统计摘要 -->
        <div class="flex items-center gap-4 text-sm">
          <span>总计: {{ results.length }}</span>
          <span class="text-green-500">有效: {{ validCount }}</span>
          <span class="text-red-500">失效: {{ invalidResults.length }}</span>
        </div>

        <template v-if="invalidResults.length > 0">
          <Separator />

          <!-- 失效列表 -->
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium">失效书签</span>
            <Button variant="ghost" size="sm" class="h-6 text-xs" @click="toggleSelectAll">
              {{ selectedInvalidIds.size === invalidResults.length ? '取消全选' : '全选' }}
            </Button>
          </div>

          <ScrollArea class="flex-1 min-h-0 max-h-[250px]">
            <div class="space-y-1 pr-2">
              <div
                v-for="item in invalidResults"
                :key="item.bookmarkId"
                class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 cursor-pointer text-xs"
                @click="toggleSelect(item.bookmarkId)"
              >
                <input
                  type="checkbox"
                  :checked="selectedInvalidIds.has(item.bookmarkId)"
                  class="w-3.5 h-3.5 flex-shrink-0"
                  @click.stop
                  @change="toggleSelect(item.bookmarkId)"
                />
                <XCircle class="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="truncate font-medium">{{ item.title || item.url }}</p>
                  <p class="text-[10px] text-muted-foreground truncate">
                    {{ item.url }}
                  </p>
                  <p class="text-[10px] text-muted-foreground">
                    {{ item.error || `HTTP ${item.statusCode}` }}{{ item.retries > 0 ? ` (重试 ${item.retries} 次)` : '' }}
                  </p>
                </div>
              </div>
            </div>
          </ScrollArea>
        </template>

        <div v-else class="py-6 text-center text-sm text-muted-foreground">
          所有书签均可正常访问
        </div>
      </div>

      <DialogFooter>
        <template v-if="phase === 'config'">
          <Button variant="ghost" size="sm" @click="handleClose">取消</Button>
          <Button
            size="sm"
            :disabled="bookmarkStore.bookmarks.length === 0"
            @click="startCheck"
          >
            开始检查
          </Button>
        </template>
        <template v-else-if="phase === 'checking'">
          <Button variant="ghost" size="sm" @click="cancelCheck">取消检查</Button>
        </template>
        <template v-else-if="phase === 'result'">
          <Button
            v-if="invalidResults.length > 0 && selectedInvalidIds.size > 0"
            variant="destructive"
            size="sm"
            class="gap-1"
            @click="deleteSelected"
          >
            <Trash2 class="w-3.5 h-3.5" />
            删除选中 ({{ selectedInvalidIds.size }})
          </Button>
          <Button size="sm" @click="handleClose">关闭</Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
```

---

### Task 7: 集成到 BookmarksPage

**Files:**
- Modify: `src/components/bookmarks/BookmarksPage.vue`

- [ ] **Step 1: 在 `BookmarksPage.vue` 中添加导入和状态**

在 `<script setup>` 顶部导入区域添加：

```typescript
import { ShieldCheck } from 'lucide-vue-next'
import BookmarkCheckDialog from './BookmarkCheckDialog.vue'
```

添加状态变量（在 `isExporting` ref 之后）：

```typescript
const checkDialogOpen = ref(false)
```

- [ ] **Step 2: 在工具栏添加按钮**

在 `BookmarksPage.vue` 模板中，导出按钮之后、`</div>` 闭合工具栏之前（约第 113 行后），添加：

```html
      <Button variant="ghost" size="sm" class="h-7 text-xs gap-1" @click="checkDialogOpen = true">
        <ShieldCheck class="w-3.5 h-3.5" />
        检查失效
      </Button>
```

- [ ] **Step 3: 在模板底部添加对话框组件**

在 `BookmarkDialog` 之后、`</div>` 闭合根元素之前（约第 158 行后），添加：

```html
    <!-- 失效检查对话框 -->
    <BookmarkCheckDialog
      :open="checkDialogOpen"
      @update:open="checkDialogOpen = $event"
    />
```

---

### Task 8: 构建验证

- [ ] **Step 1: 运行构建验证**

```bash
cd /Users/Zhuanz/Documents/sessionBox && pnpm build
```

Expected: 构建成功，无编译错误

- [ ] **Step 2: 启动开发模式验证**

```bash
cd /Users/Zhuanz/Documents/sessionBox && pnpm dev
```

验证项：
1. 书签管理页面工具栏显示"检查失效"按钮
2. 点击按钮弹出检查对话框
3. 配置参数可调整
4. 点击"开始检查"后进度条和结果实时更新
5. 取消功能正常
6. 结果页可勾选并批量删除失效书签
