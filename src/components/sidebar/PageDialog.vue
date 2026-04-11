<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Camera, SmilePlus, Settings } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
import IconPickerDialog from './IconPickerDialog.vue'
import ContainerDialog from './ContainerDialog.vue'
import { useContainerStore } from '@/stores/container'
import { usePageStore } from '@/stores/page'
import { useProxyStore } from '@/stores/proxy'
import { useBookmarkStore } from '@/stores/bookmark'
import type { Page } from '@/types'

const props = defineProps<{
  open: boolean
  page?: Page | null
  groupId?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [data: Omit<Page, 'id'>]
  delete: [id: string]
}>()

const pageStore = usePageStore()
const containerStore = useContainerStore()
const proxyStore = useProxyStore()
const bookmarkStore = useBookmarkStore()

const name = ref('')
const icon = ref('📄')
const url = ref('about:blank')
const containerId = ref('')
const NO_PROXY = '__none__'
const proxyId = ref(NO_PROXY)
const userAgent = ref('')

/** 当前图标是否为自定义图片 */
const isImageIcon = computed(() => icon.value.startsWith('img:'))

/** 图标选择器打开状态 */
const iconPickerOpen = ref(false)

/** 容器管理对话框打开状态 */
const containerDialogOpen = ref(false)

/** 代理下拉选项 */
const proxyOptions = computed(() => proxyStore.proxies)

/** 容器下拉选项 */
const containers = computed(() => containerStore.containers)

watch(() => props.open, (val) => {
  if (val) {
    name.value = props.page?.name ?? ''
    icon.value = props.page?.icon ?? '📄'
    url.value = props.page?.url ?? 'about:blank'
    containerId.value = props.page?.containerId ?? ''
    proxyId.value = props.page?.proxyId || NO_PROXY
    userAgent.value = props.page?.userAgent ?? ''
  }
})

/** 上传自定义图标 */
async function handleUploadIcon() {
  const result = await window.api.container.uploadIcon()
  if (result) icon.value = result
}

/** 清除自定义图标，恢复为 emoji */
function clearImageIcon() {
  icon.value = '📄'
}

function handleSave() {
  const trimmed = name.value.trim()
  if (!trimmed) return
  emit('save', {
    groupId: props.page?.groupId ?? props.groupId ?? '',
    containerId: containerId.value || undefined,
    name: trimmed,
    icon: icon.value,
    url: url.value.trim() || 'about:blank',
    order: props.page?.order ?? pageStore.pages.length,
    proxyId: proxyId.value === NO_PROXY ? undefined : proxyId.value,
    userAgent: userAgent.value.trim() || undefined,
  })
  emit('update:open', false)
}

function handleDelete() {
  if (props.page?.id) {
    emit('delete', props.page.id)
    emit('update:open', false)
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[420px]">
      <DialogHeader>
        <DialogTitle>{{ page ? '编辑页面' : '新建页面' }}</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-5 py-2">
        <!-- 图标 -->
        <div class="flex flex-col items-center gap-3">
          <div class="relative group/icon">
            <!-- 圆形图标 -->
            <div class="w-20 h-20 rounded-full overflow-hidden border-2 border-border flex items-center justify-center bg-muted">
              <img v-if="isImageIcon" :src="`account-icon://${icon.slice(4)}`" alt="图标" class="w-full h-full object-cover" />
              <EmojiRenderer v-else :emoji="icon" class="text-4xl [&_img]:w-10 [&_img]:h-10 [&_*:not(img)]:text-4xl" />
            </div>
            <!-- 图片 hover 清除按钮 -->
            <button
              v-if="isImageIcon"
              class="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover/icon:opacity-100 transition-opacity text-white text-sm"
              @click="clearImageIcon"
            >
              ✕
            </button>
            <!-- 左下：选择 lucide 图标 -->
            <button
              class="absolute -bottom-1 -left-1 w-7 h-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-accent transition-colors"
              title="选择图标"
              @click="iconPickerOpen = true"
            >
              <SmilePlus class="w-3.5 h-3.5" />
            </button>
            <!-- 右下：上传图片 -->
            <button
              class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground shadow-sm flex items-center justify-center hover:bg-primary/90 transition-colors"
              title="上传图片"
              @click="handleUploadIcon"
            >
              <Camera class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- 名称 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">名称</label>
          <Input v-model="name" placeholder="输入页面名称" autofocus @keydown.enter="handleSave" />
        </div>

        <!-- URL -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">URL</label>
          <div class="flex gap-2">
            <Select @update:model-value="(val) => { if (val) url = String(val) }">
              <SelectTrigger class="w-36 shrink-0">
                <SelectValue placeholder="常用网址" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="site in bookmarkStore.bookmarks"
                  :key="site.id"
                  :value="site.url"
                >
                  {{ site.title }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Input v-model="url" placeholder="默认 about:blank" class="flex-1" />
          </div>
        </div>

        <!-- 容器 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">容器</label>
          <div class="flex gap-2">
            <Select v-model="containerId">
              <SelectTrigger class="flex-1">
                <SelectValue placeholder="默认容器" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">默认容器</SelectItem>
                <SelectItem v-for="c in containers" :key="c.id" :value="c.id">
                  {{ c.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" @click="containerDialogOpen = true" title="管理容器">
              <Settings class="w-4 h-4" />
            </Button>
          </div>
        </div>

        <!-- 代理 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">代理</label>
          <Select v-model="proxyId">
            <SelectTrigger>
              <SelectValue placeholder="不绑定代理" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="NO_PROXY">不绑定代理</SelectItem>
              <SelectItem v-for="p in proxyOptions" :key="p.id" :value="p.id">
                {{ p.name }} ({{ p.type }}://{{ p.host }}:{{ p.port }})
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- UA -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">User-Agent</label>
          <Input v-model="userAgent" placeholder="留空使用默认 UA" />
        </div>
      </div>

      <DialogFooter class="gap-2">
        <Button v-if="page" variant="destructive" @click="handleDelete">删除</Button>
        <div class="flex-1" />
        <Button variant="secondary" @click="emit('update:open', false)">取消</Button>
        <Button :disabled="!name.trim()" @click="handleSave">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- 图标选择器 -->
  <IconPickerDialog
    :open="iconPickerOpen"
    :current-icon="icon"
    @update:open="iconPickerOpen = $event"
    @confirm="icon = $event"
  />

  <!-- 容器管理对话框 -->
  <ContainerDialog
    :open="containerDialogOpen"
    @update:open="containerDialogOpen = $event"
    @save="() => {}"
  />
</template>
