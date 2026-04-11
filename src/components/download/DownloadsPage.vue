<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useDownloadStore } from '@/stores/download'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '@/components/ui/resizable'
import DownloadFilterPanel from './DownloadFilterPanel.vue'
import {
  Download,
  Pause,
  Play,
  X,
  Trash2,
  Settings,
  ArrowDownToLine,
  Loader2,
  Server,
  CircleCheck,
  FolderOpen
} from 'lucide-vue-next'

const store = useDownloadStore()
const emit = defineEmits<{ 'open-download-settings': [] }>()

const filterStatus = ref<'all' | 'active' | 'waiting' | 'complete' | 'error'>('all')
const selectedSite = ref<string | null>(null)
const selectedCategory = ref<string | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await store.init()

  if (store.config?.autoStart && !store.connected) {
    await store.start()
  }

  pollTimer = setInterval(async () => {
    if (store.connected) {
      await Promise.all([store.refreshTasks(), store.refreshStat()])
    }
  }, 2000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

// ====== 文件格式分类辅助 ======

const FILE_EXTENSIONS: Record<string, string[]> = {
  video: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts'],
  audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso', '.dmg'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff'],
  document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.md', '.rtf']
}

function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex === -1) return ''
  return filename.slice(dotIndex).toLowerCase()
}

function getFileCategory(filename: string): string | null {
  const ext = getFileExtension(filename)
  if (!ext) return null
  for (const [category, extensions] of Object.entries(FILE_EXTENSIONS)) {
    if (extensions.includes(ext)) return category
  }
  return null
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return '未知来源'
  }
}

// ====== 过滤逻辑 ======

const filteredTasks = computed(() => {
  let tasks = store.allTasks

  // 按状态过滤
  if (filterStatus.value !== 'all') {
    if (filterStatus.value === 'active') {
      tasks = tasks.filter((t) => t.status === 'active' || t.status === 'waiting' || t.status === 'paused')
    } else {
      tasks = tasks.filter((t) => t.status === filterStatus.value)
    }
  }

  // 按站点过滤
  if (selectedSite.value) {
    tasks = tasks.filter((t) => extractHostname(t.url) === selectedSite.value)
  }

  // 按格式过滤
  if (selectedCategory.value) {
    tasks = tasks.filter((t) => getFileCategory(t.filename || t.url) === selectedCategory.value)
  }

  return tasks
})

// ====== 格式化工具 ======

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

function formatSpeed(bytes: number): string {
  if (bytes === 0) return '-'
  return formatSize(bytes) + '/s'
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    active: '下载中',
    waiting: '等待中',
    paused: '已暂停',
    complete: '已完成',
    error: '出错',
    removed: '已移除'
  }
  return map[status] || status
}

function statusVariant(status: string) {
  if (status === 'active') return 'default' as const
  if (status === 'complete') return 'secondary' as const
  if (status === 'error') return 'destructive' as const
  return 'outline' as const
}

// ====== 文件操作 ======

/** 获取任务文件的完整路径 */
async function getTaskFilePath(task: { dir: string; filename: string }): Promise<string> {
  return window.api.download.getFilePath(task.dir, task.filename)
}

/** 双击打开已下载的文件 */
async function openFile(task: { dir: string; filename: string; status: string }) {
  if (task.status !== 'complete' || !task.filename) return
  const filePath = await getTaskFilePath(task)
  await window.api.download.openFile(filePath)
}

/** 在系统文件管理器中显示文件 */
async function showInFolder(task: { dir: string; filename: string }) {
  const filePath = await getTaskFilePath(task)
  await window.api.download.showInFolder(filePath)
}

// 拖拽状态：记录当前正在拖拽的文件路径
const draggingFilePath = ref<string | null>(null)

/** mousedown 时预加载文件路径，避免 async 导致 startDrag 失败 */
async function onItemMouseDown(task: { dir: string; filename: string; status: string }) {
  if (task.status !== 'complete' || !task.filename) {
    draggingFilePath.value = null
    return
  }
  draggingFilePath.value = await getTaskFilePath(task)
}

/** 拖拽开始时，通知主进程执行原生文件拖拽 */
function onDragStart(event: DragEvent) {
  event.preventDefault()
  if (draggingFilePath.value) {
    window.api.download.startDrag(draggingFilePath.value)
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <!-- 顶栏 -->
    <div class="shrink-0 border-b px-6 py-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Download class="w-5 h-5" />
          <h1 class="text-lg font-semibold">下载管理</h1>
        </div>
        <div class="flex items-center gap-2">
          <Badge :variant="store.connected ? 'default' : 'outline'" class="text-xs">
            {{ store.connected ? '已连接' : '未连接' }}
          </Badge>
          <Button size="sm" variant="outline" @click="emit('open-download-settings')">
            <Settings class="w-4 h-4" />
          </Button>
        </div>
      </div>

      <!-- 全局统计 -->
      <div v-if="store.connected && store.globalStat" class="flex items-center gap-4 text-sm text-muted-foreground">
        <span class="flex items-center gap-1">
          <ArrowDownToLine class="w-3.5 h-3.5 text-green-500" />
          {{ formatSpeed(store.globalStat.downloadSpeed) }}
        </span>
        <span>{{ store.globalStat.numActive }} 活跃</span>
        <span>{{ store.globalStat.numWaiting }} 等待</span>
        <span>{{ store.globalStat.numStopped }} 已完成</span>
      </div>
    </div>

    <!-- 主内容区：左右分栏 -->
    <ResizablePanelGroup direction="horizontal" class="flex-1 min-h-0">
      <!-- 左侧过滤器面板 -->
      <ResizablePanel :default-size="20" :min-size="15" :max-size="35" :collapsible="true" :collapsed-size="0">
        <DownloadFilterPanel
          :tasks="store.allTasks"
          :selected-site="selectedSite"
          :selected-category="selectedCategory"
          @update:selected-site="selectedSite = $event"
          @update:selected-category="selectedCategory = $event"
        />
      </ResizablePanel>

      <ResizableHandle with-handle />

      <!-- 右侧文件列表 -->
      <ResizablePanel :default-size="80">
        <div class="h-full flex flex-col">
          <!-- 筛选标签 + 操作 -->
          <div class="shrink-0 px-4 pt-3 pb-2 flex items-center gap-1">
            <Button
              v-for="opt in ([
                ['all', '全部'],
                ['active', '进行中'],
                ['complete', '已完成'],
                ['error', '出错']
              ] as const)"
              :key="opt[0]"
              size="sm"
              :variant="filterStatus === opt[0] ? 'default' : 'ghost'"
              class="h-7 text-xs px-2.5"
              @click="filterStatus = opt[0]"
            >
              {{ opt[1] }}
            </Button>
            <div class="flex-1" />
            <Button v-if="store.connected" size="sm" variant="ghost" class="h-7 text-xs" @click="store.purge()">
              <Trash2 class="w-3.5 h-3.5 mr-1" /> 清除记录
            </Button>
          </div>

          <!-- 任务列表 -->
          <div class="flex-1 min-h-0 overflow-auto px-4 pb-2">
            <!-- 未连接状态 -->
            <div v-if="!store.connected" class="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Server class="w-10 h-10" />
              <p class="text-sm">Aria2 服务未连接</p>
              <Button size="sm" @click="emit('open-download-settings')">
                <Settings class="w-3.5 h-3.5 mr-1" /> 配置连接
              </Button>
            </div>

            <!-- 空列表 -->
            <div v-else-if="filteredTasks.length === 0" class="flex items-center justify-center h-full text-sm text-muted-foreground">
              暂无下载任务
            </div>

            <!-- 任务列表 -->
            <div v-else class="space-y-1">
              <div
                v-for="task in filteredTasks"
                :key="task.gid"
                class="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-muted/50 transition-colors group"
                :class="{ 'cursor-grab': task.status === 'complete' && task.filename }"
                :draggable="task.status === 'complete' && !!task.filename"
                @mousedown="onItemMouseDown(task)"
                @dragstart="onDragStart"
                @dblclick="openFile(task)"
              >
                <!-- 文件图标 -->
                <div class="shrink-0 w-8 h-8 rounded bg-muted flex items-center justify-center">
                  <Download v-if="task.status === 'active'" class="w-4 h-4 text-green-500" />
                  <Pause v-else-if="task.status === 'paused'" class="w-4 h-4 text-yellow-500" />
                  <Loader2 v-else-if="task.status === 'waiting'" class="w-4 h-4 text-muted-foreground animate-spin" />
                  <CircleCheck v-else-if="task.status === 'complete'" class="w-4 h-4 text-green-500" />
                  <X v-else-if="task.status === 'error'" class="w-4 h-4 text-red-500" />
                </div>

                <!-- 信息 -->
                <div class="flex-1 min-w-0 space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm truncate">{{ task.filename || task.url }}</span>
                    <Badge :variant="statusVariant(task.status)" class="text-[10px] shrink-0">
                      {{ statusLabel(task.status) }}
                    </Badge>
                  </div>

                  <!-- 进度条（活跃/暂停/等待） -->
                  <div v-if="['active', 'paused', 'waiting'].includes(task.status)" class="space-y-0.5">
                    <div class="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        class="h-full bg-primary rounded-full transition-all"
                        :style="{ width: task.progress + '%' }"
                      />
                    </div>
                    <div class="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{{ task.progress.toFixed(1) }}%</span>
                      <span>{{ formatSize(task.completedLength) }} / {{ formatSize(task.totalLength) }}</span>
                      <span v-if="task.downloadSpeed > 0" class="text-green-600">
                        {{ formatSpeed(task.downloadSpeed) }}
                      </span>
                    </div>
                  </div>

                  <!-- 已完成/出错 -->
                  <div v-else class="text-[11px] text-muted-foreground">
                    <span v-if="task.status === 'complete'">{{ formatSize(task.totalLength) }}</span>
                    <span v-else-if="task.status === 'error'" class="text-red-500">{{ task.errorMessage || '下载失败' }}</span>
                  </div>
                </div>

                <!-- 操作按钮 -->
                <div class="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button v-if="task.status === 'active'" size="icon" variant="ghost" class="h-7 w-7" @click="store.pause(task.gid)">
                    <Pause class="w-3.5 h-3.5" />
                  </Button>
                  <Button v-if="task.status === 'paused' || task.status === 'waiting'" size="icon" variant="ghost" class="h-7 w-7" @click="store.resume(task.gid)">
                    <Play class="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    v-if="task.status === 'complete' && task.filename"
                    size="icon"
                    variant="ghost"
                    class="h-7 w-7"
                    title="打开文件夹位置"
                    @click="showInFolder(task)"
                  >
                    <FolderOpen class="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" class="h-7 w-7" @click="store.remove(task.gid)">
                    <X class="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
</template>
