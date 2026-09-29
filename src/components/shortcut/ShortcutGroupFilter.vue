<!-- 分类过滤按钮行：渲染于 Command 内部（CommandInput 之下），
     切换分类时清空 command 搜索词（避免新渲染的条目不参与旧搜索过滤） -->
<script setup lang="ts">
import { useCommand } from '@/components/ui/command'

defineProps<{
  groups: { key: string; label: string }[]
  /** 当前选中的分类 key，空字符串表示全部 */
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const command = useCommand()

function select(key: string) {
  if (command) command.filterState.search = ''
  emit('update:modelValue', key)
}
</script>

<template>
  <div class="flex items-center gap-1 overflow-x-auto border-b px-2 py-1.5">
    <button
      class="flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-1 text-xs transition-colors"
      :class="modelValue === '' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'"
      @click="select('')"
    >
      全部
    </button>
    <button
      v-for="group in groups"
      :key="group.key"
      class="flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-1 text-xs transition-colors"
      :class="modelValue === group.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'"
      @click="select(group.key)"
    >
      {{ group.label }}
    </button>
  </div>
</template>
