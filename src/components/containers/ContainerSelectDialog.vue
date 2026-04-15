<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
import { useTabStore } from '@/stores/tab'
import { useContainerStore } from '@/stores/container'
import { useWorkspaceStore } from '@/stores/workspace'

const tabStore = useTabStore()
const containerStore = useContainerStore()
const workspaceStore = useWorkspaceStore()

const selectedWorkspaceId = ref(containerStore.defaultWorkspaceId)

const open = computed({
  get: () => tabStore.pendingExternalUrl !== null,
  set: (val: boolean) => {
    if (!val) tabStore.cancelExternalUrl()
  }
})

const pendingUrl = computed(() => tabStore.pendingExternalUrl)

/** 选择容器后打开外部 URL */
async function selectContainer(containerId: string) {
  const url = tabStore.pendingExternalUrl
  if (!url) return
  tabStore.cancelExternalUrl()
  await tabStore.openExternalUrlInContainer(url, containerId, selectedWorkspaceId.value)
}

/** 使用默认容器打开 */
async function useDefault() {
  const url = tabStore.pendingExternalUrl
  if (!url) return
  tabStore.cancelExternalUrl()
  await tabStore.openExternalUrlInContainer(url, containerStore.defaultContainerId, selectedWorkspaceId.value)
}
</script>

<template>
  <Dialog :open="open" @update:open="open = $event">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>选择容器打开链接</DialogTitle>
        <DialogDescription class="truncate" :title="pendingUrl ?? ''">
          {{ pendingUrl }}
        </DialogDescription>
      </DialogHeader>

      <!-- 工作区选择 -->
      <div>
        <label class="text-xs text-muted-foreground mb-1 block">目标工作区</label>
        <Select v-model="selectedWorkspaceId">
          <SelectTrigger class="w-full">
            <SelectValue placeholder="选择工作区" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">默认工作区</SelectItem>
            <SelectItem v-for="w in workspaceStore.sortedWorkspaces" :key="w.id" :value="w.id">
              {{ w.title }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ScrollArea class="max-h-[45vh]">
        <div class="flex flex-col gap-1 pr-2">
          <button
            v-for="container in containerStore.containers"
            :key="container.id"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none"
            @click="selectContainer(container.id)"
          >
            <EmojiRenderer
              :emoji="container.icon"
              class="text-lg [&_img]:w-5 [&_img]:h-5 [&_*:not(img)]:text-lg shrink-0"
            />
            <span class="flex-1 text-sm truncate">{{ container.name }}</span>
            <span
              v-if="container.id === containerStore.defaultContainerId"
              class="text-xs text-muted-foreground"
            >
              默认
            </span>
          </button>

          <div v-if="containerStore.containers.length === 0" class="py-6 text-center text-sm text-muted-foreground">
            暂无容器
          </div>
        </div>
      </ScrollArea>

      <div class="flex justify-end gap-2 pt-2 border-t">
        <Button variant="ghost" size="sm" @click="open = false">取消</Button>
        <Button variant="secondary" size="sm" @click="useDefault">
          使用默认容器打开
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
