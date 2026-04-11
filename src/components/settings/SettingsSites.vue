<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Trash2, VolumeX } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useBookmarkStore } from '@/stores/bookmark'

const bookmarkStore = useBookmarkStore()
const api = window.api

// ====== 常用网站 ======
const newTitle = ref('')
const newUrl = ref('')

async function addSite() {
  const title = newTitle.value.trim()
  const url = newUrl.value.trim()
  if (!title || !url) return
  const siblings = bookmarkStore.toolbarBookmarks
  await bookmarkStore.createBookmark({
    title,
    url: url.match(/^https?:\/\//) ? url : `https://${url}`,
    folderId: '__bookmark_bar__',
    order: siblings.length
  })
  newTitle.value = ''
  newUrl.value = ''
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

async function removeSite(id: string) {
  await bookmarkStore.deleteBookmark(id)
}

// ====== 默认静音的网站 ======
const mutedSites = ref<string[]>([])
const newHostname = ref('')

async function loadMutedSites() {
  mutedSites.value = await api.mutedSites.list()
}

async function addMutedSite() {
  let hostname = newHostname.value.trim()
  if (!hostname) return
  // 自动去除协议前缀
  hostname = hostname.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!hostname) return
  await api.mutedSites.add(hostname)
  newHostname.value = ''
  await loadMutedSites()
}

async function removeMutedSite(hostname: string) {
  await api.mutedSites.remove(hostname)
  await loadMutedSites()
}

onMounted(loadMutedSites)
</script>

<template>
  <!-- 常用网站 -->
  <h3 class="text-sm font-medium mb-3">常用网站</h3>
  <p class="text-xs text-muted-foreground mb-4">添加常用网站后，在新建/编辑容器时可快速选择网址。</p>

  <div class="flex gap-2 mb-4">
    <Input v-model="newTitle" placeholder="网站标题" class="w-36" @keydown.enter="addSite" />
    <Input v-model="newUrl" placeholder="网址 URL" class="flex-1" @keydown.enter="addSite" />
    <Button size="sm" :disabled="!newTitle.trim() || !newUrl.trim()" @click="addSite">
      <Plus class="w-4 h-4" />
    </Button>
  </div>

  <div class="flex flex-col gap-1.5">
    <div
      v-for="site in bookmarkStore.toolbarBookmarks"
      :key="site.id"
      class="flex items-center gap-2 text-sm px-3 py-2 rounded-md border bg-card"
    >
      <img
        :src="'https://icon.horse/icon/' + getHostname(site.url)"
        :alt="site.title"
        class="w-4 h-4 shrink-0 rounded-sm"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      <span class="font-medium truncate">{{ site.title }}</span>
      <span class="text-muted-foreground truncate text-xs flex-1">{{ site.url }}</span>
      <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" @click="removeSite(site.id)">
        <Trash2 class="w-3.5 h-3.5 text-muted-foreground" />
      </Button>
    </div>
    <p v-if="!bookmarkStore.toolbarBookmarks.length" class="text-xs text-muted-foreground text-center py-4">
      暂无常用网站，请添加
    </p>
  </div>

  <Separator class="my-6" />

  <!-- 默认静音的网站 -->
  <h3 class="text-sm font-medium mb-3">默认静音的网站</h3>
  <p class="text-xs text-muted-foreground mb-4">添加网站域名后，打开该网站的标签页将自动静音。支持精确匹配和子域名匹配（如添加 <code class="bg-muted px-1 rounded text-xs">example.com</code> 也会匹配 <code class="bg-muted px-1 rounded text-xs">sub.example.com</code>）。</p>

  <div class="flex gap-2 mb-4">
    <Input
      v-model="newHostname"
      placeholder="网站域名，如 www.douyin.com"
      class="flex-1"
      @keydown.enter="addMutedSite"
    />
    <Button size="sm" :disabled="!newHostname.trim()" @click="addMutedSite">
      <Plus class="w-4 h-4" />
    </Button>
  </div>

  <div class="flex flex-col gap-1.5">
    <div
      v-for="hostname in mutedSites"
      :key="hostname"
      class="flex items-center gap-2 text-sm px-3 py-2 rounded-md border bg-card"
    >
      <VolumeX class="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      <span class="font-medium truncate flex-1">{{ hostname }}</span>
      <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" @click="removeMutedSite(hostname)">
        <Trash2 class="w-3.5 h-3.5 text-muted-foreground" />
      </Button>
    </div>
    <p v-if="!mutedSites.length" class="text-xs text-muted-foreground text-center py-4">
      暂无静音网站，请添加
    </p>
  </div>
</template>
