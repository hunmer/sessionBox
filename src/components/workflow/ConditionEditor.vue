<script setup lang="ts">
import { computed, nextTick } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import draggable from 'vuedraggable'
import { useWorkflowStore } from '@/stores/workflow'
import { CONDITION_OPERATORS, NO_VALUE_OPERATORS } from '@/lib/workflow/nodeRegistry'
import type { ConditionItem } from '@/lib/workflow/types'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import VariablePicker from './VariablePicker.vue'
import { X, GripVertical } from 'lucide-vue-next'

const store = useWorkflowStore()
const { updateNodeInternals } = useVueFlow()

const conditions = computed<ConditionItem[]>({
  get: () => store.selectedNode?.data?.conditions || [],
  set: (val) => {
    if (store.selectedNodeId) {
      store.updateNodeData(store.selectedNodeId, { conditions: val })
      nextTick(() => updateNodeInternals([store.selectedNodeId!]))
    }
  },
})

function addCondition() {
  conditions.value = [
    ...conditions.value,
    {
      id: 'cond_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      variable: '',
      operator: 'equals',
      value: '',
    },
  ]
}

function removeCondition(index: number) {
  const next = [...conditions.value]
  next.splice(index, 1)
  conditions.value = next
}

function updateCondition(index: number, field: keyof ConditionItem, value: string) {
  const next = [...conditions.value]
  next[index] = { ...next[index], [field]: value }
  conditions.value = next
}

function insertVariable(index: number, variablePath: string) {
  const cond = conditions.value[index]
  updateCondition(index, 'variable', (cond?.variable || '') + variablePath)
}

function onDragEnd() {
  // vuedraggable 已修改 modelValue 数组顺序，无需额外操作
  nextTick(() => {
    if (store.selectedNodeId) updateNodeInternals([store.selectedNodeId])
  })
}
</script>

<template>
  <div class="border-t border-border pt-3 space-y-2">
    <div class="flex items-center justify-between">
      <span class="text-xs font-medium">条件分支</span>
      <Button
        variant="ghost"
        size="sm"
        class="h-5 px-1.5 text-[10px] gap-0.5"
        @click="addCondition"
      >
        + 添加条件
      </Button>
    </div>

    <draggable
      :model-value="conditions"
      item-key="id"
      handle=".cond-drag-handle"
      :animation="150"
      @update:model-value="conditions = $event"
      @end="onDragEnd"
    >
      <template #item="{ element: cond, index: idx }">
        <div class="rounded border border-border p-2 space-y-1.5 relative group/cond mb-1.5">
          <div class="flex items-center gap-1">
            <GripVertical class="w-3 h-3 text-muted-foreground/50 cursor-grab cond-drag-handle shrink-0" />
            <span class="text-[10px] text-muted-foreground w-7 shrink-0">条件 {{ idx + 1 }}</span>
            <div class="flex-1 flex items-center gap-1">
              <Input
                :model-value="cond.variable"
                placeholder="变量"
                class="h-6 text-[11px] flex-1"
                @update:model-value="updateCondition(idx, 'variable', String($event))"
              />
              <VariablePicker
                v-if="store.selectedNodeId"
                :exclude-node-id="store.selectedNodeId"
                @select="insertVariable(idx, $event)"
              />
            </div>
          </div>
          <div class="flex items-center gap-1 pl-[22px]">
            <Select
              :model-value="cond.operator"
              @update:model-value="updateCondition(idx, 'operator', String($event ?? ''))"
            >
              <SelectTrigger class="h-6 text-[11px] w-full">
                <SelectValue placeholder="操作符" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="op in CONDITION_OPERATORS"
                  :key="op.value"
                  :value="op.value"
                  class="text-xs"
                >
                  {{ op.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div
            v-if="!NO_VALUE_OPERATORS.has(cond.operator)"
            class="flex items-center gap-1 pl-[22px]"
          >
            <Input
              :model-value="cond.value"
              placeholder="比较值"
              class="h-6 text-[11px] flex-1"
              @update:model-value="updateCondition(idx, 'value', String($event))"
            />
          </div>
          <button
            class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/cond:opacity-100 transition-opacity"
            @click="removeCondition(idx)"
          >
            <X class="w-2.5 h-2.5" />
          </button>
        </div>
      </template>
    </draggable>

    <div
      v-if="conditions.length === 0"
      class="text-[11px] text-muted-foreground text-center py-2"
    >
      无条件，所有输入走默认分支
    </div>

    <div class="rounded border border-dashed border-orange-400/50 p-1.5">
      <span class="text-[10px] text-orange-500">默认分支：以上条件均不匹配时执行</span>
    </div>
  </div>
</template>
