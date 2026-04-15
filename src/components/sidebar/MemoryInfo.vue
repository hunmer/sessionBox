<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTabStore } from '@/stores/tab'

const tabStore = useTabStore()

const appMemoryKB = ref(0)
const totalMemoryKB = ref(0)
const freeMemoryKB = ref(0)

const api = window.api

// 应用占用百分比
const appPercent = computed(() =>
  totalMemoryKB.value ? (appMemoryKB.value / totalMemoryKB.value) * 100 : 0
)

// 系统其他进程占用百分比
const otherPercent = computed(() => {
  const systemUsed = totalMemoryKB.value - freeMemoryKB.value
  const otherUsed = Math.max(0, systemUsed - appMemoryKB.value)
  return totalMemoryKB.value ? (otherUsed / totalMemoryKB.value) * 100 : 0
})

// 空闲百分比
const freePercent = computed(() =>
  totalMemoryKB.value ? (freeMemoryKB.value / totalMemoryKB.value) * 100 : 0
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
    freeMemoryKB.value = info.freeMemoryKB
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
    <!-- 标签数量 + 应用内存 -->
    <div class="flex items-center justify-between">
      <span>{{ tabStore.tabs.length }} 个标签</span>
      <span>{{ formatMB(appMemoryKB) }} MB / {{ formatGB(totalMemoryKB) }} GB</span>
    </div>

    <!-- 三色进度条 -->
    <div
      class="flex h-2 w-full overflow-hidden rounded-full bg-sidebar-foreground/5"
      :title="`应用: ${formatMB(appMemoryKB)} MB (${appPercent.toFixed(1)}%) · 系统: ${formatMB(totalMemoryKB - freeMemoryKB - appMemoryKB)} MB (${otherPercent.toFixed(1)}%) · 空闲: ${formatMB(freeMemoryKB)} MB (${freePercent.toFixed(1)}%)`"
    >
      <!-- 应用占用 -->
      <div
        class="h-full bg-blue-500 transition-all duration-700"
        :style="{ width: `${appPercent}%` }"
      />
      <!-- 系统其他占用 -->
      <div
        class="h-full bg-amber-400 transition-all duration-700"
        :style="{ width: `${otherPercent}%` }"
      />
      <!-- 空闲区域保持背景色 -->
    </div>
  </div>
</template>
