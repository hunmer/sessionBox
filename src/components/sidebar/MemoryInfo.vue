<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { HardDrive } from 'lucide-vue-next'
import { useTabStore } from '@/stores/tab'

const tabStore = useTabStore()

const appMemoryMB = ref(0)
const totalMemoryGB = ref(0)
const usedPercent = ref(0)

const api = window.api

let timer: ReturnType<typeof setInterval> | null = null

async function refreshMemory() {
  try {
    const info = await api.system.memory()
    const appMB = Math.round(info.appMemoryKB / 1024)
    const totalGB = +(info.totalMemoryKB / 1024 / 1024).toFixed(1)
    const used = ((info.totalMemoryKB - info.freeMemoryKB) / info.totalMemoryKB) * 100

    appMemoryMB.value = appMB
    totalMemoryGB.value = totalGB
    usedPercent.value = Math.round(used)
  } catch {
    // 主进程未就绪或不可用
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
  <div class="flex items-center gap-2 px-3 py-2 text-xs text-sidebar-foreground/50">
    <HardDrive class="h-3.5 w-3.5 shrink-0" />
    <div class="flex flex-1 items-center justify-between gap-2">
      <span>{{ tabStore.tabs.length }} 个标签</span>
      <span>{{ appMemoryMB }} MB</span>
    </div>
    <div
      class="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-sidebar-foreground/10"
      :title="`系统内存已使用 ${usedPercent}%（共 ${totalMemoryGB} GB）`"
    >
      <div
        class="h-full rounded-full transition-all duration-500"
        :class="usedPercent > 80 ? 'bg-red-500' : usedPercent > 60 ? 'bg-yellow-500' : 'bg-green-500'"
        :style="{ width: `${usedPercent}%` }"
      />
    </div>
  </div>
</template>
