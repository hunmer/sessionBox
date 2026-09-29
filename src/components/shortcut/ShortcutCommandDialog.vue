<!-- 快捷键速查弹窗：搜索全部快捷键动作，回车按 actionId 执行（复用快捷键同一条执行路径） -->
<script setup lang="ts">
import { nextTick, ref } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import ShortcutCommandList from './ShortcutCommandList.vue'
import { executeShortcutAction } from '@/lib/shortcut-action'
import type { ShortcutItem } from '../../../preload/index'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const listRef = ref<InstanceType<typeof ShortcutCommandList> | null>(null)

// 接管 reka-ui FocusScope 的自动焦点，聚焦到搜索输入框
function handleOpenAutoFocus(e: Event) {
  e.preventDefault()
  nextTick(() => {
    ;(listRef.value?.$el as HTMLElement | undefined)
      ?.querySelector('input')
      ?.focus()
  })
}

function handleSelect(item: ShortcutItem) {
  emit('update:open', false)
  executeShortcutAction(item.id)
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent
      class="overflow-hidden p-0"
      :show-close-button="false"
      @open-auto-focus="handleOpenAutoFocus"
    >
      <DialogHeader class="sr-only">
        <DialogTitle>快捷键速查</DialogTitle>
        <DialogDescription>搜索快捷键动作，回车执行</DialogDescription>
      </DialogHeader>
      <ShortcutCommandList
        ref="listRef"
        class="h-[400px]"
        @select="handleSelect"
      />
      <div class="flex items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
        <span class="flex items-center gap-1">
          <Kbd class="h-5 min-w-[20px] px-1 text-[10px]">↑</Kbd>
          <Kbd class="h-5 min-w-[20px] px-1 text-[10px]">↓</Kbd>
          导航
        </span>
        <span class="flex items-center gap-1">
          <Kbd class="h-5 min-w-[20px] px-1 text-[10px]">↵</Kbd>
          执行
        </span>
        <span class="flex items-center gap-1">
          <Kbd class="h-5 min-w-[20px] px-1 text-[10px]">Esc</Kbd>
          关闭
        </span>
        <span class="ml-auto">默认 Ctrl+/ · 可在设置中修改</span>
      </div>
    </DialogContent>
  </Dialog>
</template>
