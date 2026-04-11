<script setup lang="ts">
import {
  PanelTop,
  PanelLeft,
  FolderOpen,
  User,
  Bookmark,
  Check,
  MoreHorizontal,
  MoreVertical
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useTabStore, type TabGroupMode } from '@/stores/tab'

defineProps<{
  direction: 'horizontal' | 'vertical'
}>()

const tabStore = useTabStore()

function setGroupMode(mode: TabGroupMode) {
  tabStore.setTabGroupMode(tabStore.tabGroupMode === mode ? 'none' : mode)
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon-sm"
        class="h-7 w-7 rounded-full"
        :class="{ 'flex-shrink-0': direction === 'horizontal' }"
      >
        <MoreHorizontal v-if="direction === 'horizontal'" class="w-3.5 h-3.5" />
        <MoreVertical v-else class="w-3.5 h-3.5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-48">
      <DropdownMenuItem class="cursor-pointer" @click="tabStore.toggleLayout()">
        <PanelTop v-if="direction === 'vertical'" class="size-4 mr-2" />
        <PanelLeft v-else class="size-4 mr-2" />
        <span class="flex-1">{{ direction === 'vertical' ? '水平布局' : '侧边栏布局' }}</span>
        <Check
          v-if="(direction === 'vertical' && tabStore.tabLayout === 'horizontal') || (direction === 'horizontal' && tabStore.tabLayout === 'vertical')"
          class="size-4 text-primary"
        />
      </DropdownMenuItem>
      <DropdownMenuItem class="cursor-pointer" @click="setGroupMode('group')">
        <FolderOpen class="size-4 mr-2" />
        <span class="flex-1">按分组名称分组</span>
        <Check v-if="tabStore.tabGroupMode === 'group'" class="size-4 text-primary" />
      </DropdownMenuItem>
      <DropdownMenuItem class="cursor-pointer" @click="setGroupMode('account')">
        <User class="size-4 mr-2" />
        <span class="flex-1">按容器名称分组</span>
        <Check v-if="tabStore.tabGroupMode === 'account'" class="size-4 text-primary" />
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem class="cursor-pointer" @click="tabStore.toggleBookmarkBar()">
        <Bookmark class="size-4 mr-2" />
        <span class="flex-1">快捷网站栏</span>
        <Check v-if="tabStore.bookmarkBarVisible" class="size-4 text-primary" />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
