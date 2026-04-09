<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBookmarkStore } from '@/stores/bookmark'

const bookmarkStore = useBookmarkStore()

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
</script>

<template>
  <h3 class="text-sm font-medium mb-3">常用网站</h3>
  <p class="text-xs text-muted-foreground mb-4">添加常用网站后，在新建/编辑账号时可快速选择网址。</p>

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
</template>
