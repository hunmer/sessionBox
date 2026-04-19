<script setup lang="ts">
import type { OutputField } from '@/lib/workflow/types'
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import VariableFieldMenu from './VariableFieldMenu.vue'

const props = defineProps<{
  fields: OutputField[]
  parentPath?: string
  nodeId: string
}>()

const emit = defineEmits<{
  select: [nodeId: string, fieldPath: string]
}>()

function buildPath(key: string): string {
  return props.parentPath ? `${props.parentPath}.${key}` : key
}
</script>

<template>
  <template
    v-for="field in fields"
    :key="field.key"
  >
    <!-- object 类型 → 递归子菜单 -->
    <DropdownMenuSub v-if="field.type === 'object' && field.children?.length">
      <DropdownMenuSubTrigger class="text-xs">
        <span class="font-mono text-muted-foreground mr-1.5 text-[10px]">object</span>
        <span class="truncate">{{ field.key }}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent class="min-w-[180px]">
        <VariableFieldMenu
          :fields="field.children!"
          :parent-path="buildPath(field.key)"
          :node-id="nodeId"
          @select="(id: string, path: string) => emit('select', id, path)"
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
    <!-- 叶子字段 → 直接点击 -->
    <DropdownMenuItem
      v-else
      class="text-xs"
      @click="emit('select', nodeId, buildPath(field.key))"
    >
      <span class="font-mono text-muted-foreground mr-1.5 text-[10px]">
        {{ field.type }}
      </span>
      <span class="truncate">{{ field.key }}</span>
    </DropdownMenuItem>
  </template>
</template>
