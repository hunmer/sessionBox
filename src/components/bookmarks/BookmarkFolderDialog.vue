<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBookmarkStore } from '@/stores/bookmark'

const props = defineProps<{
  open: boolean
  folderId: string | null
  parentId: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const bookmarkStore = useBookmarkStore()
const name = ref('')

const isEdit = computed(() => !!props.folderId)
const dialogTitle = computed(() => isEdit.value ? '编辑文件夹' : '新建文件夹')

watch(() => props.open, (open) => {
  if (open) {
    if (props.folderId) {
      const folder = bookmarkStore.folders.find((f) => f.id === props.folderId)
      name.value = folder?.name ?? ''
    } else {
      name.value = ''
    }
  }
})

function isValid(): boolean {
  return name.value.trim().length > 0
}

async function handleSubmit() {
  if (!isValid()) return
  if (isEdit.value && props.folderId) {
    await bookmarkStore.updateFolder(props.folderId, { name: name.value.trim() })
  } else {
    const parentFolderId = props.parentId || null
    const siblings = parentFolderId
      ? bookmarkStore.getChildFolders(parentFolderId)
      : bookmarkStore.rootFolders
    await bookmarkStore.createFolder({
      name: name.value.trim(),
      parentId: parentFolderId,
      order: siblings.length
    })
  }
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[360px]">
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
      </DialogHeader>
      <div class="py-2">
        <Input v-model="name" placeholder="文件夹名称" class="h-8 text-sm" @keydown.enter="handleSubmit" />
      </div>
      <DialogFooter>
        <Button variant="ghost" size="sm" @click="emit('update:open', false)">取消</Button>
        <Button size="sm" :disabled="!isValid()" @click="handleSubmit">确定</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
