<script setup lang="ts">
import { computed, onMounted } from 'vue'
import {
  Download,
  ArrowRight,
  Pause,
  Play,
  X,
  Loader2,
  CircleCheck,
  Server
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useDownloadStore } from '@/stores/download'

const downloadStore = useDownloadStore()

const emit = defineEmits<{ 'open-full': [] }>()

/** 幂等初始化：仅在未初始化时执行（config 为 null 说明从未调用 init） */
onMounted(async () => {
  if (!downloadStore.config) {
    await downloadStore.init()
  }
})

/** 最近 50 条任务 */
const recentTasks = computed(() =>
  [...downloadStore.allTasks].slice(0, 50)
)

/** 活跃任务数（含等待） */
const activeCount = computed(() =>
  downloadStore.allTasks.filter(t => t.status === 'active' || t.status === 'waiting' || t.status === 'paused').length
)

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
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

function statusIcon(status: string) {
  const map: Record<string, typeof Download> = {
    active: Loader2,
    paused: Pause,
    waiting: Loader2,
    complete: CircleCheck,
    error: X
  }
  return map[status] || Download
}

function statusIconClass(status: string) {
  if (status === 'active') return 'text-green-500 animate-spin'
  if (status === 'complete') return 'text-green-500'
  if (status === 'error') return 'text-red-500'
  return 'text-muted-foreground'
}

function handleOpenFull() {
  emit('open-full')
}
</script>

<template>
  <div class="w-80">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between px-3 pt-2 pb-2">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Download class="h-3.5 w-3.5 text-muted-foreground" />
        下载管理
        <Badge v-if="downloadStore.connected" variant="default" class="text-[10px] h-4">
          {{ activeCount }} 进行中
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="h-6 gap-1 text-xs text-primary hover:text-primary"
        @click="handleOpenFull"
      >
        查看全部
        <ArrowRight class="h-3 w-3" />
      </Button>
    </div>
    <Separator />

    <!-- 未连接状态 -->
    <div v-if="!downloadStore.connected" class="flex flex-col items-center justify-center py-8 gap-2">
      <Server class="h-8 w-8 text-muted-foreground" />
      <p class="text-xs text-muted-foreground">Aria2 服务未连接</p>
    </div>

    <!-- 列表 -->
    <template v-else>
      <ScrollArea class="h-[360px]">
        <div v-if="recentTasks.length === 0" class="flex items-center justify-center py-8">
          <p class="text-xs text-muted-foreground">暂无下载任务</p>
        </div>
        <div v-else class="py-1">
          <div
            v-for="task in recentTasks"
            :key="task.gid"
            class="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 rounded-sm transition-colors"
          >
            <!-- 状态图标 -->
            <div class="shrink-0 w-5 h-5 rounded bg-muted/50 flex items-center justify-center">
              <component :is="statusIcon(task.status)" :class="['h-3 w-3', statusIconClass(task.status)]" />
            </div>

            <!-- 信息 -->
            <div class="flex-1 min-w-0 space-y-0.5">
              <div class="flex items-center gap-1">
                <span class="text-xs truncate flex-1">{{ task.filename || task.url }}</span>
                <Badge :variant="statusVariant(task.status)" class="text-[10px] shrink-0 h-4">
                  {{ statusLabel(task.status) }}
                </Badge>
              </div>
              <!-- 进度（活跃/暂停/等待） -->
              <div v-if="['active', 'paused', 'waiting'].includes(task.status)" class="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{{ task.progress.toFixed(0) }}%</span>
                <span>{{ formatSize(task.completedLength) }} / {{ formatSize(task.totalLength) }}</span>
              </div>
              <!-- 已完成/出错 -->
              <div v-else class="text-[10px] text-muted-foreground">
                <span v-if="task.status === 'complete'">{{ formatSize(task.totalLength) }}</span>
                <span v-else-if="task.status === 'error'" class="text-red-500">{{ task.errorMessage || '下载失败' }}</span>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      <Separator />
      <!-- 底部统计 -->
      <div class="px-3 py-1.5 text-[10px] text-muted-foreground">
        共 {{ downloadStore.allTasks.length }} 个任务
      </div>
    </template>
  </div>
</template>
