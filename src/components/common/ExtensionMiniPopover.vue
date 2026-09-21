<script setup lang="ts">
import { onMounted } from 'vue'
import { ArrowRight, Puzzle } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useExtensionStore } from '@/stores/extension'

const extensionStore = useExtensionStore()

const emit = defineEmits<{ 'open-full': [] }>()

onMounted(async () => {
  await extensionStore.init()
})

async function toggleExtension(extensionId: string, enabled: boolean) {
  try {
    await extensionStore.updateExtension(extensionId, { enabled })
    await extensionStore.refreshLoadedExtensions()
  } catch (errorCause) {
    console.error('更新扩展失败:', errorCause)
  }
}
</script>

<template>
  <div class="w-72">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between px-3 pt-2 pb-2">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Puzzle class="h-3.5 w-3.5 text-muted-foreground" />
        扩展
        <Badge
          v-if="extensionStore.extensions.length"
          variant="secondary"
          class="text-[10px] h-4"
        >
          {{ extensionStore.extensions.length }}
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="h-6 w-6 shrink-0"
        title="打开扩展管理页面"
        @click="emit('open-full')"
      >
        <ArrowRight class="h-3.5 w-3.5" />
      </Button>
    </div>
    <Separator />

    <!-- 扩展列表 -->
    <ScrollArea class="h-[240px]">
      <div
        v-if="extensionStore.extensions.length === 0"
        class="flex items-center justify-center py-8"
      >
        <p class="text-xs text-muted-foreground">
          暂无已添加的扩展
        </p>
      </div>
      <div
        v-else
        class="py-1"
      >
        <div
          v-for="ext in extensionStore.extensions"
          :key="ext.id"
          class="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
        >
          <!-- 扩展图标 -->
          <div class="shrink-0 w-6 h-6 rounded flex items-center justify-center overflow-hidden bg-muted">
            <img
              v-if="ext.icon"
              :src="`extension-icon://${ext.id}`"
              class="w-5 h-5 object-contain"
              alt=""
            >
            <span
              v-else
              class="text-xs font-medium text-muted-foreground"
            >
              {{ ext.name.charAt(0).toUpperCase() }}
            </span>
          </div>

          <!-- 扩展名称 -->
          <div class="flex-1 min-w-0">
            <span
              class="text-xs truncate"
              :class="{ 'text-muted-foreground': !ext.enabled }"
            >{{ ext.name }}</span>
          </div>

          <!-- 启用开关 -->
          <Switch
            :model-value="ext.enabled"
            class="scale-90"
            @update:model-value="toggleExtension(ext.id, $event)"
          />
        </div>
      </div>
    </ScrollArea>
  </div>
</template>
