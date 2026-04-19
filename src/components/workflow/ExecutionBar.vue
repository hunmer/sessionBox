<script setup lang="ts">
import { computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Play, Pause, Square, ChevronDown, ChevronUp, ChevronRight, CheckCircle, XCircle, Loader2, Circle, Trash2, AlertTriangle } from 'lucide-vue-next'
import type { ExecutionLog, ExecutionStep } from '@/lib/workflow/types'

const store = useWorkflowStore()
const expanded = defineModel<boolean>('expanded', { default: false })

const isRunning = computed(() => store.executionStatus === 'running')
const isPaused = computed(() => store.executionStatus === 'paused')
const canStart = computed(() => {
  if (isRunning.value || isPaused.value) return false
  return !store.executionValidationError
})
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

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatRelativeOffset(startTs: number, workflowStartTs: number): string {
  const offset = ((startTs - workflowStartTs) / 1000).toFixed(1)
  return `+${offset}s`
}

function formatDuration(start: number, end?: number): string {
  const ms = (end || Date.now()) - start
  return `${(ms / 1000).toFixed(1)}s`
}

function formatJson(data: any): string {
  if (data === undefined || data === null) return ''
  try {
    return typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

function selectLog(log: ExecutionLog) {
  store.selectedExecutionLogId = log.id
}

const displayLog = computed(() => store.selectedExecutionLog)
</script>

<template>
  <div class="border-t border-border bg-background flex flex-col h-full">
    <!-- 控制栏 -->
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

      <!-- 验证错误提示 -->
      <div
        v-if="store.executionValidationError && !isRunning && !isPaused"
        class="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400"
      >
        <AlertTriangle class="w-3 h-3 shrink-0" />
        <span>{{ store.executionValidationError }}</span>
      </div>

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
        <ChevronDown
          v-if="!expanded"
          class="w-3 h-3"
        />
        <ChevronUp
          v-else
          class="w-3 h-3"
        />
      </Button>
    </div>

    <!-- 展开区域：左右分栏 -->
    <div
      v-if="expanded"
      class="border-t border-border flex-1 min-h-0"
    >
      <ResizablePanelGroup
        direction="horizontal"
        class="h-full"
      >
        <!-- 左侧：历史执行列表 -->
        <ResizablePanel
          :default-size="25"
          :min-size="15"
          :max-size="40"
        >
          <div class="h-full flex flex-col">
            <div class="flex items-center justify-between px-2 py-1 border-b border-border">
              <span class="text-[10px] text-muted-foreground font-medium">执行历史</span>
              <Button
                v-if="store.executionLogs.length > 0"
                variant="ghost"
                size="sm"
                class="h-4 w-4 p-0"
                @click="store.clearExecutionLogs()"
              >
                <Trash2 class="w-2.5 h-2.5 text-muted-foreground" />
              </Button>
            </div>
            <ScrollArea class="flex-1 min-h-0">
              <div class="space-y-px p-1">
                <div
                  v-for="log in store.executionLogs"
                  :key="log.id"
                  class="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] cursor-pointer hover:bg-muted/50 transition-colors"
                  :class="store.selectedExecutionLogId === log.id ? 'bg-muted' : ''"
                  @click="selectLog(log)"
                >
                  <CheckCircle
                    v-if="log.status === 'completed'"
                    class="w-3 h-3 text-green-500 shrink-0"
                  />
                  <XCircle
                    v-else-if="log.status === 'error'"
                    class="w-3 h-3 text-red-500 shrink-0"
                  />
                  <Circle
                    v-else
                    class="w-3 h-3 text-muted-foreground shrink-0"
                  />

                  <div class="flex-1 min-w-0">
                    <div class="truncate">
                      {{ formatTime(log.startedAt) }}
                    </div>
                    <div class="text-muted-foreground">
                      {{ log.steps.length }} 节点 · {{ formatDuration(log.startedAt, log.finishedAt) }}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-4 w-4 p-0 shrink-0 opacity-0 group-hover:opacity-100"
                    @click.stop="store.deleteExecutionLog(log.id)"
                  >
                    <Trash2 class="w-2 h-2 text-muted-foreground" />
                  </Button>
                </div>

                <div
                  v-if="store.executionLogs.length === 0"
                  class="text-center text-[10px] text-muted-foreground py-4"
                >
                  暂无执行记录
                </div>
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle with-handle />

        <!-- 右侧：节点执行详情 -->
        <ResizablePanel
          :default-size="75"
          :min-size="40"
        >
          <div class="h-full flex flex-col">
            <div class="px-2 py-1 border-b border-border">
              <span class="text-[10px] text-muted-foreground font-medium">
                {{ displayLog ? `${formatTime(displayLog.startedAt)} · ${displayLog.steps.length} 节点` : '执行详情' }}
              </span>
            </div>
            <ScrollArea
              v-if="displayLog"
              class="flex-1 min-h-0"
            >
              <div class="p-2 space-y-1">
                <div
                  v-for="step in displayLog.steps"
                  :key="step.nodeId"
                  class="border border-border rounded p-2"
                >
                  <!-- 节点头部：状态 + 名称 + 相对时间 + 时长 -->
                  <div class="flex items-center gap-1.5">
                    <CheckCircle
                      v-if="step.status === 'completed'"
                      class="w-3 h-3 text-green-500 shrink-0"
                    />
                    <XCircle
                      v-else-if="step.status === 'error'"
                      class="w-3 h-3 text-red-500 shrink-0"
                    />
                    <Loader2
                      v-else-if="step.status === 'running'"
                      class="w-3 h-3 text-blue-500 animate-spin shrink-0"
                    />
                    <Circle
                      v-else
                      class="w-3 h-3 text-muted-foreground shrink-0"
                    />

                    <span class="text-xs font-medium truncate flex-1">{{ step.nodeLabel }}</span>
                    <span class="text-[10px] text-muted-foreground shrink-0">
                      {{ formatRelativeOffset(step.startedAt, displayLog.startedAt) }}
                    </span>
                    <span class="text-[10px] text-muted-foreground shrink-0 ml-1">
                      {{ step.finishedAt ? formatDuration(step.startedAt, step.finishedAt) : '...' }}
                    </span>
                  </div>

                  <!-- 错误信息 -->
                  <div
                    v-if="step.error"
                    class="mt-1 text-[10px] text-red-500 bg-red-500/10 rounded px-1.5 py-0.5"
                  >
                    {{ step.error }}
                  </div>

                  <!-- 输入信息（可折叠，默认展开） -->
                  <Collapsible
                    v-if="step.input !== undefined && step.input !== null"
                    :default-open="true"
                    class="mt-1"
                  >
                    <CollapsibleTrigger class="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full">
                      <ChevronRight class="w-2.5 h-2.5 transition-transform [[data-state=open]>&]:rotate-90" />
                      输入
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre class="mt-0.5 text-[10px] bg-muted/50 rounded px-1.5 py-1 overflow-auto max-h-[80px] whitespace-pre-wrap break-all">{{ formatJson(step.input) }}</pre>
                    </CollapsibleContent>
                  </Collapsible>

                  <!-- 输出信息（可折叠，默认展开） -->
                  <Collapsible
                    v-if="step.output !== undefined && step.output !== null"
                    :default-open="true"
                    class="mt-1"
                  >
                    <CollapsibleTrigger class="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full">
                      <ChevronRight class="w-2.5 h-2.5 transition-transform [[data-state=open]>&]:rotate-90" />
                      输出
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre class="mt-0.5 text-[10px] bg-muted/50 rounded px-1.5 py-1 overflow-auto max-h-[80px] whitespace-pre-wrap break-all">{{ formatJson(step.output) }}</pre>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>
            </ScrollArea>
            <div
              v-else
              class="flex-1 flex items-center justify-center text-[10px] text-muted-foreground"
            >
              选择一条执行记录查看详情
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  </div>
</template>
