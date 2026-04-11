<script setup lang="ts">
import { ref, computed } from 'vue'
import { Camera, SmilePlus, Plus, Pencil, Trash2 } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
import IconPickerDialog from './IconPickerDialog.vue'
import { useContainerStore } from '@/stores/container'
import { useProxyStore } from '@/stores/proxy'
import type { Container } from '@/types'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const containerStore = useContainerStore()
const proxyStore = useProxyStore()

const NO_PROXY = '__none__'

// 编辑状态
const editingContainer = ref<Container | null>(null)
const isCreating = ref(false)
const editName = ref('')
const editIcon = ref('📦')
const editProxyId = ref(NO_PROXY)
const iconPickerOpen = ref(false)

// 删除确认
const deleteTarget = ref<Container | null>(null)
const deleteAlertOpen = ref(false)

// 计算属性
const containers = computed(() => containerStore.containers)
const proxyOptions = computed(() => proxyStore.proxies)

const isDefault = (id: string) => id === 'default'

/** 当前图标是否为自定义图片 */
const isImageIcon = computed(() => editIcon.value.startsWith('img:'))

/** 开始编辑容器 */
function startEdit(container: Container) {
  editingContainer.value = container
  isCreating.value = false
  editName.value = container.name
  editIcon.value = container.icon
  editProxyId.value = container.proxyId || NO_PROXY
}

/** 开始新建容器 */
function startCreate() {
  editingContainer.value = null
  isCreating.value = true
  editName.value = ''
  editIcon.value = '📦'
  editProxyId.value = NO_PROXY
}

/** 取消编辑 */
function cancelEdit() {
  editingContainer.value = null
  isCreating.value = false
}

/** 保存编辑/新建 */
async function saveEdit() {
  const trimmed = editName.value.trim()
  if (!trimmed) return

  const data = {
    name: trimmed,
    icon: editIcon.value,
    proxyId: editProxyId.value === NO_PROXY ? undefined : editProxyId.value,
  }

  if (isCreating.value) {
    await containerStore.createContainer({
      ...data,
      order: containerStore.containers.length,
    })
  } else if (editingContainer.value) {
    await containerStore.updateContainer(editingContainer.value.id, data)
  }
  cancelEdit()
}

/** 请求删除容器（弹出确认） */
function requestDelete(container: Container) {
  if (isDefault(container.id)) return
  deleteTarget.value = container
  deleteAlertOpen.value = true
}

/** 确认删除 */
async function confirmDelete() {
  if (!deleteTarget.value) return
  await containerStore.deleteContainer(deleteTarget.value.id)
  if (editingContainer.value?.id === deleteTarget.value.id) cancelEdit()
  deleteTarget.value = null
}

/** 上传自定义图标 */
async function handleUploadIcon() {
  const result = await window.api.container.uploadIcon()
  if (result) editIcon.value = result
}

/** 清除自定义图标 */
function clearImageIcon() {
  editIcon.value = '📦'
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>容器管理</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-4 py-2">
        <!-- 新建按钮 -->
        <Button variant="outline" class="w-full justify-start gap-2" @click="startCreate">
          <Plus class="w-4 h-4" />
          新建容器
        </Button>

        <!-- 容器列表 -->
        <ScrollArea class="max-h-[280px]">
          <div class="flex flex-col gap-1 pr-3">
            <div
              v-for="container in containers"
              :key="container.id"
              class="flex items-center gap-3 rounded-lg px-3 py-2.5 border border-transparent transition-colors hover:bg-accent"
              :class="editingContainer?.id === container.id && !isCreating ? 'border-primary bg-primary/5' : ''"
            >
              <!-- 图标 -->
              <EmojiRenderer :emoji="container.icon" class="text-lg [&_img]:w-5 [&_img]:h-5 [&_*:not(img)]:text-lg shrink-0" />

              <!-- 名称 -->
              <span class="flex-1 text-sm truncate">{{ container.name }}</span>

              <!-- 操作按钮 -->
              <div class="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" class="h-7 w-7" title="编辑" @click="startEdit(container)">
                  <Pencil class="w-3.5 h-3.5" />
                </Button>
                <Button
                  v-if="!isDefault(container.id)"
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-destructive hover:text-destructive"
                  title="删除"
                  @click="requestDelete(container)"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div v-if="containers.length === 0" class="flex items-center justify-center py-8 text-muted-foreground text-sm">
              暂无容器，点击上方按钮新建
            </div>
          </div>
        </ScrollArea>

        <!-- 编辑区域 -->
        <div
          v-if="editingContainer || isCreating"
          class="border border-border rounded-lg p-4 flex flex-col gap-4 bg-muted/30"
        >
          <div class="text-sm font-medium">{{ isCreating ? '新建容器' : '编辑容器' }}</div>

          <!-- 头像 -->
          <div class="flex items-center gap-4">
            <div class="relative group/icon shrink-0">
              <!-- 圆形头像 -->
              <div class="w-14 h-14 rounded-full overflow-hidden border-2 border-border flex items-center justify-center bg-muted">
                <img v-if="isImageIcon" :src="`account-icon://${editIcon.slice(4)}`" alt="头像" class="w-full h-full object-cover" />
                <EmojiRenderer v-else :emoji="editIcon" class="text-3xl [&_img]:w-8 [&_img]:h-8 [&_*:not(img)]:text-3xl" />
              </div>
              <!-- 图片 hover 清除按钮 -->
              <button
                v-if="isImageIcon"
                class="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover/icon:opacity-100 transition-opacity text-white text-xs"
                @click="clearImageIcon"
              >
                ✕
              </button>
              <!-- 左下：选择图标 -->
              <button
                class="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-accent transition-colors"
                title="选择图标"
                @click="iconPickerOpen = true"
              >
                <SmilePlus class="w-3 h-3" />
              </button>
              <!-- 右下：上传图片 -->
              <button
                class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground shadow-sm flex items-center justify-center hover:bg-primary/90 transition-colors"
                title="上传图片"
                @click="handleUploadIcon"
              >
                <Camera class="w-3 h-3" />
              </button>
            </div>

            <!-- 名称输入 -->
            <div class="flex-1 flex flex-col gap-1.5">
              <label class="text-xs font-medium text-muted-foreground">名称</label>
              <Input v-model="editName" placeholder="输入容器名称" autofocus @keydown.enter="saveEdit" />
            </div>
          </div>

          <!-- 代理 -->
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-muted-foreground">代理</label>
            <Select v-model="editProxyId">
              <SelectTrigger>
                <SelectValue placeholder="不绑定代理" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="NO_PROXY">不设置</SelectItem>
                <SelectItem v-for="p in proxyOptions" :key="p.id" :value="p.id">
                  {{ p.name }} ({{ p.type }}://{{ p.host }}:{{ p.port }})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- 操作按钮 -->
          <div class="flex justify-end gap-2">
            <Button variant="secondary" size="sm" @click="cancelEdit">取消</Button>
            <Button size="sm" :disabled="!editName.trim()" @click="saveEdit">保存</Button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>

  <!-- 图标选择器 -->
  <IconPickerDialog
    :open="iconPickerOpen"
    :current-icon="editIcon"
    @update:open="iconPickerOpen = $event"
    @confirm="editIcon = $event"
  />

  <!-- 删除确认 -->
  <AlertDialog :open="deleteAlertOpen" @update:open="deleteAlertOpen = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>确认删除</AlertDialogTitle>
        <AlertDialogDescription>
          删除容器「{{ deleteTarget?.name }}」将关闭所有关联页面的标签页，确定要删除吗？
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="deleteTarget = null">取消</AlertDialogCancel>
        <AlertDialogAction @click="confirmDelete">删除</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
