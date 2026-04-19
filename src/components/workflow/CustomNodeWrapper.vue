<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
import { X, CircleSlash, SkipForward } from 'lucide-vue-next'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import { useWorkflowStore } from '@/stores/workflow'
import type { NodeRunState } from '@/lib/workflow/types'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

const props = defineProps<NodeProps>()
const store = useWorkflowStore()
const { updateNodeInternals } = useVueFlow()

const isEditing = ref(false)
const editLabel = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const definition = computed(() => getNodeDefinition(props.data?.nodeType || props.type))
const IconComponent = computed(() => resolveLucideIcon(definition.value?.icon || 'Circle'))

/** 是否显示输入/输出连接点 */
const showTargetHandle = computed(() => definition.value?.handles?.target !== false)
const showSourceHandle = computed(() => definition.value?.handles?.source !== false)

/** 是否为流程边界节点（开始/结束） */
const isBoundaryNode = computed(() => definition.value?.type === 'start' || definition.value?.type === 'end')

/** 获取当前节点的运行状态 */
const currentNodeState = computed<NodeRunState>(() => {
  const node = store.currentWorkflow?.nodes.find((n) => n.id === props.id)
  return node?.nodeState || 'normal'
})

/** 执行时的节点状态 */
const nodeStatus = computed(() => {
  const step = store.executionLog?.steps.find((s) => s.nodeId === props.id)
  return step?.status || 'idle'
})

/** 节点状态对应的样式 */
const statusColor = computed(() => {
  switch (nodeStatus.value) {
    case 'running':
      return 'border-blue-500 shadow-blue-500/30 shadow-md animate-pulse'
    case 'completed':
      return 'border-green-500'
    case 'error':
      return 'border-red-500'
    case 'skipped':
      return 'border-yellow-500'
    default:
      return 'border-border'
  }
})

/** 节点运行状态对应的背景样式 */
const stateBackground = computed(() => {
  if (currentNodeState.value !== 'normal') {
    switch (currentNodeState.value) {
      case 'disabled':
        return 'bg-red-500/10'
      case 'skipped':
        return 'bg-yellow-500/10'
    }
  }
  // 开始/结束节点的特殊背景色
  if (definition.value?.type === 'start') return 'bg-emerald-500/10'
  if (definition.value?.type === 'end') return 'bg-slate-500/10'
  return 'bg-background'
})

/** 状态徽标文字 */
const stateBadge = computed(() => {
  switch (currentNodeState.value) {
    case 'disabled':
      return '已禁用'
    case 'skipped':
      return '已跳过'
    default:
      return ''
  }
})

function startEdit() {
  editLabel.value = props.data?.label || ''
  isEditing.value = true
  setTimeout(() => inputRef.value?.focus(), 0)
}

function finishEdit() {
  isEditing.value = false
  store.updateNodeLabel(String(props.id), editLabel.value)
}

function handleDelete() {
  store.removeNode(String(props.id))
}

function handleClone() {
  store.cloneNode(String(props.id))
}

function setNodeState(state: NodeRunState) {
  store.updateNodeState(String(props.id), state)
}

function refreshNodeInternals(reason: string) {
  nextTick(() => {
    updateNodeInternals([props.id])
  })
}

const displayLabel = computed(() => props.data?.label || definition.value?.label || props.type)

/** 动态输出连接点（switch 节点） */
const dynamicHandles = computed(() => {
  const ds = definition.value?.handles?.dynamicSource
  if (!ds) return null
  const conditions: any[] = props.data?.[ds.dataKey] || []
  const extra = ds.extraCount || 0
  const total = conditions.length + extra
  if (total === 0) return null
  return Array.from({ length: total }, (_, i) => ({
    id: i < conditions.length ? `case-${i}` : 'default',
    label: i < conditions.length ? `条件 ${i + 1}` : '默认',
    index: i,
    total,
  }))
})

function getHandleTop(index: number, total: number): string {
  return `${((index + 1) / (total + 1)) * 100}%`
}

onMounted(() => {
  refreshNodeInternals('mounted')
})
</script>

<template>
  <NodeResizer
    :is-visible="props.selected"
    min-width="140"
    min-height="60"
  />

  <ContextMenu>
    <ContextMenuTrigger as-child>
      <div
        class="group/node border-2 rounded-lg shadow-sm w-full h-full cursor-pointer transition-colors relative"
        :class="[statusColor, stateBackground, props.selected ? 'ring-2 ring-primary' : '']"
        @click="store.selectedNodeId = String(id)"
      >
        <!-- 输入连接点 -->
        <Handle
          v-if="showTargetHandle"
          id="target"
          type="target"
          :position="Position.Left"
          :connectable="props.connectable"
          class="!z-10 !w-3 !h-3 !bg-blue-500 !border-2 !border-blue-300"
        />

        <!-- 悬浮删除按钮（开始/结束节点隐藏） -->
        <button
          v-if="!isBoundaryNode"
          class="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/node:opacity-100 transition-opacity hover:bg-destructive/80 z-10"
          @click.stop="handleDelete"
        >
          <X class="w-3 h-3" />
        </button>

        <!-- 状态徽标 -->
        <span
          v-if="stateBadge"
          class="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] px-1.5 py-0 rounded-full font-medium z-10"
          :class="currentNodeState === 'disabled'
            ? 'bg-red-500 text-white'
            : 'bg-yellow-500 text-white'"
        >
          {{ stateBadge }}
        </span>

        <div class="flex items-center gap-2 px-3 py-2 border-b border-border/50">
          <component
            :is="IconComponent"
            v-if="IconComponent"
            class="w-4 h-4 text-muted-foreground shrink-0"
          />
          <span class="text-xs text-muted-foreground truncate">{{ definition?.label || type }}</span>
        </div>

        <div class="px-3 py-1.5">
          <input
            v-if="isEditing"
            ref="inputRef"
            v-model="editLabel"
            class="w-full text-xs bg-transparent outline-none border-b border-primary"
            @blur="finishEdit"
            @keyup.enter="finishEdit"
            @click.stop
          >
          <div
            v-else
            class="text-xs truncate hover:bg-muted/50 rounded px-1 py-0.5"
            :class="{ 'opacity-50 line-through': currentNodeState === 'disabled' }"
            @dblclick.stop="startEdit"
          >
            {{ displayLabel }}
          </div>
        </div>

        <!-- 输出连接点 -->
        <Handle
          v-if="showSourceHandle && !dynamicHandles"
          id="source"
          type="source"
          :position="Position.Right"
          :connectable="props.connectable"
          class="!z-10 !w-3 !h-3 !bg-emerald-500 !border-2 !border-emerald-300"
        />

        <!-- 动态输出连接点（switch 节点） -->
        <template v-if="dynamicHandles">
          <div
            v-for="h in dynamicHandles"
            :key="h.id"
            class="absolute right-0 flex items-center"
            :style="{ top: getHandleTop(h.index, h.total), transform: 'translateY(-50%)' }"
          >
            <span class="text-[9px] text-muted-foreground mr-1 whitespace-nowrap">{{ h.label }}</span>
            <Handle
              :id="h.id"
              type="source"
              :position="Position.Right"
              :connectable="props.connectable"
              class="!relative !top-0 !translate-y-0 !z-10 !w-2.5 !h-2.5"
              :class="h.id === 'default' ? '!bg-orange-500 !border-orange-300' : '!bg-emerald-500 !border-emerald-300'"
              :style="{ borderWidth: '2px' }"
            />
          </div>
        </template>
      </div>
    </ContextMenuTrigger>

    <ContextMenuContent class="w-48">
      <ContextMenuItem @click="setNodeState('normal')">
        <CircleSlash class="w-4 h-4 mr-2 text-green-500" />
        正常
      </ContextMenuItem>
      <ContextMenuItem @click="setNodeState('disabled')">
        <CircleSlash class="w-4 h-4 mr-2 text-red-500" />
        禁用（中止执行）
      </ContextMenuItem>
      <ContextMenuItem @click="setNodeState('skipped')">
        <SkipForward class="w-4 h-4 mr-2 text-yellow-500" />
        跳过（跳过执行）
      </ContextMenuItem>
      <template v-if="!isBoundaryNode">
        <ContextMenuSeparator />
        <ContextMenuItem @click="handleClone">
          复制节点
        </ContextMenuItem>
        <ContextMenuItem
          class="text-destructive"
          @click="handleDelete"
        >
          删除节点
        </ContextMenuItem>
      </template>
    </ContextMenuContent>
  </ContextMenu>
</template>
