<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Minus, Square, X, Copy } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import draggable from 'vuedraggable'
import TabItem from './TabItem.vue'
import { useTabStore } from '@/stores/tab'
import { useAccountStore } from '@/stores/account'

defineProps<{
  isMaximized: boolean
}>()

const tabStore = useTabStore()
const accountStore = useAccountStore()
const showAddDialog = ref(false)

const windowApi = () => window.api

function minimizeWindow() {
  windowApi()?.window.minimize()
}

function maximizeWindow() {
  windowApi()?.window.maximize()
}

function closeWindow() {
  windowApi()?.window.close()
}

function onDragEnd() {
  const ids = tabStore.sortedTabs.map((t) => t.id)
  tabStore.reorderTabs(ids)
}

function addTab(accountId: string) {
  tabStore.createTab(accountId)
  showAddDialog.value = false
}
</script>

<template>
  <div class="flex items-end h-[40px] bg-card/50 border-b border-border overflow-hidden">
    <!-- 标签列表（可拖拽排序） -->
    <draggable
      :model-value="tabStore.sortedTabs"
      :animation="150"
      item-key="id"
      class="flex h-full min-w-0"
      @end="onDragEnd"
      @update:model-value="tabStore.tabs = $event"
    >
      <template #item="{ element: tab }">
        <TabItem :tab="tab" />
      </template>
    </draggable>

    <!-- 新建标签按钮 -->
    <Button variant="ghost" size="icon" class="h-full w-7 flex-shrink-0" @click="showAddDialog = true">
      <Plus class="w-3.5 h-3.5" />
    </Button>
    <Dialog :open="showAddDialog" @update:open="showAddDialog = $event">
      <DialogContent class="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>新建标签页</DialogTitle>
        </DialogHeader>
        <ScrollArea class="max-h-[300px]">
          <div v-if="accountStore.accounts.length === 0" class="py-6 text-center text-sm text-muted-foreground">
            暂无账号，请先创建
          </div>
          <div v-else class="flex flex-col gap-1">
            <button
              v-for="account in accountStore.accounts"
              :key="account.id"
              class="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors text-left"
              @click="addTab(account.id)"
            >
              <img
                v-if="account.icon?.startsWith('img:')"
                :src="`account-icon://${account.icon.slice(4)}`"
                alt=""
                class="w-5 h-5 rounded-sm object-cover"
              />
              <span v-else class="text-base leading-none">{{ account.icon }}</span>
              <span>{{ account.name }}</span>
            </button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>

    <!-- 填充可拖拽区域 -->
    <div class="flex-1 min-w-[60px] h-full" style="-webkit-app-region: drag" />

    <!-- 窗口控制按钮 -->
    <div class="flex items-center h-full flex-shrink-0" style="-webkit-app-region: no-drag">
      <Button
        variant="ghost"
        size="icon"
        class="h-full w-10 rounded-none hover:bg-secondary"
        @click="minimizeWindow()"
      >
        <Minus class="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="h-full w-10 rounded-none hover:bg-secondary"
        @click="maximizeWindow()"
      >
        <Copy v-if="isMaximized" class="w-3.5 h-3.5" />
        <Square v-else class="w-3 h-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="h-full w-10 rounded-none hover:bg-red-500/80 hover:text-white"
        @click="closeWindow()"
      >
        <X class="w-4 h-4" />
      </Button>
    </div>
  </div>
</template>
