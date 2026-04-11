<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useContainerStore } from '@/stores/container'
import { useBookmarkStore } from '@/stores/bookmark'

const props = defineProps<{
  open: boolean
  /** 编辑模式：传入已有的站点数据 */
  editSite?: { id: string; title: string; url: string; containerId?: string } | null
  /** 新增模式下的默认关联容器 ID */
  defaultContainerId?: string
  /** 新增模式下的默认 URL */
  defaultUrl?: string
  /** 新增模式下的默认标题 */
  defaultTitle?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const containerStore = useContainerStore()
const bookmarkStore = useBookmarkStore()

const title = ref('')
const url = ref('')
const containerId = ref<string>('__none__')
const folderId = ref<string>('__bookmark_bar__')

const isEdit = computed(() => !!props.editSite)
const dialogTitle = computed(() => isEdit.value ? '编辑快捷网站' : '添加快捷网站')

/** 所有容器列表（按分组归类，扁平化） */
const allContainers = computed(() =>
  [...containerStore.containers].sort((a, b) => a.order - b.order)
)

/** 监听对话框打开，初始化表单数据 */
watch(() => props.open, (open) => {
  if (!open) return
  if (props.editSite) {
    title.value = props.editSite.title
    url.value = props.editSite.url
    containerId.value = props.editSite.containerId || '__none__'
    const bookmark = bookmarkStore.bookmarks.find((b) => b.id === props.editSite?.id)
    folderId.value = bookmark?.folderId || '__bookmark_bar__'
  } else {
    title.value = props.defaultTitle || ''
    url.value = props.defaultUrl || ''
    containerId.value = props.defaultContainerId || '__none__'
    folderId.value = '__bookmark_bar__'
  }
})

/** Dialog 组件请求关闭时转发事件 */
function onOpenChange(open: boolean) {
  emit('update:open', open)
}

async function handleSubmit() {
  const finalUrl = url.value.trim()
  if (!finalUrl) return

  const normalizedUrl = finalUrl.match(/^https?:\/\//) ? finalUrl : `https://${finalUrl}`
  const finalContainerId = containerId.value === '__none__' ? undefined : containerId.value
  const finalTitle = title.value.trim() || normalizedUrl

  if (isEdit.value && props.editSite) {
    await bookmarkStore.updateBookmark(props.editSite.id, {
      title: finalTitle,
      url: normalizedUrl,
      containerId: finalContainerId,
      folderId: folderId.value
    })
  } else {
    const siblings = bookmarkStore.getBookmarksByFolder(folderId.value)
    await bookmarkStore.createBookmark({
      title: finalTitle,
      url: normalizedUrl,
      containerId: finalContainerId,
      folderId: folderId.value,
      order: siblings.length
    })
  }

  emit('update:open', false)
}

function isValid() {
  return url.value.trim().length > 0
}
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent class="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-3 py-2">
        <!-- 标题 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs text-muted-foreground">标题（可选）</label>
          <Input v-model="title" placeholder="网站名称" class="h-8 text-sm" />
        </div>

        <!-- 网址 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs text-muted-foreground">网址</label>
          <Input v-model="url" placeholder="https://example.com" class="h-8 text-sm" />
        </div>

        <!-- 文件夹选择 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs text-muted-foreground">文件夹</label>
          <Select v-model="folderId">
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

        <!-- 选择容器 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs text-muted-foreground">关联容器（可选，用于独立会话）</label>
          <Select v-model="containerId">
            <SelectTrigger class="h-8 text-sm">
              <SelectValue placeholder="不关联容器（默认会话）" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">不关联容器（默认会话）</SelectItem>
              <SelectItem
                v-for="container in allContainers"
                :key="container.id"
                :value="container.id"
              >
                {{ container.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" @click="emit('update:open', false)">取消</Button>
        <Button size="sm" :disabled="!isValid()" @click="handleSubmit">
          {{ isEdit ? '保存' : '添加' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
