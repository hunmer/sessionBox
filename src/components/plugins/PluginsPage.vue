<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { RefreshCw, Search } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import PluginCard from './PluginCard.vue'
import PluginSettings from './PluginSettings.vue'
import { usePluginStore } from '@/stores/plugin'

const pluginStore = usePluginStore()

// --- 过滤状态 ---
const searchQuery = ref('')
const selectedTags = ref<Set<string>>(new Set())
const filterEnabled = ref<'all' | 'enabled' | 'disabled'>('all')

// --- 派生数据 ---
const allTags = computed(() => {
  const tagSet = new Set<string>()
  pluginStore.plugins.forEach((p) => p.tags.forEach((t) => tagSet.add(t)))
  return Array.from(tagSet).sort()
})

const filteredPlugins = computed(() => {
  return pluginStore.plugins.filter((plugin) => {
    // 名称/描述搜索
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      const matchesName = plugin.name.toLowerCase().includes(query)
      const matchesDesc = plugin.description.toLowerCase().includes(query)
      if (!matchesName && !matchesDesc) return false
    }

    // 标签过滤
    if (selectedTags.value.size > 0) {
      const hasMatchingTag = plugin.tags.some((t) => selectedTags.value.has(t))
      if (!hasMatchingTag) return false
    }

    // 启用状态过滤
    if (filterEnabled.value === 'enabled' && !plugin.enabled) return false
    if (filterEnabled.value === 'disabled' && plugin.enabled) return false

    return true
  })
})

const hasPlugins = computed(() => pluginStore.plugins.length > 0)
const hasFilteredResults = computed(() => filteredPlugins.value.length > 0)

// --- 事件处理 ---
function toggleTag(tag: string) {
  const next = new Set(selectedTags.value)
  if (next.has(tag)) {
    next.delete(tag)
  } else {
    next.add(tag)
  }
  selectedTags.value = next
}

function clearFilters() {
  searchQuery.value = ''
  selectedTags.value = new Set()
  filterEnabled.value = 'all'
}

onMounted(async () => {
  await pluginStore.init()
})

async function handleRefresh() {
  await pluginStore.init()
}

async function handleToggle(pluginId: string) {
  const plugin = pluginStore.plugins.find((p) => p.id === pluginId)
  if (!plugin) return
  try {
    if (plugin.enabled) {
      await pluginStore.disablePlugin(pluginId)
    } else {
      await pluginStore.enablePlugin(pluginId)
    }
  } catch (err) {
    console.error('Plugin toggle failed:', err)
  }
}

function handleOpenSettings(pluginId: string) {
  pluginStore.openView(pluginId)
}
</script>

<template>
  <div class="h-full flex flex-col bg-background text-foreground">
    <!-- 标题栏 -->
    <div class="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
      <h2 class="text-sm font-semibold flex-shrink-0">插件管理</h2>
      <div class="flex-1" />
      <Button variant="ghost" size="sm" class="h-7 text-xs gap-1" @click="handleRefresh">
        <RefreshCw class="w-3.5 h-3.5" />
        刷新
      </Button>
    </div>

    <!-- 过滤栏 -->
    <div v-if="hasPlugins" class="px-4 py-2 border-b border-border space-y-2 flex-shrink-0">
      <!-- 搜索框 + 状态过滤 -->
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            placeholder="搜索插件名称或描述..."
            class="h-7 pl-8 text-xs"
          />
        </div>
        <Select v-model="filterEnabled">
          <SelectTrigger class="w-[120px] !h-7 text-xs py-0 px-2">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="enabled">已启用</SelectItem>
            <SelectItem value="disabled">已禁用</SelectItem>
          </SelectContent>
        </Select>
        <Button
          v-if="searchQuery || selectedTags.size || filterEnabled !== 'all'"
          variant="ghost"
          size="sm"
          class="h-7 text-xs text-muted-foreground shrink-0"
          @click="clearFilters"
        >
          清除
        </Button>
      </div>

      <!-- 标签过滤 -->
      <div v-if="allTags.length" class="flex flex-wrap gap-1">
        <Badge
          v-for="tag in allTags"
          :key="tag"
          variant="secondary"
          class="cursor-pointer select-none text-[11px] px-2 py-0.5 transition-colors"
          :class="selectedTags.has(tag)
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'hover:bg-secondary/80'"
          @click="toggleTag(tag)"
        >
          {{ tag }}
        </Badge>
      </div>
    </div>

    <!-- 插件列表 -->
    <div class="flex-1 min-h-0 overflow-auto">
      <div class="w-full p-6">
        <div v-if="hasPlugins && hasFilteredResults" class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <PluginCard
            v-for="plugin in filteredPlugins"
            :key="plugin.id"
            :plugin="plugin"
            @toggle="handleToggle"
            @open-settings="handleOpenSettings"
          />
        </div>
        <div v-else-if="hasPlugins && !hasFilteredResults" class="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p class="text-sm">没有匹配的插件</p>
          <p class="text-xs mt-1">尝试调整搜索条件或过滤选项</p>
        </div>
        <div v-else class="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p class="text-sm">暂无插件</p>
          <p class="text-xs mt-1">将插件放置在用户数据目录的 plugins 文件夹中</p>
        </div>
      </div>
    </div>
    <PluginSettings />
  </div>
</template>
