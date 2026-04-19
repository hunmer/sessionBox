<script setup lang="ts">
import { computed } from 'vue'
import type { OutputField } from '@/lib/workflow/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  modelValue: OutputField[]
  depth?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: OutputField[]]
}>()

const fields = computed({
  get: () => props.modelValue ?? [],
  set: (val) => emit('update:modelValue', val),
})

const indent = computed(() => (props.depth ?? 0) * 16)

const TYPE_OPTIONS = [
  { label: 'String', value: 'string' },
  { label: 'Number', value: 'number' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Object', value: 'object' },
  { label: 'Any', value: 'any' },
]

function createEmptyField(): OutputField {
  return { key: '', type: 'string', value: '' }
}

function updateField(index: number, patch: Partial<OutputField>) {
  const updated = [...fields.value]
  updated[index] = { ...updated[index], ...patch }
  // type 变更为非 object 时清空 children
  if (patch.type && patch.type !== 'object') {
    updated[index].children = undefined
  }
  // type 变更为 object 时初始化 children
  if (patch.type === 'object' && !updated[index].children) {
    updated[index].children = []
    updated[index].value = undefined
  }
  fields.value = updated
}

function updateChildren(index: number, children: OutputField[]) {
  const updated = [...fields.value]
  updated[index] = { ...updated[index], children }
  fields.value = updated
}

function removeField(index: number) {
  fields.value = fields.value.filter((_, i) => i !== index)
}

function addField() {
  fields.value = [...fields.value, createEmptyField()]
}

function addChildField(index: number) {
  const field = fields.value[index]
  const children = [...(field.children ?? []), createEmptyField()]
  updateChildren(index, children)
}
</script>

<template>
  <div class="space-y-1">
    <!-- 表头 -->
    <div
      v-if="depth === 0"
      class="grid gap-1 text-[10px] text-muted-foreground font-medium"
      style="grid-template-columns: 1fr 80px 1fr 52px"
    >
      <span>名称</span>
      <span>类型</span>
      <span>值</span>
      <span />
    </div>

    <!-- 字段行 -->
    <div
      v-for="(field, index) in fields"
      :key="index"
      class="space-y-0.5"
    >
      <div
        class="grid gap-1 items-center"
        style="grid-template-columns: 1fr 80px 1fr 52px"
        :style="{ paddingLeft: `${indent}px` }"
      >
        <!-- 名称 -->
        <Input
          :model-value="field.key"
          placeholder="字段名"
          class="h-6 text-[11px]"
          @update:model-value="updateField(index, { key: $event })"
        />

        <!-- 类型 -->
        <Select
          :model-value="field.type"
          @update:model-value="updateField(index, { type: $event as OutputField['type'] })"
        >
          <SelectTrigger class="!h-6 !px-2 !py-0 w-full text-[11px] !gap-0.5 [&_svg]:!size-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="opt in TYPE_OPTIONS"
              :key="opt.value"
              :value="opt.value"
              class="text-[11px]"
            >
              {{ opt.label }}
            </SelectItem>
          </SelectContent>
        </Select>

        <!-- 值 -->
        <Input
          v-if="field.type !== 'object'"
          :model-value="field.value ?? ''"
          placeholder="默认值"
          class="h-6 text-[11px]"
          @update:model-value="updateField(index, { value: $event })"
        />
        <span
          v-else
          class="h-6"
        />

        <!-- 操作 -->
        <div class="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            class="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
            @click="removeField(index)"
          >
            <Trash2 class="w-2.5 h-2.5" />
          </Button>
        </div>
      </div>

      <!-- 递归子字段 -->
      <OutputFieldEditor
        v-if="field.type === 'object'"
        :model-value="field.children ?? []"
        :depth="(depth ?? 0) + 1"
        @update:model-value="updateChildren(index, $event)"
      />
    </div>

    <!-- 添加按钮 -->
    <Button
      variant="ghost"
      size="sm"
      class="h-5 text-[10px] gap-0.5 w-full text-muted-foreground hover:text-foreground"
      :style="{ paddingLeft: `${indent}px` }"
      @click="addField"
    >
      <Plus class="w-2.5 h-2.5" />
      添加字段
    </Button>
  </div>
</template>
