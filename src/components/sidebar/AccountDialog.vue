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
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ account ? '编辑账号' : '新建账号' }}</DialogTitle>
      </DialogHeader>
      <div class="flex flex-col gap-3 py-2">
        <div class="flex gap-2">
          <Input v-model="icon" class="w-16 text-center" placeholder="图标" />
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
