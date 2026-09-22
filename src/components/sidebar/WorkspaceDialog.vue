<script setup lang="ts">
import { ref, watch } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import IconSelector from '@/components/common/IconSelector.vue'
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
  save: [data: { title: string; color: string; icon: string }]
  delete: []
}>()

const title = ref('')
const color = ref('#3b82f6')
const icon = ref('')
const confirmDeleteOpen = ref(false)

watch(() => props.open, (val) => {
  if (val) {
    title.value = props.workspace?.title ?? ''
    color.value = props.workspace?.color ?? '#3b82f6'
    icon.value = props.workspace?.icon ?? ''
    confirmDeleteOpen.value = false
  }
})

function handleSave() {
  const trimmed = title.value.trim()
  if (!trimmed) return
  emit('save', { title: trimmed, color: color.value, icon: icon.value })
  emit('update:open', false)
}

function handleDelete() {
  confirmDeleteOpen.value = true
}

function handleConfirmDelete() {
  emit('delete')
  confirmDeleteOpen.value = false
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
        <div class="flex justify-center">
          <IconSelector
            v-model="icon"
            :size="64"
            emoji-class="text-2xl"
          />
        </div>
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
          v-if="workspace && !workspace.isDefault"
          variant="ghost"
          size="icon"
          class="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
          title="删除工作区"
          @click="handleDelete"
        >
          <Trash2 class="size-4" />
        </Button>
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

      <!-- 删除工作区二次确认 -->
      <AlertDialog
        :open="confirmDeleteOpen"
        @update:open="confirmDeleteOpen = $event"
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除工作区“{{ workspace?.title }}”？该操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              @click="handleConfirmDelete"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContent>
  </Dialog>
</template>
