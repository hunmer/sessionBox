<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Play, Pause, Square, ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2, Circle } from 'lucide-vue-next'

const store = useWorkflowStore()
const expanded = ref(false)

const isRunning = computed(() => store.executionStatus === 'running')
const isPaused = computed(() => store.executionStatus === 'paused')
const canStart = computed(() => store.executionStatus === 'idle' || store.executionStatus === 'completed' || store.executionStatus === 'error')
const canPause = computed(() => isRunning.value)
const canResume = computed(() => isPaused.value)
const canStop = computed(() => isRunning.value || isPaused.value)

const progressText = computed(() => {
  if (!store.executionLog) return ''
  const completed = store.executionLog.steps.filter((s) => s.status === 'completed').length
  const total = store.executionLog.steps.length
  return `${completed}/${total}`
})

const elapsedText = computed(() => {
  if (!store.executionLog) return ''
  const start = store.executionLog.startedAt
  const end = store.executionLog.finishedAt || Date.now()
  const seconds = ((end - start) / 1000).toFixed(1)
  return `${seconds}s`
})

function formatDuration(start: number, end?: number): string {
  const ms = (end || Date.now()) - start
  return `${(ms / 1000).toFixed(1)}s`
}
</script>

<template>
  <div class="border-t border-border bg-background">
    <div class="flex items-center gap-2 px-3 py-1.5">
      <Button
        v-if="canResume"
        variant="ghost"
        size="sm"
        class="h-6 text-xs gap-1 px-2"
        @click="store.resumeExecution()"
      >
        <Play class="w-3 h-3" /> 继续
      </Button>
      <Button
        v-else
        variant="ghost"
        size="sm"
        class="h-6 text-xs gap-1 px-2"
        :disabled="!canStart"
        @click="store.startExecution()"
      >
        <Play class="w-3 h-3" /> 执行
      </Button>

      <Button
        variant="ghost"
        size="sm"
        class="h-6 text-xs gap-1 px-2"
        :disabled="!canPause"
        @click="store.pauseExecution()"
      >
        <Pause class="w-3 h-3" /> 暂停
      </Button>

      <Button
        variant="ghost"
        size="sm"
        class="h-6 text-xs gap-1 px-2"
        :disabled="!canStop"
        @click="store.stopExecution()"
      >
        <Square class="w-3 h-3" /> 停止
      </Button>

      <div class="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
        <span v-if="progressText">进度: {{ progressText }}</span>
        <span v-if="elapsedText">耗时: {{ elapsedText }}</span>
        <span>{{ store.executionStatus }}</span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        class="h-5 w-5 p-0"
        @click="expanded = !expanded"
      >
        <ChevronDown v-if="!expanded" class="w-3 h-3" />
        <ChevronUp v-else class="w-3 h-3" />
      </Button>
    </div>

    <div v-if="expanded && store.executionLog" class="border-t border-border">
      <ScrollArea class="max-h-[150px]">
        <div class="px-3 py-1 space-y-0.5">
          <div
            v-for="step in store.executionLog.steps"
            :key="step.nodeId"
            class="flex items-center gap-2 text-[10px] py-0.5"
          >
            <CheckCircle v-if="step.status === 'completed'" class="w-3 h-3 text-green-500 shrink-0" />
            <XCircle v-else-if="step.status === 'error'" class="w-3 h-3 text-red-500 shrink-0" />
            <Loader2 v-else-if="step.status === 'running'" class="w-3 h-3 text-blue-500 animate-spin shrink-0" />
            <Circle v-else class="w-3 h-3 text-muted-foreground shrink-0" />

            <span class="truncate flex-1">{{ step.nodeLabel }}</span>
            <span class="text-muted-foreground">
              {{ step.finishedAt ? formatDuration(step.startedAt, step.finishedAt) : '...' }}
            </span>
          </div>
        </div>
      </ScrollArea>
    </div>
  </div>
</template>
