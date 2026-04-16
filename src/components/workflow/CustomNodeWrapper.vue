<script setup lang="ts">
import { ref, computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
import { X } from 'lucide-vue-next'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import { useWorkflowStore } from '@/stores/workflow'

const props = defineProps<NodeProps>()
const store = useWorkflowStore()

const isEditing = ref(false)
const editLabel = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const definition = computed(() => getNodeDefinition(props.data?.nodeType || props.type))
const IconComponent = computed(() => resolveLucideIcon(definition.value?.icon || 'Circle'))

const nodeStatus = computed(() => {
  const step = store.executionLog?.steps.find((s) => s.nodeId === props.id)
  return step?.status || 'idle'
})

const statusColor = computed(() => {
  switch (nodeStatus.value) {
    case 'running': return 'border-blue-500 shadow-blue-500/30 shadow-md animate-pulse'
    case 'completed': return 'border-green-500'
    case 'error': return 'border-red-500'
    default: return 'border-border'
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

const displayLabel = computed(() => props.data?.label || definition.value?.label || props.type)
</script>

<template>
  <NodeResizer :is-visible="props.selected" min-width="140" min-height="60" />

  <div
    class="group/node bg-background border-2 rounded-lg shadow-sm w-full h-full cursor-pointer transition-colors relative"
    :class="[statusColor, props.selected ? 'ring-2 ring-primary' : '']"
    @click="store.selectedNodeId = String(id)"
    @contextmenu.prevent
  >
    <!-- 输入连接点 -->
    <Handle
      id="target"
      type="target"
      :position="Position.Left"
      :connectable="props.connectable"
      class="!z-10 !w-3 !h-3 !bg-blue-500 !border-2 !border-blue-300"
    />

    <!-- 悬浮删除按钮 -->
    <button
      class="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/node:opacity-100 transition-opacity hover:bg-destructive/80 z-10"
      @click.stop="handleDelete"
    >
      <X class="w-3 h-3" />
    </button>

    <div class="flex items-center gap-2 px-3 py-2 border-b border-border/50">
      <component :is="IconComponent" v-if="IconComponent" class="w-4 h-4 text-muted-foreground shrink-0" />
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
      />
      <div
        v-else
        class="text-xs truncate hover:bg-muted/50 rounded px-1 py-0.5"
        @dblclick.stop="startEdit"
      >
        {{ displayLabel }}
      </div>
    </div>

    <!-- 输出连接点 -->
    <Handle
      id="source"
      type="source"
      :position="Position.Right"
      :connectable="props.connectable"
      class="!z-10 !w-3 !h-3 !bg-emerald-500 !border-2 !border-emerald-300"
    />
  </div>
</template>
