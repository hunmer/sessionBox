<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Search } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useContainerStore } from '@/stores/container'
import { usePageStore } from '@/stores/page'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
import type { Page } from '@/types'

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
  select: [page: Page]
  navigate: [url: string]
}>()

const containerStore = useContainerStore()
const pageStore = usePageStore()
const urlInput = ref('')
const urlRecords = ref<UrlRecord[]>([])

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    urlRecords.value = raw ? JSON.parse(raw) : []
  } catch {
    urlRecords.value = []
  }
}

function saveRecord(url: string) {
  const list = urlRecords.value.filter((record) => record.url !== url)
  list.unshift({ url, time: Date.now() })
  if (list.length > MAX_RECORDS) list.length = MAX_RECORDS
  urlRecords.value = list
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

const pages = computed(() => {
  const groups = containerStore.workspaceGroups
  const groupIds = new Set(groups.map((group) => group.id))

  return pageStore.pages
    .filter((page) => groupIds.has(page.groupId))
    .slice()
    .sort((a, b) => a.order - b.order)
})

const filteredHistory = computed(() => {
  if (!urlInput.value.trim()) return urlRecords.value.slice(0, 20)

  const query = urlInput.value.toLowerCase()
  return urlRecords.value
    .filter((record) => record.url.toLowerCase().includes(query))
    .slice(0, 20)
})

watch(() => props.open, (open) => {
  if (open) {
    urlInput.value = ''
    loadRecords()
  }
})

function getUrlLabel(url: string) {
  try {
    const parsedUrl = new URL(url)
    return parsedUrl.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function handleUrlSubmit() {
  let url = urlInput.value.trim()
  if (!url) return

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`
  }

  saveRecord(url)
  emit('navigate', url)
  emit('update:open', false)
}

function handleSelectPage(page: Page) {
  emit('select', page)
  emit('update:open', false)
}

function handleSelectHistory(record: UrlRecord) {
  saveRecord(record.url)
  emit('navigate', record.url)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="flex max-h-[80vh] w-[80vw] flex-col gap-3 p-4 sm:max-w-[640px]" show-close-button>
      <DialogHeader>
        <DialogTitle>新建标签页</DialogTitle>
      </DialogHeader>

      <div class="relative flex-shrink-0">
        <Search class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="urlInput"
          type="text"
          placeholder="输入网址访问..."
          class="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          @keydown.enter.prevent="handleUrlSubmit"
        />
      </div>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto">
        <div v-if="pages.length > 0">
          <div class="mb-1.5 px-1 text-xs text-muted-foreground">页面</div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="page in pages"
              :key="page.id"
              class="flex w-16 flex-shrink-0 flex-col items-center gap-1 rounded-lg p-1.5 transition-colors hover:bg-accent"
              :title="page.name"
              @click="handleSelectPage(page)"
            >
              <span class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-muted text-lg">
                <EmojiRenderer :emoji="page.icon" :url="page.url" />
              </span>
              <span class="w-full truncate text-center text-[11px] leading-tight">{{ page.name }}</span>
            </button>
          </div>
        </div>

        <div v-if="filteredHistory.length > 0">
          <div class="mb-1.5 px-1 text-xs text-muted-foreground">历史记录</div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="record in filteredHistory"
              :key="record.url"
              class="flex w-16 flex-shrink-0 flex-col items-center gap-1 rounded-lg p-1.5 transition-colors hover:bg-accent"
              :title="record.url"
              @click="handleSelectHistory(record)"
            >
              <span class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-muted">
                <EmojiRenderer :url="record.url" />
              </span>
              <span class="w-full truncate text-center text-[11px] leading-tight">{{ getUrlLabel(record.url) }}</span>
            </button>
          </div>
        </div>

        <div
          v-if="pages.length === 0 && filteredHistory.length === 0 && !urlInput.trim()"
          class="py-4 text-center text-sm text-muted-foreground"
        >
          暂无内容
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
