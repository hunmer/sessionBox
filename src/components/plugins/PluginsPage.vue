<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import PluginCard from './PluginCard.vue'
import PluginSettings from './PluginSettings.vue'
import { usePluginStore } from '@/stores/plugin'

const pluginStore = usePluginStore()
const hasPlugins = computed(() => pluginStore.plugins.length > 0)
const showSettings = computed(() => pluginStore.activeViewPluginId !== null)

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
    <div class="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
      <h2 class="text-sm font-semibold flex-shrink-0">插件管理</h2>
      <div class="flex-1" />
      <Button variant="ghost" size="sm" class="h-7 text-xs gap-1" @click="handleRefresh">
        <RefreshCw class="w-3.5 h-3.5" />
        刷新
      </Button>
    </div>
    <div class="flex-1 min-h-0 overflow-auto">
      <div class="max-w-3xl mx-auto p-6">
        <div v-if="hasPlugins" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PluginCard
            v-for="plugin in pluginStore.plugins"
            :key="plugin.id"
            :plugin="plugin"
            @toggle="handleToggle"
            @open-settings="handleOpenSettings"
          />
        </div>
        <div v-else class="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p class="text-sm">暂无插件</p>
          <p class="text-xs mt-1">将插件放置在用户数据目录的 plugins 文件夹中</p>
        </div>
      </div>
    </div>
    <PluginSettings v-if="showSettings" />
  </div>
</template>
