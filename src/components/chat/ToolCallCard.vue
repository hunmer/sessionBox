<script setup lang="ts">
import { ref } from 'vue'
import type { ToolCall } from '@/types'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

const props = defineProps<{
  toolCall: ToolCall
}>()

const showResult = ref(false)

const statusConfig: Record<string, { label: string; class: string; icon: string }> = {
  pending: { label: '等待中', class: 'bg-muted text-muted-foreground', icon: '⏳' },
  running: { label: '执行中', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: '⚙️' },
  completed: { label: '完成', class: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: '✅' },
  error: { label: '错误', class: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: '❌' },
}

const config = statusConfig[props.toolCall.status] ?? statusConfig.pending
</script>

<template>
  <div class="my-1 rounded-md border text-xs">
    <div class="flex items-center justify-between px-3 py-1.5">
      <span class="font-mono font-medium">{{ toolCall.name }}</span>
      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium" :class="config.class">
        {{ config.icon }} {{ config.label }}
      </span>
    </div>
    <div class="px-3 pb-1.5 text-muted-foreground">
      <div class="font-mono text-[11px] bg-muted/50 rounded px-2 py-1 overflow-x-auto">
        {{ JSON.stringify(toolCall.args, null, 2) }}
      </div>
    </div>
    <Collapsible v-if="toolCall.result != null || toolCall.error" v-model:open="showResult">
      <CollapsibleTrigger class="w-full px-3 pb-1 text-left text-muted-foreground hover:text-foreground cursor-pointer text-[11px]">
        {{ showResult ? '收起结果' : '查看结果' }}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div v-if="toolCall.error" class="px-3 pb-2 text-red-500 font-mono text-[11px]">{{ toolCall.error }}</div>
        <div v-else class="px-3 pb-2 font-mono text-[11px] bg-muted/50 rounded mx-3 mb-2 px-2 py-1 overflow-x-auto max-h-40">
          {{ typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2) }}
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
