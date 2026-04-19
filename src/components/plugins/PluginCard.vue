<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Settings } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import type { PluginMeta, RemotePlugin } from '@/types'

const props = defineProps<{
  plugin: PluginMeta | RemotePlugin
  /** 是否为在线商店模式 */
  storeMode?: boolean
  /** 商店模式下是否已安装 */
  installed?: boolean
  /** 安装/卸载操作进行中 */
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle', pluginId: string): void
  (e: 'open-settings', pluginId: string): void
  (e: 'install', plugin: RemotePlugin): void
  (e: 'uninstall', pluginId: string): void
}>()

const iconDataUrl = ref<string | null>(null)

const isRemote = (p: PluginMeta | RemotePlugin): p is RemotePlugin => 'downloadUrl' in p

onMounted(async () => {
  // 商店模式使用 iconUrl，本地模式使用 IPC 获取图标
  if (props.storeMode && isRemote(props.plugin) && props.plugin.iconUrl) {
    iconDataUrl.value = props.plugin.iconUrl
  } else if (!props.storeMode) {
    try {
      iconDataUrl.value = await window.api.plugin.getIcon(props.plugin.id)
    } catch {
      iconDataUrl.value = null
    }
  }
})
</script>

<template>
  <div
    class="rounded-lg border border-border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30"
    :class="{ 'opacity-60': !storeMode && !plugin.enabled }"
  >
    <div class="flex gap-4">
      <div class="shrink-0">
        <div class="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
          <img
            v-if="iconDataUrl"
            :src="iconDataUrl"
            class="w-10 h-10 object-contain"
            alt=""
          >
          <span
            v-else
            class="text-xl"
          >🧩</span>
        </div>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold truncate">
            {{ plugin.name }}
          </h3>
          <span class="text-xs text-muted-foreground">v{{ plugin.version }}</span>
        </div>
        <p class="text-xs text-muted-foreground mt-1 line-clamp-2">
          {{ plugin.description }}
        </p>
        <div class="text-xs text-muted-foreground mt-1">
          {{ plugin.author.name }}
        </div>
        <div
          v-if="plugin.tags.length"
          class="flex flex-wrap gap-1 mt-2"
        >
          <Badge
            v-for="tag in plugin.tags"
            :key="tag"
            variant="secondary"
            class="text-[10px] px-1.5 py-0"
          >
            {{ tag }}
          </Badge>
        </div>
      </div>
      <div class="flex flex-col items-end gap-2 shrink-0">
        <!-- 本地模式：Switch 启用/禁用 -->
        <template v-if="!storeMode">
          <Switch
            :model-value="plugin.enabled"
            @update:model-value="emit('toggle', plugin.id)"
          />
          <Button
            v-if="plugin.hasView"
            variant="ghost"
            size="icon"
            class="h-7 w-7"
            title="设置"
            @click="emit('open-settings', plugin.id)"
          >
            <Settings class="w-4 h-4" />
          </Button>
        </template>
        <!-- 商店模式：安装/卸载按钮 -->
        <template v-else>
          <Button
            v-if="installed"
            variant="outline"
            size="sm"
            class="h-7 text-xs"
            :disabled="loading"
            @click="emit('uninstall', plugin.id)"
          >
            {{ loading ? '卸载中...' : '卸载' }}
          </Button>
          <Button
            v-else
            size="sm"
            class="h-7 text-xs"
            :disabled="loading"
            @click="emit('install', plugin as RemotePlugin)"
          >
            {{ loading ? '安装中...' : '安装' }}
          </Button>
        </template>
      </div>
    </div>
  </div>
</template>
