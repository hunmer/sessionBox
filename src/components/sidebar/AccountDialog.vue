<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { useAccountStore } from '@/stores/account'
import { useProxyStore } from '@/stores/proxy'
import { useFavoriteSiteStore } from '@/stores/favoriteSite'
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
const favoriteSiteStore = useFavoriteSiteStore()

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
    <DialogContent class="w-[80%] max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{ account ? '编辑账号' : '新建账号' }}</DialogTitle>
      </DialogHeader>
      <div class="flex flex-col gap-3 py-2">
        <div class="flex gap-2 items-center">
          <!-- 图标预览 + 选择区域 -->
          <div class="flex items-center gap-1 shrink-0">
            <div
              v-if="isImageIcon"
              class="relative w-10 h-10 rounded-md overflow-hidden border border-border group/icon"
            >
              <img :src="iconImagePath" alt="图标" class="w-full h-full object-cover" />
              <button
                class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/icon:opacity-100 transition-opacity text-white text-xs"
                @click="clearImageIcon"
              >
                ✕
              </button>
            </div>
            <Input v-else v-model="icon" class="w-16 text-center" placeholder="图标" />
            <Button variant="outline" size="sm" @click="handleUploadIcon">
              {{ isImageIcon ? '更换' : '上传' }}
            </Button>
          </div>
          <Input v-model="name" class="flex-1" placeholder="账号名称" autofocus @keydown.enter="handleSave" />
        </div>
        <div class="flex gap-2">
          <Select @update:model-value="(url) => { if (url) defaultUrl = String(url) }">
            <SelectTrigger class="w-40 shrink-0">
              <SelectValue placeholder="常用网址" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="site in favoriteSiteStore.sites"
                :key="site.id"
                :value="site.url"
              >
                {{ site.title }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Input v-model="defaultUrl" placeholder="启动 URL（默认 about:blank）" class="flex-1" />
        </div>
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
      <DialogFooter>
        <Button variant="ghost" @click="emit('update:open', false)">取消</Button>
        <Button :disabled="!name.trim()" @click="handleSave">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
