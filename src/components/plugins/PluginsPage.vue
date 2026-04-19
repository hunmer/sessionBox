<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { RefreshCw, Search, FolderOpen, PackagePlus, Store } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import type { PluginMeta, RemotePlugin } from '@/types'
import { useNotification } from '@/composables/useNotification'

const pluginStore = usePluginStore()
const notify = useNotification()

// --- 商店模式状态 ---
const storeMode = ref(false)
const remotePlugins = ref<RemotePlugin[]>([])
const remoteLoading = ref(false)
const loadingPluginId = ref<string | null>(null)

// --- 本地过滤状态 ---
const searchQuery = ref('')
const selectedTags = ref<Set<string>>(new Set())
const filterEnabled = ref<'all' | 'enabled' | 'disabled'>('all')

// --- 在线插件配置 ---
const STORE_BASE_URL = import.meta.env.DEV
  ? 'http://127.0.0.1:8000'
  : 'https://raw.githubusercontent.com/hunmer/sessionBox/refs/heads/master/plugins'
const STORE_URL = `${STORE_BASE_URL}/plugins.json`

function resolveStoreUrl(relativePath: string): string {
  if (!relativePath) return ''
  if (relativePath.startsWith('http')) return relativePath
  return `${STORE_BASE_URL}/${relativePath}`
}

// --- 派生数据 ---
const isStoreMode = computed(() => storeMode.value)

const allTags = computed(() => {
  const tagSet = new Set<string>()
  const source = isStoreMode.value ? remotePlugins.value : pluginStore.plugins
  source.forEach((p) => p.tags.forEach((t) => tagSet.add(t)))
  return Array.from(tagSet).sort()
})

const installedIds = computed(() => new Set(pluginStore.plugins.map((p) => p.id)))

const filteredPlugins = computed(() => {
  const source = isStoreMode.value ? remotePlugins.value : pluginStore.plugins
  return source.filter((plugin) => {
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      if (!plugin.name.toLowerCase().includes(query) && !plugin.description.toLowerCase().includes(query)) {
        return false
      }
    }
    if (selectedTags.value.size > 0) {
      if (!plugin.tags.some((t) => selectedTags.value.has(t))) return false
    }
    if (!isStoreMode.value) {
      const localPlugin = plugin as PluginMeta
      if (filterEnabled.value === 'enabled' && !localPlugin.enabled) return false
      if (filterEnabled.value === 'disabled' && localPlugin.enabled) return false
    }
    return true
  })
})

const hasPlugins = computed(() => {
  return isStoreMode.value ? remotePlugins.value.length > 0 : pluginStore.plugins.length > 0
})
const hasFilteredResults = computed(() => filteredPlugins.value.length > 0)

// --- 事件处理 ---
function toggleTag(tag: string) {
  const next = new Set(selectedTags.value)
  if (next.has(tag)) next.delete(tag)
  else next.add(tag)
  selectedTags.value = next
}

function clearFilters() {
  searchQuery.value = ''
  selectedTags.value = new Set()
  filterEnabled.value = 'all'
}

async function fetchRemotePlugins() {
  remoteLoading.value = true
  try {
    const resp = await fetch(STORE_URL)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json()
    // 将相对路径解析为绝对 URL
    const plugins: RemotePlugin[] = Array.isArray(data) ? data : []
    for (const p of plugins) {
      if (p.iconUrl) p.iconUrl = resolveStoreUrl(p.iconUrl)
    }
    remotePlugins.value = plugins
  } catch (err: any) {
    notify.error(`获取在线插件失败: ${err.message}`)
    remotePlugins.value = []
  } finally {
    remoteLoading.value = false
  }
}

async function handleStoreModeToggle(val: boolean) {
  storeMode.value = val
  if (val) {
    await fetchRemotePlugins()
  }
}

onMounted(async () => {
  await pluginStore.init()
})

async function handleRefresh() {
  if (isStoreMode.value) {
    await fetchRemotePlugins()
  } else {
    await pluginStore.init()
  }
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

async function handleImportPlugin() {
  const result = await pluginStore.importPlugin()
  if (result.success) {
    // toast 会自动显示
  } else if (result.error && result.error !== '已取消') {
    console.error('插件导入失败:', result.error)
  }
}

function handleOpenFolder() {
  pluginStore.openPluginsFolder()
}

async function handleInstall(plugin: RemotePlugin) {
  loadingPluginId.value = plugin.id
  try {
    const result = await window.api.plugin.install(resolveStoreUrl(plugin.downloadUrl))
    if (result.success) {
      notify.success(`插件 ${result.pluginName || plugin.name} 安装成功`)
      await pluginStore.init()
    } else {
      notify.error(result.error || '安装失败')
    }
  } catch (err: any) {
    notify.error(`安装失败: ${err.message}`)
  } finally {
    loadingPluginId.value = null
  }
}

async function handleUninstall(pluginId: string) {
  loadingPluginId.value = pluginId
  try {
    const result = await window.api.plugin.uninstall(pluginId)
    if (result.success) {
      notify.success('插件已卸载')
      await pluginStore.init()
    } else {
      notify.error(result.error || '卸载失败')
    }
  } catch (err: any) {
    notify.error(`卸载失败: ${err.message}`)
  } finally {
    loadingPluginId.value = null
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-background text-foreground">
    <!-- 标题栏 -->
    <div class="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
      <h2 class="text-sm font-semibold flex-shrink-0">
        {{ isStoreMode ? '插件商店' : '插件管理' }}
      </h2>
      <div class="flex-1" />
      <div class="flex items-center gap-1.5 mr-2">
        <Store class="w-3.5 h-3.5 text-muted-foreground" />
        <span class="text-xs text-muted-foreground">商店</span>
        <Switch
          :model-value="storeMode"
          @update:model-value="handleStoreModeToggle"
        />
      </div>
      <template v-if="!isStoreMode">
        <Button
          variant="ghost"
          size="sm"
          class="h-7 text-xs gap-1"
          @click="handleImportPlugin"
        >
          <PackagePlus class="w-3.5 h-3.5" />
          导入插件
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-7 text-xs gap-1"
          @click="handleOpenFolder"
        >
          <FolderOpen class="w-3.5 h-3.5" />
          打开文件夹
        </Button>
      </template>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 text-xs gap-1"
        @click="handleRefresh"
      >
        <RefreshCw
          class="w-3.5 h-3.5"
          :class="{ 'animate-spin': remoteLoading }"
        />
        刷新
      </Button>
    </div>

    <!-- 过滤栏 -->
    <div
      v-if="hasPlugins"
      class="px-4 py-2 border-b border-border space-y-2 flex-shrink-0"
    >
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            placeholder="搜索插件名称或描述..."
            class="h-7 pl-8 text-xs"
          />
        </div>
        <Select
          v-if="!isStoreMode"
          v-model="filterEnabled"
        >
          <SelectTrigger class="w-[120px] !h-7 text-xs py-0 px-2">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              全部状态
            </SelectItem>
            <SelectItem value="enabled">
              已启用
            </SelectItem>
            <SelectItem value="disabled">
              已禁用
            </SelectItem>
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

      <div
        v-if="allTags.length"
        class="flex flex-wrap gap-1"
      >
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
        <!-- 加载中 -->
        <div
          v-if="isStoreMode && remoteLoading"
          class="flex flex-col items-center justify-center py-20 text-muted-foreground"
        >
          <RefreshCw class="w-6 h-6 animate-spin mb-2" />
          <p class="text-sm">
            加载在线插件...
          </p>
        </div>
        <!-- 正常列表 -->
        <div
          v-else-if="hasPlugins && hasFilteredResults"
          class="grid grid-cols-2 md:grid-cols-3 gap-4"
        >
          <PluginCard
            v-for="plugin in filteredPlugins"
            :key="plugin.id"
            :plugin="plugin"
            :store-mode="isStoreMode"
            :installed="isStoreMode && installedIds.has(plugin.id)"
            :loading="loadingPluginId === plugin.id"
            @toggle="handleToggle"
            @open-settings="handleOpenSettings"
            @install="handleInstall"
            @uninstall="handleUninstall"
          />
        </div>
        <div
          v-else-if="hasPlugins && !hasFilteredResults"
          class="flex flex-col items-center justify-center py-20 text-muted-foreground"
        >
          <p class="text-sm">
            没有匹配的插件
          </p>
          <p class="text-xs mt-1">
            尝试调整搜索条件或过滤选项
          </p>
        </div>
        <div
          v-else
          class="flex flex-col items-center justify-center py-20 text-muted-foreground"
        >
          <p class="text-sm">
            {{ isStoreMode ? '商店暂无插件' : '暂无插件' }}
          </p>
          <p class="text-xs mt-1">
            {{ isStoreMode ? '请稍后再试或检查网络连接' : '将插件放置在用户数据目录的 plugins 文件夹中' }}
          </p>
        </div>
      </div>
    </div>
    <PluginSettings />
  </div>
</template>
