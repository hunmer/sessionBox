<script setup lang="ts">
import { useWorkflowStore } from '@/stores/workflow'
import { ScrollArea } from '@/components/ui/scroll-area'
import { History } from 'lucide-vue-next'

const store = useWorkflowStore()

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>

<template>
  <div class="flex flex-col h-full">
    <ScrollArea class="flex-1">
      <div class="p-2 space-y-0.5">
        <div
          v-for="(op, index) in store.operationLog"
          :key="index"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
        >
          <History class="w-3 h-3 text-muted-foreground shrink-0" />
          <span class="flex-1 truncate">{{ op.description }}</span>
          <span class="text-[10px] text-muted-foreground shrink-0">
            {{ formatTime(op.timestamp) }}
          </span>
        </div>

        <div
          v-if="store.operationLog.length === 0"
          class="text-xs text-muted-foreground text-center py-6"
        >
          暂无操作记录
        </div>

        <div
          v-if="store.operationLog.length > 0"
          class="text-[10px] text-muted-foreground text-center pt-2"
        >
          共 {{ store.operationLog.length }} 条操作记录（最多 1000 条）
        </div>
      </div>
    </ScrollArea>
  </div>
</template>
