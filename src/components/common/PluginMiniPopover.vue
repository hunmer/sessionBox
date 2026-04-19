<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Puzzle, ArrowRight, Settings } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { usePluginStore } from '@/stores/plugin'

const pluginStore = usePluginStore()

const emit = defineEmits<{ 'open-full': [] }>()

/** 每个插件的图标缓存 */
const iconMap = ref<Record<string, string | null>>({})

onMounted(async () => {
  if (pluginStore.plugins.length === 0) {
    await pluginStore.init()
  }
  await loadIcons()
})

async function loadIcons() {
  for (const plugin of pluginStore.enabledPlugins) {
    try {
      iconMap.value[plugin.id] = await window.api.plugin.getIcon(plugin.id)
    } catch {
      iconMap.value[plugin.id] = null
    }
  }
}

function handleOpenSettings(pluginId: string) {
  pluginStore.openView(pluginId)
}

function handleOpenFull() {
  emit('open-full')
}
</script>

<template>
  <div class="w-72">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between px-3 pt-2 pb-2">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Puzzle class="h-3.5 w-3.5 text-muted-foreground" />
        已启用插件
        <Badge
          v-if="pluginStore.enabledPlugins.length"
          variant="secondary"
          class="text-[10px] h-4"
        >
          {{ pluginStore.enabledPlugins.length }}
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="h-6 gap-1 text-xs text-primary hover:text-primary"
        @click="handleOpenFull"
      >
        管理
        <ArrowRight class="h-3 w-3" />
      </Button>
    </div>
    <Separator />

    <!-- 插件列表 -->
    <ScrollArea class="h-[240px]">
      <div
        v-if="pluginStore.enabledPlugins.length === 0"
        class="flex items-center justify-center py-8"
      >
        <p class="text-xs text-muted-foreground">
          暂无已启用插件
        </p>
      </div>
      <div
        v-else
        class="py-1"
      >
        <div
          v-for="plugin in pluginStore.enabledPlugins"
          :key="plugin.id"
          class="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
        >
          <!-- 插件图标 -->
          <div class="shrink-0 w-6 h-6 rounded flex items-center justify-center overflow-hidden bg-muted">
            <img
              v-if="iconMap[plugin.id]"
              :src="iconMap[plugin.id]!"
              class="w-5 h-5 object-contain"
              alt=""
            >
            <Puzzle
              v-else
              class="h-3.5 w-3.5 text-muted-foreground"
            />
          </div>

          <!-- 插件名称 -->
          <div class="flex-1 min-w-0">
            <span class="text-xs truncate">{{ plugin.name }}</span>
            <span class="text-[10px] text-muted-foreground ml-1">v{{ plugin.version }}</span>
          </div>

          <!-- 设置按钮 -->
          <Button
            v-if="plugin.hasView"
            variant="ghost"
            size="icon"
            class="h-6 w-6 shrink-0"
            title="设置"
            @click="handleOpenSettings(plugin.id)"
          >
            <Settings class="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>
