<script setup lang="ts">
import { ref, watch } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Workspace } from '@/types'

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
]

const props = defineProps<{
  open: boolean
  workspace?: Workspace | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [data: { title: string; color: string }]
}>()

const title = ref('')
const color = ref('#3b82f6')

watch(() => props.open, (val) => {
  if (val) {
    title.value = props.workspace?.title ?? ''
    color.value = props.workspace?.color ?? '#3b82f6'
  }
})

function handleSave() {
  const trimmed = title.value.trim()
  if (!trimmed) return
  emit('save', { title: trimmed, color: color.value })
  emit('update:open', false)
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ workspace ? '编辑工作区' : '新建工作区' }}</DialogTitle>
      </DialogHeader>
      <div class="py-2 flex flex-col gap-3">
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">工作区名称</label>
          <Input
            v-model="title"
            placeholder="请输入工作区名称"
            autofocus
            @keydown.enter="handleSave"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">颜色</label>
          <div class="flex items-center gap-1.5 flex-wrap">
            <button
              v-for="c in PRESET_COLORS"
              :key="c"
              class="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
              :class="color === c ? 'border-foreground scale-110' : 'border-transparent'"
              :style="{ backgroundColor: c }"
              @click="color = c"
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          variant="ghost"
          @click="emit('update:open', false)"
        >
          取消
        </Button>
        <Button
          :disabled="!title.trim()"
          @click="handleSave"
        >
          保存
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
