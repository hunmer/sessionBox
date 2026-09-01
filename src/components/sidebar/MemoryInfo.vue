<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

defineProps<{ collapsed?: boolean }>()

const appMemoryKB = ref(0)
const totalMemoryKB = ref(0)

const api = window.api

// 应用占用百分比
const appPercent = computed(() =>
  totalMemoryKB.value ? (appMemoryKB.value / totalMemoryKB.value) * 100 : 0
)

function formatMB(kb: number): string {
  return (kb / 1024).toFixed(0)
}

function formatGB(kb: number): string {
  return (kb / 1024 / 1024).toFixed(1)
}

let timer: ReturnType<typeof setInterval> | null = null

async function refreshMemory() {
  try {
    const info = await api.system.memory()
    appMemoryKB.value = info.appMemoryKB
    totalMemoryKB.value = info.totalMemoryKB
  } catch {
    // 主进程未就绪
  }
}

onMounted(() => {
  refreshMemory()
  timer = setInterval(refreshMemory, 5000)
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})
</script>

<template>
  <div class="px-3 pt-2 pb-1 text-xs text-sidebar-foreground/60 space-y-1.5">
    <!-- 应用占用进度条 -->
    <div
      class="flex h-2 w-full overflow-hidden rounded-full bg-sidebar-foreground/5"
      :title="`应用占用: ${formatMB(appMemoryKB)} MB (${appPercent.toFixed(1)}%) · 系统总内存: ${formatGB(totalMemoryKB)} GB`"
    >
      <div
        class="h-full bg-blue-500 transition-all duration-700"
        :style="{ width: `${appPercent}%` }"
      />
    </div>
  </div>
</template>
