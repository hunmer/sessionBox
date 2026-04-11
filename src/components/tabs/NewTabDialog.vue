<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Search } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAccountStore } from '@/stores/account'
import { getFaviconUrl } from '@/lib/utils'
import type { Account } from '@/types'

/** 通过输入框提交的 URL 记录 */
interface UrlRecord {
  url: string
  time: number
}

const STORAGE_KEY = 'sessionbox-url-input-history'
const MAX_RECORDS = 50

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [account: Account]
  navigate: [url: string]
}>()

const accountStore = useAccountStore()
const urlInput = ref('')
const urlRecords = ref<UrlRecord[]>([])

// 从 localStorage 加载输入框提交记录
function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    urlRecords.value = raw ? JSON.parse(raw) : []
  } catch {
    urlRecords.value = []
  }
}

// 保存一条提交记录
function saveRecord(url: string) {
  const list = urlRecords.value.filter((r) => r.url !== url)
  list.unshift({ url, time: Date.now() })
  if (list.length > MAX_RECORDS) list.length = MAX_RECORDS
  urlRecords.value = list
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

// 获取当前工作区的账号列表
const accounts = computed(() => {
  const groups = accountStore.workspaceGroups
  const groupIds = new Set(groups.map((g) => g.id))
  return accountStore.accounts
    .filter((a) => groupIds.has(a.groupId))
    .slice()
    .sort((a, b) => a.order - b.order)
})

// 根据 URL 输入过滤历史记录
const filteredHistory = computed(() => {
  if (!urlInput.value.trim()) return urlRecords.value.slice(0, 20)
  const q = urlInput.value.toLowerCase()
  return urlRecords.value.filter((r) => r.url.toLowerCase().includes(q)).slice(0, 20)
})

// 弹窗打开时加载记录
watch(() => props.open, (open) => {
  if (open) {
    urlInput.value = ''
    loadRecords()
  }
})

// 从 URL 提取简短显示名
function getUrlLabel(url: string) {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// 图标是否为自定义图片
function isImageIcon(icon: string | undefined) {
  return icon?.startsWith('img:')
}

// URL 输入框回车：记录并导航
function handleUrlSubmit() {
  let url = urlInput.value.trim()
  if (!url) return
  // 自动补全协议
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  saveRecord(url)
  emit('navigate', url)
  emit('update:open', false)
}

// 点击账号
function handleSelectAccount(account: Account) {
  emit('select', account)
  emit('update:open', false)
}

// 点击历史记录
function handleSelectHistory(record: UrlRecord) {
  saveRecord(record.url)
  emit('navigate', record.url)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="w-[80vw] sm:max-w-[640px] p-4 gap-3" show-close-button>
      <DialogHeader>
        <DialogTitle>新建标签页</DialogTitle>
      </DialogHeader>

      <!-- URL 输入框 -->
      <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          v-model="urlInput"
          type="text"
          placeholder="输入网址访问..."
          class="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-transparent text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          @keydown.enter="handleUrlSubmit"
        />
      </div>

      <!-- 账号列表 -->
      <div v-if="accounts.length > 0">
        <div class="text-xs text-muted-foreground mb-1.5 px-1">账号</div>
        <div class="flex gap-2 overflow-x-auto pb-1">
          <button
            v-for="account in accounts"
            :key="account.id"
            class="flex-shrink-0 flex flex-col items-center gap-1 w-16 p-1.5 rounded-lg hover:bg-accent transition-colors"
            :title="account.name"
            @click="handleSelectAccount(account)"
          >
            <span class="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden text-lg">
              <img
                v-if="isImageIcon(account.icon)"
                :src="`account-icon://${account.icon!.slice(4)}`"
                alt=""
                class="w-full h-full object-cover"
              />
              <span v-else class="leading-none">{{ account.icon }}</span>
            </span>
            <span class="text-[11px] text-center leading-tight truncate w-full">{{ account.name }}</span>
          </button>
        </div>
      </div>

      <!-- 历史记录 -->
      <div v-if="filteredHistory.length > 0">
        <div class="text-xs text-muted-foreground mb-1.5 px-1">历史记录</div>
        <div class="flex gap-2 overflow-x-auto pb-1">
          <button
            v-for="record in filteredHistory"
            :key="record.url"
            class="flex-shrink-0 flex flex-col items-center gap-1 w-16 p-1.5 rounded-lg hover:bg-accent transition-colors"
            :title="record.url"
            @click="handleSelectHistory(record)"
          >
            <span class="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              <img
                :src="getFaviconUrl(record.url)"
                alt=""
                class="w-5 h-5 rounded-sm object-cover"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
              />
            </span>
            <span class="text-[11px] text-center leading-tight truncate w-full">{{ getUrlLabel(record.url) }}</span>
          </button>
        </div>
      </div>

      <!-- 无结果提示 -->
      <div
        v-if="accounts.length === 0 && filteredHistory.length === 0 && !urlInput.trim()"
        class="py-4 text-center text-sm text-muted-foreground"
      >
        暂无内容
      </div>
    </DialogContent>
  </Dialog>
</template>
