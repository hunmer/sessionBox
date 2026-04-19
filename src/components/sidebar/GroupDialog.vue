<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Camera, SmilePlus } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
import IconPickerDialog from './IconPickerDialog.vue'
import { useProxyStore } from '@/stores/proxy'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Group } from '@/types'

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
]

const props = defineProps<{
  open: boolean
  group?: Group | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [data: { name: string; icon?: string; proxyId?: string; color?: string; workspaceId?: string }]
}>()

const proxyStore = useProxyStore()
const workspaceStore = useWorkspaceStore()
const name = ref('')
const icon = ref('📁')
const NO_PROXY = '__none__'
const proxyId = ref(NO_PROXY)
const color = ref('')
const workspaceId = ref('')

const proxyOptions = computed(() => proxyStore.proxies)
const workspaceOptions = computed(() => workspaceStore.sortedWorkspaces)

/** 当前图标是否为自定义图片 */
const isImageIcon = computed(() => icon.value.startsWith('img:'))

/** 图标选择器打开状态 */
const iconPickerOpen = ref(false)

watch(() => props.open, (val) => {
  if (val) {
    name.value = props.group?.name ?? ''
    icon.value = props.group?.icon ?? '📁'
    proxyId.value = props.group?.proxyId || NO_PROXY
    color.value = props.group?.color ?? ''
    workspaceId.value = props.group?.workspaceId || workspaceStore.activeWorkspaceId
  }
})

/** 上传自定义图标 */
async function handleUploadIcon() {
  const result = await window.api.container.uploadIcon()
  if (result) icon.value = result
}

/** 清除自定义图标，恢复为 emoji */
function clearImageIcon() {
  icon.value = '📁'
}

function handleSave() {
  const trimmed = name.value.trim()
  if (!trimmed) return
  emit('save', {
    name: trimmed,
    icon: icon.value,
    proxyId: proxyId.value === NO_PROXY ? undefined : proxyId.value,
    color: color.value || undefined,
    workspaceId: workspaceId.value || undefined
  })
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
        <DialogTitle>{{ group ? '编辑分组' : '新建分组' }}</DialogTitle>
      </DialogHeader>
      <div class="py-2 flex flex-col gap-3">
        <!-- 图标 -->
        <div class="flex flex-col items-center gap-3">
          <div class="relative group/icon">
            <div class="w-16 h-16 rounded-full overflow-hidden border-2 border-border flex items-center justify-center bg-muted">
              <img
                v-if="isImageIcon"
                :src="`account-icon://${icon.slice(4)}`"
                alt="图标"
                class="w-full h-full object-cover"
              >
              <EmojiRenderer
                v-else
                :emoji="icon"
                class="text-3xl [&_img]:w-8 [&_img]:h-8 [&_*:not(img)]:text-3xl"
              />
            </div>
            <button
              v-if="isImageIcon"
              class="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover/icon:opacity-100 transition-opacity text-white text-sm"
              @click="clearImageIcon"
            >
              ✕
            </button>
            <button
              class="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-accent transition-colors"
              title="选择图标"
              @click="iconPickerOpen = true"
            >
              <SmilePlus class="w-3 h-3" />
            </button>
            <button
              class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground shadow-sm flex items-center justify-center hover:bg-primary/90 transition-colors"
              title="上传图片"
              @click="handleUploadIcon"
            >
              <Camera class="w-3 h-3" />
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">分组名称</label>
          <Input
            v-model="name"
            placeholder="请输入分组名称"
            autofocus
            @keydown.enter="handleSave"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">所属工作区</label>
          <Select v-model="workspaceId">
            <SelectTrigger>
              <SelectValue placeholder="选择工作区" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="ws in workspaceOptions"
                :key="ws.id"
                :value="ws.id"
              >
                {{ ws.title }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">绑定代理</label>
          <Select v-model="proxyId">
            <SelectTrigger>
              <SelectValue placeholder="不绑定代理" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="NO_PROXY">
                不绑定代理
              </SelectItem>
              <SelectItem
                v-for="p in proxyOptions"
                :key="p.id"
                :value="p.id"
              >
                {{ p.name }} ({{ p.type }}://{{ p.host }}:{{ p.port }})
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <!-- 颜色选择 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">颜色</label>
          <div class="flex items-center gap-1.5 flex-wrap">
            <button
              v-for="c in PRESET_COLORS"
              :key="c"
              class="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
              :class="color === c ? 'border-foreground scale-110' : 'border-transparent'"
              :style="{ backgroundColor: c }"
              @click="color = color === c ? '' : c"
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
          :disabled="!name.trim()"
          @click="handleSave"
        >
          保存
        </Button>
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
</template>
