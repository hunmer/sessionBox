<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Globe, Search } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAccountStore } from '@/stores/account'
import { useTabStore } from '@/stores/tab'
import { useHistoryStore } from '@/stores/history'
import type { Account } from '@/types'
import type { HistoryEntry } from '@/lib/db'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [account: Account]
  navigate: [url: string]
}>()

const accountStore = useAccountStore()
const tabStore = useTabStore()
const historyStore = useHistoryStore()

const urlInput = ref('')
const recentHistory = ref<HistoryEntry[]>([])

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
  if (!urlInput.value.trim()) return recentHistory.value.slice(0, 20)
  const q = urlInput.value.toLowerCase()
  return recentHistory.value.filter(
    (h) => h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q)
  ).slice(0, 20)
})

// 弹窗打开时加载最近历史记录
watch(() => props.open, async (open) => {
  if (open) {
    urlInput.value = ''
    recentHistory.value = await historyStore.getRecentHistory(100)
  }
})

// 获取域名首字母
function getDomainLetter(url: string) {
  try {
    const hostname = new URL(url).hostname
    return hostname.replace(/^www\./, '').charAt(0).toUpperCase()
  } catch {
    return '?'
  }
}

// 图标是否为自定义图片
function isImageIcon(icon: string | undefined) {
  return icon?.startsWith('img:')
}

// URL 输入框回车处理
function handleUrlSubmit() {
  const url = urlInput.value.trim()
  if (!url) return
  emit('navigate', url)
  emit('update:open', false)
}

// 点击账号
function handleSelectAccount(account: Account) {
  emit('select', account)
  emit('update:open', false)
}

// 点击历史记录
function handleSelectHistory(entry: HistoryEntry) {
  emit('navigate', entry.url)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[480px] p-4 gap-3" show-close-button>
      <DialogHeader class="sr-only">
        <DialogTitle>新建标签页</DialogTitle>
      </DialogHeader>

      <!-- URL 输入框 -->
      <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          v-model="urlInput"
          type="text"
          placeholder="输入网址搜索或访问..."
          class="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-transparent text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          @keydown.enter="handleUrlSubmit"
        />
      </div>

      <!-- 账号列表 -->
      <div v-if="accounts.length > 0">
        <div class="text-xs text-muted-foreground mb-1.5 px-1">账号</div>
        <div class="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
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
        <div class="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            v-for="entry in filteredHistory"
            :key="entry.id"
            class="flex-shrink-0 flex flex-col items-center gap-1 w-16 p-1.5 rounded-lg hover:bg-accent transition-colors"
            :title="entry.title || entry.url"
            @click="handleSelectHistory(entry)"
          >
            <span class="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              <Globe class="w-4 h-4 text-muted-foreground" />
            </span>
            <span class="text-[11px] text-center leading-tight truncate w-full">{{ entry.title || getDomainLetter(entry.url) }}</span>
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
