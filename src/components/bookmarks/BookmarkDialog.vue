<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBookmarkStore } from '@/stores/bookmark'
import { useAccountStore } from '@/stores/account'

const props = defineProps<{
  open: boolean
  bookmarkId: string | null
  folderId: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const bookmarkStore = useBookmarkStore()
const accountStore = useAccountStore()

const title = ref('')
const url = ref('')
const selectedFolderId = ref('')
const selectedAccountId = ref<string>('')

const isEdit = computed(() => !!props.bookmarkId)
const dialogTitle = computed(() => isEdit.value ? '编辑书签' : '添加书签')

watch(() => props.open, (open) => {
  if (open) {
    selectedFolderId.value = props.folderId || '__bookmark_bar__'
    if (props.bookmarkId) {
      const bookmark = bookmarkStore.bookmarks.find((b) => b.id === props.bookmarkId)
      if (bookmark) {
        title.value = bookmark.title
        url.value = bookmark.url
        selectedFolderId.value = bookmark.folderId
        selectedAccountId.value = bookmark.accountId || '__none__'
      }
    } else {
      title.value = ''
      url.value = ''
      selectedAccountId.value = '__none__'
    }
  }
})

function isValid(): boolean {
  return url.value.trim().length > 0
}

async function handleSubmit() {
  if (!isValid()) return
  const finalUrl = url.value.match(/^https?:\/\//) ? url.value.trim() : `https://${url.value.trim()}`
  const data = {
    title: title.value.trim() || finalUrl,
    url: finalUrl,
    accountId: selectedAccountId.value === '__none__' ? undefined : selectedAccountId.value,
    folderId: selectedFolderId.value,
    order: 0
  }

  if (isEdit.value && props.bookmarkId) {
    await bookmarkStore.updateBookmark(props.bookmarkId, data)
  } else {
    // 设置 order 为文件夹内最后一个书签 + 1
    const siblings = bookmarkStore.getBookmarksByFolder(selectedFolderId.value)
    data.order = siblings.length
    await bookmarkStore.createBookmark(data)
  }
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
      </DialogHeader>
      <div class="space-y-3 py-2">
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">标题</label>
          <Input v-model="title" placeholder="网站标题（可选）" class="h-8 text-sm" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">网址</label>
          <Input v-model="url" placeholder="https://" class="h-8 text-sm" @keydown.enter="handleSubmit" />
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">文件夹</label>
          <Select v-model="selectedFolderId">
            <SelectTrigger class="h-8 text-sm">
              <SelectValue placeholder="选择文件夹" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="folder in bookmarkStore.folders"
                :key="folder.id"
                :value="folder.id"
              >
                {{ folder.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label class="text-xs text-muted-foreground mb-1 block">绑定账号（可选）</label>
          <Select v-model="selectedAccountId">
            <SelectTrigger class="h-8 text-sm">
              <SelectValue placeholder="不绑定" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">不绑定</SelectItem>
              <SelectItem
                v-for="account in accountStore.accounts"
                :key="account.id"
                :value="account.id"
              >
                {{ account.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" size="sm" @click="emit('update:open', false)">取消</Button>
        <Button size="sm" :disabled="!isValid()" @click="handleSubmit">确定</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
