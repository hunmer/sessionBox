<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Download } from 'lucide-vue-next'
import { useDownloadStore } from '@/stores/download'

const props = defineProps<{ collapsed?: boolean }>()

const emit = defineEmits<{
  'open-full': []
}>()

const store = useDownloadStore()

/** 幂等初始化：确保 store 已加载配置并订阅了系统下载进度推送 */
onMounted(async () => {
  if (!store.config) {
    await store.init()
  } else {
    // 已初始化过，仅补拉一次系统下载任务（保持最新）
    await store.refreshSystemTasks()
  }
})

const summary = computed(() => store.downloadSummary)

/** 是否有任何下载任务（活跃 + 待下载 + 失败），无则隐藏整个组件 */
const hasTasks = computed(() =>
  summary.value.active + summary.value.waiting + summary.value.error > 0
)

/** 进度条各段宽度百分比（基于总进度百分比，绿色/灰色/红色三段） */
const activeWidth = computed(() => Math.max(0, Math.min(100, summary.value.progress)))
/** 失败段：固定显示一个小红块，提示有错误（视觉提示，不按比例） */
const errorWidth = computed(() => (summary.value.error > 0 ? Math.min(8, 100 - activeWidth.value) : 0))

function formatSpeed(bytes: number): string {
  if (bytes <= 0) return '0 B/s'
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

function handleClick() {
  emit('open-full')
}
</script>

<template>
  <div
    v-if="hasTasks"
    class="px-3 pt-2 pb-1 text-xs text-sidebar-foreground/60"
  >
    <!-- 展开态：一行摘要 + 进度条 -->
    <template v-if="!props.collapsed">
      <button
        type="button"
        class="w-full flex items-center justify-between hover:text-sidebar-foreground transition-colors"
        :title="`下载中 ${summary.active} · 等待 ${summary.waiting} · 失败 ${summary.error} · ${formatSpeed(summary.totalSpeed)}`"
        @click="handleClick"
      >
        <span class="flex items-center gap-1">
          <Download class="h-3 w-3" />
          下载 {{ summary.active + summary.waiting }}
          <span
            v-if="summary.error > 0"
            class="text-red-500"
          >· {{ summary.error }} 失败</span>
        </span>
        <span class="text-green-600">{{ formatSpeed(summary.totalSpeed) }}</span>
      </button>

      <!-- 总体进度条：绿色=已完成进度，灰色=待下载，红色尾段=有失败任务 -->
      <div class="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-sidebar-foreground/5">
        <div
          class="h-full bg-green-500 transition-all duration-500"
          :style="{ width: `${activeWidth}%` }"
        />
        <div
          v-if="errorWidth > 0"
          class="h-full bg-red-500 transition-all duration-500"
          :style="{ width: `${errorWidth}%` }"
        />
      </div>
      <div
        v-if="summary.progress > 0"
        class="mt-0.5 text-[10px] text-muted-foreground text-right"
      >
        {{ summary.progress.toFixed(0) }}%
      </div>
    </template>

    <!-- 折叠态：仅图标 + 角标 -->
    <button
      v-else
      type="button"
      class="relative w-full flex justify-center py-0.5 hover:text-sidebar-foreground transition-colors"
      :title="`下载中 ${summary.active} · 等待 ${summary.waiting} · 失败 ${summary.error} · ${formatSpeed(summary.totalSpeed)} · ${summary.progress.toFixed(0)}%`"
      @click="handleClick"
    >
      <Download class="h-4 w-4" />
      <span class="absolute top-0 right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-green-500 text-white text-[9px] leading-[14px] text-center">
        {{ summary.active + summary.waiting }}
      </span>
      <span
        v-if="summary.error > 0"
        class="absolute -top-0.5 left-1 min-w-[10px] h-[10px] px-0.5 rounded-full bg-red-500 text-white text-[8px] leading-[10px] text-center"
      >!</span>
    </button>
  </div>
</template>
