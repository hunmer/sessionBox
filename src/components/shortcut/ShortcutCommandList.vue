<!-- 共享快捷键动作列表：按分组展示全部快捷键动作，支持按名称/键位/全局搜索 -->
<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed, onMounted } from 'vue'
import { Globe } from 'lucide-vue-next'
import { useShortcutStore } from '@/stores/shortcut'
import { acceleratorToParts } from '@/lib/accelerator'
import { Kbd } from '@/components/ui/kbd'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from '@/components/ui/command'
import type { ShortcutItem } from '../../../preload/index'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const emit = defineEmits<{
  (e: 'select', item: ShortcutItem): void
}>()

const store = useShortcutStore()

// 共享 store：已在其他页面（如设置页）加载过则不重复请求
onMounted(() => {
  if (!store.shortcuts.length) store.load()
})

/** 参与搜索匹配的文本（名称 + 连写键位 + 全局标记） */
function searchableText(item: ShortcutItem): string {
  const keys = acceleratorToParts(item.accelerator).join('+')
  return [item.label, keys, item.global ? '全局 global' : ''].filter(Boolean).join(' ')
}

const groupedShortcuts = computed(() =>
  store.groups.map(group => ({
    ...group,
    items: store.getShortcutsByGroup(group.key)
  }))
)
</script>

<template>
  <Command :class="props.class">
    <CommandInput placeholder="搜索快捷键动作或按键..." />
    <CommandList>
      <CommandEmpty>未找到匹配的快捷键动作</CommandEmpty>
      <CommandGroup
        v-for="group in groupedShortcuts"
        :key="group.key"
        :heading="group.label"
      >
        <CommandItem
          v-for="item in group.items"
          :key="item.id"
          :value="searchableText(item)"
          :disabled="!item.enabled"
          @select="emit('select', item)"
        >
          <!-- 视觉隐藏的搜索文本：过滤基于渲染文本，补上连写键位让 "Ctrl+Shift+T" 这类查询可命中 -->
          <span class="sr-only">{{ searchableText(item) }}</span>
          <span class="flex-1 truncate">{{ item.label }}</span>
          <Globe
            v-if="item.global"
            class="size-3 shrink-0 text-muted-foreground"
          />
          <CommandShortcut class="flex items-center gap-1 tracking-normal">
            <Kbd
              v-for="key in acceleratorToParts(item.accelerator)"
              :key="key"
            >{{ key }}</Kbd>
            <span
              v-if="!item.accelerator"
              class="text-xs text-muted-foreground/60"
            >未设置</span>
          </CommandShortcut>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
</template>
