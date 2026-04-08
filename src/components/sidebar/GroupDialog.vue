<script setup lang="ts">
import { ref, watch } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Group } from '@/types'

const props = defineProps<{
  open: boolean
  group?: Group | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [data: { name: string }]
}>()

const name = ref('')

watch(() => props.open, (val) => {
  if (val) {
    name.value = props.group?.name ?? ''
  }
})

function handleSave() {
  const trimmed = name.value.trim()
  if (!trimmed) return
  emit('save', { name: trimmed })
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ group ? '编辑分组' : '新建分组' }}</DialogTitle>
      </DialogHeader>
      <div class="py-2">
        <Input v-model="name" placeholder="分组名称" autofocus @keydown.enter="handleSave" />
      </div>
      <DialogFooter>
        <Button variant="ghost" @click="emit('update:open', false)">取消</Button>
        <Button :disabled="!name.trim()" @click="handleSave">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
