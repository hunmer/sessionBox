<script setup lang="ts">
import draggable from 'vuedraggable'
import { GripVertical, RotateCcw } from 'lucide-vue-next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useToolbarStore, type ToolbarEntry } from '@/stores/toolbar'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const toolbarStore = useToolbarStore()

function onReorder(entries: ToolbarEntry[]) {
  toolbarStore.applyOrder(entries)
}

function toggleVisible(id: string, value: boolean | string | number) {
  toolbarStore.setVisible(id, Boolean(value))
}
</script>

<template>
  <Dialog
    :open="props.open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="sm:max-w-[360px]">
      <DialogHeader>
        <DialogTitle>自定义工具栏</DialogTitle>
        <DialogDescription>拖拽调整图标顺序，开关控制是否显示，实时生效并自动保存。</DialogDescription>
      </DialogHeader>

      <draggable
        :model-value="toolbarStore.config"
        item-key="id"
        handle=".drag-handle"
        :animation="150"
        tag="div"
        class="flex max-h-[50vh] flex-col gap-1 overflow-y-auto"
        @update:model-value="onReorder"
      >
        <template #item="{ element }">
          <div class="flex items-center gap-2 rounded-md border px-2 py-1.5">
            <GripVertical class="drag-handle h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
            <component
              :is="toolbarStore.defOf(element.id)?.icon"
              v-if="toolbarStore.defOf(element.id)?.icon"
              class="h-4 w-4 shrink-0"
            />
            <span class="flex-1 truncate text-sm">{{ toolbarStore.defOf(element.id)?.label ?? element.id }}</span>
            <Switch
              :model-value="element.visible"
              :aria-label="toolbarStore.defOf(element.id)?.label ?? element.id"
              @update:model-value="toggleVisible(element.id, $event)"
            />
          </div>
        </template>
      </draggable>

      <DialogFooter>
        <Button
          variant="outline"
          size="sm"
          @click="toolbarStore.reset()"
        >
          <RotateCcw class="h-4 w-4" />
          恢复默认
        </Button>
        <Button
          size="sm"
          @click="emit('update:open', false)"
        >
          完成
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
