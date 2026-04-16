<script setup lang="ts">
import { computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import type { OutputField } from '@/lib/workflow/types'
import { Braces } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const props = defineProps<{
  excludeNodeId: string
}>()

const emit = defineEmits<{
  select: [path: string]
}>()

const store = useWorkflowStore()

/** 获取画布上除当前节点外的所有节点 */
const otherNodes = computed(() => {
  if (!store.currentWorkflow) return []
  return store.currentWorkflow.nodes.filter((n) => n.id !== props.excludeNodeId)
})

/** 获取节点图标组件 */
function getNodeIcon(type: string) {
  const def = getNodeDefinition(type)
  if (!def) return null
  return resolveLucideIcon(def.icon)
}

/** 获取节点标签 */
function getNodeLabel(node: { type: string; label: string }) {
  const def = getNodeDefinition(node.type)
  return node.label || def?.label || node.type
}

/** 将输出字段树递归展平为路径列表 */
function flattenFields(
  fields: OutputField[],
  parentPath = '',
): { path: string; display: string; type: string }[] {
  const result: { path: string; display: string; type: string }[] = []
  for (const field of fields) {
    const currentPath = parentPath ? `${parentPath}.${field.key}` : field.key
    result.push({
      path: currentPath,
      display: currentPath,
      type: field.type,
    })
    if (field.type === 'object' && field.children?.length) {
      result.push(...flattenFields(field.children, currentPath))
    }
  }
  return result
}

/** 获取节点的输出字段列表 */
function getNodeOutputs(node: { data: Record<string, any> }) {
  const outputs: OutputField[] = node.data?.outputs ?? []
  return flattenFields(outputs)
}

/** 生成变量引用字符串 */
function buildVariablePath(nodeId: string, fieldPath: string): string {
  return `{{ __data__["${nodeId}"].${fieldPath} }}`
}

/** 点击字段 */
function handleSelectField(nodeId: string, fieldPath: string) {
  emit('select', buildVariablePath(nodeId, fieldPath))
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground"
        title="插入变量"
      >
        <Braces class="w-3.5 h-3.5" />
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent align="end" class="w-56">
      <template v-if="otherNodes.length === 0">
        <DropdownMenuLabel class="text-xs text-muted-foreground">
          画布上没有其他节点
        </DropdownMenuLabel>
      </template>

      <template v-for="node in otherNodes" :key="node.id">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger class="text-xs">
            <component
              :is="getNodeIcon(node.type)"
              v-if="getNodeIcon(node.type)"
              class="w-3.5 h-3.5 mr-1.5 shrink-0 text-muted-foreground"
            />
            <span class="truncate">{{ getNodeLabel(node) }}</span>
          </DropdownMenuSubTrigger>

          <DropdownMenuSubContent class="min-w-[180px]">
            <template v-if="getNodeOutputs(node).length > 0">
              <DropdownMenuItem
                v-for="output in getNodeOutputs(node)"
                :key="output.path"
                class="text-xs"
                @click="handleSelectField(node.id, output.path)"
              >
                <span class="font-mono text-muted-foreground mr-1.5 text-[10px]">
                  {{ output.type }}
                </span>
                <span class="truncate">{{ output.display }}</span>
              </DropdownMenuItem>
            </template>
            <div v-else class="px-2 py-1.5 text-xs text-muted-foreground">
              无输出字段
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
