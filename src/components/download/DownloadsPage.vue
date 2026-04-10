<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useDownloadStore } from '@/stores/download'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Download,
  Upload,
  Pause,
  Play,
  X,
  Trash2,
  Settings,
  ArrowDownToLine,
  Loader2,
  FolderOpen,
  Server,
  RefreshCw,
  CircleCheck
} from 'lucide-vue-next'
import type { DownloadTask } from '@/stores/download'

const store = useDownloadStore()
const showConfig = ref(false)
const filterStatus = ref<'all' | 'active' | 'waiting' | 'complete' | 'error'>('all')

// 编辑中的配置（不直接修改 store）
const editConfig = ref<Record<string, any>>({})

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await store.init()
  editConfig.value = { ...store.config }

  if (store.config?.autoStart && !store.connected) {
    await store.start()
  }

  // 连接状态下轮询刷新
  pollTimer = setInterval(async () => {
    if (store.connected) {
      await Promise.all([store.refreshTasks(), store.refreshStat()])
    }
  }, 2000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

const filteredTasks = computed(() => {
  const tasks = store.allTasks
  if (filterStatus.value === 'all') return tasks
  if (filterStatus.value === 'active') return tasks.filter((t) => t.status === 'active' || t.status === 'waiting' || t.status === 'paused')
  return tasks.filter((t) => t.status === filterStatus.value)
})

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

function toggleConfig() {
  if (showConfig.value) {
    // 保存配置
    store.saveConfig(editConfig.value)
  }
  showConfig.value = !showConfig.value
}

async function handleToggleConnection() {
  if (store.connected) {
    await store.stop()
  } else {
    const ok = await store.start()
    if (ok) {
      await store.refreshTasks()
      await store.refreshStat()
    }
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
          <Button size="sm" variant="outline" @click="toggleConfig">
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

      <!-- 配置面板 -->
      <div v-if="showConfig" class="space-y-3 pt-2">
        <Separator />
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">服务器地址</label>
            <Input v-model="editConfig.host" placeholder="localhost" />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">端口</label>
            <Input v-model.number="editConfig.port" type="number" />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">RPC 密钥</label>
            <Input v-model="editConfig.secret" type="password" />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">aria2c 路径</label>
            <Input v-model="editConfig.aria2Path" placeholder="aria2c" />
          </div>
          <div class="col-span-2 space-y-1">
            <label class="text-xs text-muted-foreground">下载目录（留空使用系统默认）</label>
            <Input v-model="editConfig.downloadDir" placeholder="系统下载目录" />
          </div>
        </div>
        <div class="flex items-center gap-4 text-sm">
          <label class="flex items-center gap-2">
            <Switch :checked="editConfig.autoStart" @update:checked="editConfig.autoStart = $event" />
            自动启动
          </label>
        </div>
        <div class="flex items-center gap-2">
          <Button size="sm" @click="handleToggleConnection" :disabled="store.loading">
            <template v-if="store.connected">
              <Server class="w-3.5 h-3.5 mr-1" /> 停止
            </template>
            <template v-else>
              <Server class="w-3.5 h-3.5 mr-1" /> 启动
            </template>
          </Button>
          <Button size="sm" variant="outline" @click="store.checkConnection()">
            <RefreshCw class="w-3.5 h-3.5 mr-1" /> 检测连接
          </Button>
        </div>
        <Separator />
      </div>

      <!-- 筛选标签 -->
      <div class="flex items-center gap-1">
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
    </div>

    <!-- 任务列表 -->
    <div class="flex-1 min-h-0 overflow-auto px-4 py-2">
      <!-- 未连接状态 -->
      <div v-if="!store.connected" class="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Server class="w-10 h-10" />
        <p class="text-sm">Aria2 服务未连接</p>
        <Button size="sm" @click="showConfig = true">
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
            <Button size="icon" variant="ghost" class="h-7 w-7" @click="store.remove(task.gid)">
              <X class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
