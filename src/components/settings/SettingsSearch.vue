<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Trash2, Star } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getFaviconUrl } from '@/lib/utils'

const api = window.api

interface SearchEngine {
  id: string
  name: string
  url: string
  icon?: string
}

const engines = ref<SearchEngine[]>([])
const defaultId = ref('')
const newName = ref('')
const newUrl = ref('')

async function loadEngines() {
  engines.value = await api.searchEngine.list()
  defaultId.value = await api.searchEngine.getDefault()
}

async function addEngine() {
  const name = newName.value.trim()
  let url = newUrl.value.trim()
  if (!name || !url) return
  if (!url.includes('%s')) url += '%s'
  const id = `custom-${Date.now()}`
  engines.value.push({ id, name, url })
  await api.searchEngine.set(engines.value)
  newName.value = ''
  newUrl.value = ''
}

async function removeEngine(id: string) {
  engines.value = engines.value.filter((e) => e.id !== id)
  await api.searchEngine.set(engines.value)
  // 删除的如果是默认引擎，重置为第一个
  if (defaultId.value === id && engines.value.length > 0) {
    await setDefault(engines.value[0].id)
  }
}

async function setDefault(id: string) {
  defaultId.value = id
  await api.searchEngine.setDefault(id)
}

onMounted(loadEngines)
</script>

<template>
  <h3 class="text-sm font-medium mb-3">搜索引擎管理</h3>
  <p class="text-xs text-muted-foreground mb-4">
    管理命令面板和地址栏中可用的搜索引擎。URL 中的 <code class="bg-muted px-1 rounded text-xs">%s</code> 会被替换为用户输入的搜索词。
  </p>

  <!-- 添加搜索引擎 -->
  <div class="flex gap-2 mb-4">
    <Input
      v-model="newName"
      placeholder="名称，如 Google"
      class="w-32 shrink-0"
      @keydown.enter="addEngine"
    />
    <Input
      v-model="newUrl"
      placeholder="搜索 URL，如 https://google.com/search?q=%s"
      class="flex-1"
      @keydown.enter="addEngine"
    />
    <Button size="sm" :disabled="!newName.trim() || !newUrl.trim()" @click="addEngine">
      <Plus class="w-4 h-4" />
    </Button>
  </div>

  <!-- 引擎列表 -->
  <div class="flex flex-col gap-1.5">
    <div
      v-for="engine in engines"
      :key="engine.id"
      class="flex items-center gap-2 text-sm px-3 py-2 rounded-md border bg-card"
      :class="defaultId === engine.id && 'ring-1 ring-primary/40'"
    >
      <img
        :src="getFaviconUrl(engine.url)"
        :alt="engine.name"
        class="w-4 h-4 shrink-0 rounded-sm object-contain"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      <span class="font-medium truncate">{{ engine.name }}</span>
      <span v-if="defaultId === engine.id" class="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">默认</span>
      <span class="truncate flex-1 text-muted-foreground text-xs">{{ engine.url }}</span>
      <Button
        v-if="defaultId !== engine.id"
        variant="ghost" size="icon" class="h-7 w-7 shrink-0"
        title="设为默认"
        @click="setDefault(engine.id)"
      >
        <Star class="w-3.5 h-3.5 text-muted-foreground" />
      </Button>
      <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" @click="removeEngine(engine.id)">
        <Trash2 class="w-3.5 h-3.5 text-muted-foreground" />
      </Button>
    </div>
    <p v-if="!engines.length" class="text-xs text-muted-foreground text-center py-4">
      暂无搜索引擎，请添加
    </p>
  </div>
</template>
