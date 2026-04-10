<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { ShieldCheck, CheckCircle2, XCircle, Loader2 } from 'lucide-vue-next'
import { useBookmarkStore } from '@/stores/bookmark'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const bookmarkStore = useBookmarkStore()
const api = window.api

// ====== 配置参数 ======
const maxRetries = ref(5)
const concurrency = ref(5)
const useProxy = ref(false)
const timeout = ref(10000)

// ====== 阶段管理 ======
type Phase = 'setup' | 'checking' | 'result'
const phase = ref<Phase>('setup')

// ====== 检查状态 ======
const taskId = ref('')
const isCancelling = ref(false)
const progress = ref(0)
const totalCount = ref(0)

interface CheckResult {
  bookmarkId: string
  title: string
  url: string
  status: 'valid' | 'invalid'
  statusCode?: number
  error?: string
  retries: number
}

const results = ref<CheckResult[]>([])
const invalidResults = computed(() => results.value.filter((r) => r.status === 'invalid'))
const validCount = computed(() => results.value.filter((r) => r.status === 'valid').length)
const invalidCount = computed(() => invalidResults.value.length)

// ====== 结果阶段 - 批量选择 ======
const selectedInvalidIds = ref<Set<string>>(new Set())
const allInvalidSelected = computed<boolean>({
  get: () => invalidResults.value.length > 0 && selectedInvalidIds.value.size === invalidResults.value.length,
  set: (val) => {
    if (val) {
      selectedInvalidIds.value = new Set(invalidResults.value.map((r) => r.bookmarkId))
    } else {
      selectedInvalidIds.value = new Set()
    }
  }
})

function toggleInvalidItem(id: string) {
  const next = new Set(selectedInvalidIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedInvalidIds.value = next
}

// ====== IPC 事件监听 ======
let cleanupProgress: (() => void) | null = null
let cleanupDone: (() => void) | null = null

function cleanupListeners() {
  cleanupProgress?.()
  cleanupProgress = null
  cleanupDone?.()
  cleanupDone = null
}

onUnmounted(cleanupListeners)

// ====== 操作 ======

function resetState() {
  phase.value = 'setup'
  taskId.value = ''
  isCancelling.value = false
  progress.value = 0
  totalCount.value = 0
  results.value = []
  selectedInvalidIds.value = new Set()
  cleanupListeners()
}

function handleClose() {
  if (phase.value === 'checking') return // 检查中不允许关闭
  resetState()
  emit('update:open', false)
}

function startCheck() {
  // 收集所有书签（或根据搜索/过滤条件）
  const bookmarks = bookmarkStore.bookmarks.map((b) => ({
    id: b.id,
    url: b.url,
    title: b.title
  }))

  if (bookmarks.length === 0) return

  totalCount.value = bookmarks.length
  results.value = []
  phase.value = 'checking'

  // 监听进度事件
  cleanupProgress = api.on('bookmark-check:progress', (data: unknown) => {
    const event = data as CheckResult & { taskId: string }
    if (event.taskId !== taskId.value) return

    results.value.push({
      bookmarkId: event.bookmarkId,
      title: event.title || event.url,
      url: event.url || '',
      status: event.status,
      statusCode: event.statusCode,
      error: event.error,
      retries: event.retries
    })
    progress.value = results.value.length
  })

  cleanupDone = api.on('bookmark-check:done', (data: unknown) => {
    const event = data as { taskId: string; total: number; valid: number; invalid: number }
    if (event.taskId !== taskId.value) return

    // 全部完成，进入结果阶段
    progress.value = totalCount.value
    phase.value = 'result'

    // 默认选中所有失效书签
    selectedInvalidIds.value = new Set(invalidResults.value.map((r) => r.bookmarkId))

    cleanupListeners()
  })

  // 调用 IPC 启动检查
  api.bookmarkCheck.start({
    bookmarks,
    maxRetries: maxRetries.value,
    concurrency: concurrency.value,
    useProxy: useProxy.value,
    timeout: timeout.value
  }).then((res) => {
    taskId.value = res.taskId
  })
}

async function cancelCheck() {
  if (!taskId.value) return
  isCancelling.value = true
  try {
    await api.bookmarkCheck.cancel(taskId.value)
    // 已完成的结果保留，进入结果阶段
    phase.value = 'result'
    selectedInvalidIds.value = new Set(invalidResults.value.map((r) => r.bookmarkId))
    cleanupListeners()
  } finally {
    isCancelling.value = false
  }
}

const isDeleting = ref(false)

async function deleteSelected() {
  if (isDeleting.value || selectedInvalidIds.value.size === 0) return
  isDeleting.value = true
  try {
    for (const id of selectedInvalidIds.value) {
      await bookmarkStore.deleteBookmark(id)
    }
    resetState()
    emit('update:open', false)
  } finally {
    isDeleting.value = false
  }
}

// 对话框打开时重置状态
import { watch } from 'vue'
watch(() => props.open, (val) => {
  if (val) resetState()
})
</script>

<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-[560px] max-h-[80vh] flex flex-col" :hide-close="phase === 'checking'">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <ShieldCheck class="w-4 h-4" />
          书签健康检查
        </DialogTitle>
      </DialogHeader>

      <!-- ====== 设置阶段 ====== -->
      <div v-if="phase === 'setup'" class="space-y-4 py-2">
        <p class="text-xs text-muted-foreground">
          将检查 <span class="font-medium text-foreground">{{ bookmarkStore.bookmarks.length }}</span> 个书签的可用性
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
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">超时时间 (ms)</label>
            <Input v-model.number="timeout" type="number" min="3000" max="60000" step="1000" class="h-8 text-sm" />
          </div>
          <div class="flex items-end gap-2 pb-0.5">
            <Checkbox v-model="useProxy" id="useProxy" />
            <label for="useProxy" class="text-xs text-muted-foreground cursor-pointer">使用系统代理</label>
          </div>
        </div>
      </div>

      <!-- ====== 检查阶段 ====== -->
      <div v-else-if="phase === 'checking'" class="space-y-3 py-2 flex-1 min-h-0">
        <div class="flex items-center justify-between text-xs">
          <span class="text-muted-foreground">
            已检查 {{ progress }} / {{ totalCount }}
          </span>
          <span class="flex items-center gap-3">
            <span class="text-green-600">有效 {{ validCount }}</span>
            <span class="text-red-500">失效 {{ invalidCount }}</span>
          </span>
        </div>
        <Progress :model-value="(progress / totalCount) * 100" class="h-2" />

        <ScrollArea class="h-[300px] border rounded-md">
          <div class="p-2 space-y-1">
            <div
              v-for="(item, idx) in results"
              :key="idx"
              class="flex items-start gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted/50"
            >
              <CheckCircle2 v-if="item.status === 'valid'" class="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
              <XCircle v-else class="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium">{{ item.title }}</div>
                <div class="truncate text-muted-foreground">{{ item.url }}</div>
                <div v-if="item.error" class="text-red-400 mt-0.5">
                  {{ item.error }}{{ item.retries > 0 ? ` (重试 ${item.retries} 次)` : '' }}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      <!-- ====== 结果阶段 ====== -->
      <div v-else-if="phase === 'result'" class="space-y-3 py-2 flex-1 min-h-0">
        <div class="flex items-center justify-center gap-6 py-3 text-sm border rounded-md">
          <div class="text-center">
            <div class="font-semibold text-lg">{{ totalCount }}</div>
            <div class="text-xs text-muted-foreground">总数</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-lg text-green-600">{{ validCount }}</div>
            <div class="text-xs text-muted-foreground">有效</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-lg text-red-500">{{ invalidCount }}</div>
            <div class="text-xs text-muted-foreground">失效</div>
          </div>
        </div>

        <div v-if="invalidResults.length > 0">
          <div class="flex items-center gap-2 mb-2">
            <Checkbox v-model="allInvalidSelected" id="selectAll" />
            <label for="selectAll" class="text-xs text-muted-foreground cursor-pointer">全选</label>
            <span class="text-xs text-muted-foreground ml-auto">
              已选 {{ selectedInvalidIds.size }} / {{ invalidResults.length }}
            </span>
          </div>

          <ScrollArea class="h-[240px] border rounded-md">
            <div class="p-2 space-y-1">
              <div
                v-for="item in invalidResults"
                :key="item.bookmarkId"
                class="flex items-start gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted/50"
              >
                <Checkbox
                  :model-value="selectedInvalidIds.has(item.bookmarkId)"
                  @update:model-value="toggleInvalidItem(item.bookmarkId)"
                  class="mt-0.5"
                />
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium">{{ item.title }}</div>
                  <div class="truncate text-muted-foreground">{{ item.url }}</div>
                  <div class="text-red-400 mt-0.5">
                    {{ item.error }}{{ item.retries > 0 ? ` (重试 ${item.retries} 次)` : '' }}
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        <div v-else class="text-center py-6 text-sm text-muted-foreground">
          <CheckCircle2 class="w-8 h-8 text-green-600 mx-auto mb-2" />
          所有书签均有效
        </div>
      </div>

      <!-- ====== 底部按钮 ====== -->
      <DialogFooter>
        <template v-if="phase === 'setup'">
          <Button variant="ghost" size="sm" @click="handleClose">取消</Button>
          <Button size="sm" :disabled="bookmarkStore.bookmarks.length === 0" @click="startCheck">
            开始检查
          </Button>
        </template>
        <template v-else-if="phase === 'checking'">
          <Button size="sm" variant="ghost" :disabled="isCancelling" @click="cancelCheck">
            <Loader2 v-if="isCancelling" class="w-3.5 h-3.5 mr-1 animate-spin" />
            {{ isCancelling ? '正在取消...' : '取消检查' }}
          </Button>
        </template>
        <template v-else-if="phase === 'result'">
          <Button variant="ghost" size="sm" @click="handleClose">关闭</Button>
          <Button
            v-if="invalidResults.length > 0"
            size="sm"
            variant="destructive"
            :disabled="selectedInvalidIds.size === 0 || isDeleting"
            @click="deleteSelected"
          >
            <Loader2 v-if="isDeleting" class="w-3.5 h-3.5 mr-1 animate-spin" />
            {{ isDeleting ? '删除中...' : `批量删除选中 (${selectedInvalidIds.size})` }}
          </Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
