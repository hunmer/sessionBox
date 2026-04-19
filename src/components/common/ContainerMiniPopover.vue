<script setup lang="ts">
import { computed } from 'vue'
import {
  Box,
  ArrowRight,
  Check,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
import { useContainerStore } from '@/stores/container'
import { useTabStore } from '@/stores/tab'
import { usePageStore } from '@/stores/page'

const containerStore = useContainerStore()
const tabStore = useTabStore()
const pageStore = usePageStore()

const emit = defineEmits<{ 'open-full': [] }>()

/** 当前激活标签关联的页面 */
const currentPage = computed(() => {
  const tab = tabStore.activeTab
  if (!tab) return null
  return pageStore.getPage(tab.pageId)
})

/** 当前页面绑定的容器 ID */
const currentContainerId = computed(() => currentPage.value?.containerId ?? null)

/** 当前容器名称 */
const currentContainerName = computed(() => {
  if (!currentContainerId.value) return '默认容器'
  return containerStore.getContainer(currentContainerId.value)?.name ?? '未知容器'
})

/** 所有容器 */
const containers = computed(() => containerStore.containers)

/** 图标是否为自定义图片 */
function isImageIcon(icon?: string): boolean {
  return !!icon?.startsWith('img:')
}

/** 切换当前页面的容器 */
async function handleSelectContainer(containerId: string) {
  if (!currentPage.value) return
  if (containerId === currentContainerId.value) return

  await pageStore.updatePage(currentPage.value.id, {
    containerId: containerId || undefined,
  })
}

/** 取消容器绑定，恢复为默认 */
async function handleClearContainer() {
  if (!currentPage.value) return
  if (!currentContainerId.value) return

  await pageStore.updatePage(currentPage.value.id, {
    containerId: undefined,
  })
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
        <Box class="h-3.5 w-3.5 text-muted-foreground" />
        查看容器
        <Badge
          v-if="containers.length"
          variant="secondary"
          class="text-[10px] h-4"
        >
          {{ containers.length }}
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

    <!-- 当前容器状态 -->
    <div
      v-if="currentPage"
      class="px-3 py-2"
    >
      <div class="flex items-center gap-2">
        <Badge
          variant="secondary"
          class="text-[10px] h-4 shrink-0"
        >
          当前
        </Badge>
        <span class="text-xs text-muted-foreground truncate">
          {{ currentContainerName }}
        </span>
      </div>
    </div>
    <Separator v-if="currentPage" />

    <!-- 容器列表 -->
    <ScrollArea class="h-[320px]">
      <div
        v-if="containers.length === 0"
        class="flex items-center justify-center py-8"
      >
        <p class="text-xs text-muted-foreground">
          暂无容器
        </p>
      </div>
      <div
        v-else
        class="py-1"
      >
        <!-- 默认容器（无容器绑定） -->
        <div
          class="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors"
          :class="{ 'bg-muted/30': !currentContainerId }"
          @click="handleClearContainer"
        >
          <div class="shrink-0 w-5 h-5 flex items-center justify-center">
            <Check
              v-if="!currentContainerId"
              class="h-3.5 w-3.5 text-primary"
            />
          </div>
          <div class="flex-1 min-w-0">
            <span class="text-xs">默认容器</span>
            <div class="text-[10px] text-muted-foreground">
              不使用容器隔离
            </div>
          </div>
        </div>

        <!-- 具体容器 -->
        <div
          v-for="container in containers"
          :key="container.id"
          class="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors"
          :class="{ 'bg-muted/30': container.id === currentContainerId }"
          @click="handleSelectContainer(container.id)"
        >
          <!-- 选中标记 -->
          <div class="shrink-0 w-5 h-5 flex items-center justify-center">
            <Check
              v-if="container.id === currentContainerId"
              class="h-3.5 w-3.5 text-primary"
            />
          </div>

          <!-- 容器图标 -->
          <span class="shrink-0 w-5 h-5 flex items-center justify-center overflow-hidden">
            <img
              v-if="isImageIcon(container.icon)"
              :src="`account-icon://${container.icon.slice(4)}`"
              alt=""
              class="w-full h-full rounded-sm object-cover"
            >
            <EmojiRenderer
              v-else-if="container.icon"
              :emoji="container.icon"
              class="text-sm"
            />
            <Box
              v-else
              class="h-3.5 w-3.5 text-muted-foreground"
            />
          </span>

          <!-- 容器名称 -->
          <div class="flex-1 min-w-0">
            <span class="text-xs truncate">{{ container.name }}</span>
          </div>
        </div>
      </div>
    </ScrollArea>

    <Separator />
    <!-- 底部统计 -->
    <div class="px-3 py-1.5">
      <span class="text-[10px] text-muted-foreground">
        共 {{ containers.length }} 个容器
      </span>
    </div>
  </div>
</template>
