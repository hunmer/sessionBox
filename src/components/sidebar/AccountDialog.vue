<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Camera } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { useAccountStore } from '@/stores/account'
import { useProxyStore } from '@/stores/proxy'
import { useBookmarkStore } from '@/stores/bookmark'
import type { Account } from '@/types'

const props = defineProps<{
  open: boolean
  account?: Account | null
  groupId?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [data: Partial<Account> & { groupId: string; name: string; icon: string; defaultUrl: string; order: number }]
}>()

const accountStore = useAccountStore()
const proxyStore = useProxyStore()
const bookmarkStore = useBookmarkStore()

const name = ref('')
const icon = ref('👤')
const NO_PROXY = '__none__'
const proxyId = ref(NO_PROXY)
const defaultUrl = ref('about:blank')

/** 当前图标是否为自定义图片 */
const isImageIcon = computed(() => icon.value.startsWith('img:'))

/** 图片图标的本地路径（用于预览） */
const iconImagePath = computed(() => {
  if (!isImageIcon.value) return ''
  return `account-icon://${icon.value.slice(4)}`
})

watch(() => props.open, (val) => {
  if (val) {
    name.value = props.account?.name ?? ''
    icon.value = props.account?.icon ?? '👤'
    proxyId.value = props.account?.proxyId || NO_PROXY
    defaultUrl.value = props.account?.defaultUrl ?? 'about:blank'
  }
})

/** 代理下拉选项 */
const proxyOptions = computed(() => proxyStore.proxies)

/** 上传自定义图标 */
async function handleUploadIcon() {
  const result = await window.api.account.uploadIcon()
  if (result) icon.value = result
}

/** 清除自定义图标，恢复为 emoji */
function clearImageIcon() {
  icon.value = '👤'
}

function handleSave() {
  const trimmed = name.value.trim()
  if (!trimmed) return
  emit('save', {
    groupId: props.account?.groupId ?? props.groupId ?? '',
    name: trimmed,
    icon: icon.value,
    proxyId: proxyId.value === NO_PROXY ? undefined : proxyId.value,
    defaultUrl: defaultUrl.value.trim() || 'about:blank',
    order: props.account?.order ?? accountStore.accounts.length
  })
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[420px]">
      <DialogHeader>
        <DialogTitle>{{ account ? '编辑账号' : '新建账号' }}</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-5 py-2">
        <!-- 头像 -->
        <div class="flex flex-col items-center gap-3">
          <div class="relative group/icon">
            <!-- 圆形头像 -->
            <div class="w-20 h-20 rounded-full overflow-hidden border-2 border-border flex items-center justify-center bg-muted">
              <img v-if="isImageIcon" :src="iconImagePath" alt="头像" class="w-full h-full object-cover" />
              <span v-else class="text-3xl">{{ icon }}</span>
            </div>
            <!-- 图片 hover 清除按钮 -->
            <button
              v-if="isImageIcon"
              class="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover/icon:opacity-100 transition-opacity text-white text-sm"
              @click="clearImageIcon"
            >
              ✕
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
          <!-- 隐藏的 emoji 输入 -->
          <input
            ref="emojiInput"
            v-model="icon"
            type="text"
            class="w-16 h-7 text-center text-sm bg-transparent border-b border-border focus:border-primary outline-none transition-colors"
            placeholder="emoji"
            maxlength="2"
          />
        </div>

        <!-- 名称 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">名称</label>
          <Input v-model="name" placeholder="输入账号名称" autofocus @keydown.enter="handleSave" />
        </div>

        <!-- 启动 URL -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">启动 URL</label>
          <div class="flex gap-2">
            <Select @update:model-value="(url) => { if (url) defaultUrl = String(url) }">
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
            <Input v-model="defaultUrl" placeholder="默认 about:blank" class="flex-1" />
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
      </div>

      <DialogFooter class="gap-2">
        <Button variant="secondary" @click="emit('update:open', false)">取消</Button>
        <Button :disabled="!name.trim()" @click="handleSave">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
