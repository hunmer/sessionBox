<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Globe, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import AddFavoriteDialog from './AddFavoriteDialog.vue'
import { useFavoriteSiteStore } from '@/stores/favoriteSite'
import { useTabStore } from '@/stores/tab'

const favoriteSiteStore = useFavoriteSiteStore()
const tabStore = useTabStore()

const showAddDialog = ref(false)
const editSite = ref<{ id: string; title: string; url: string; accountId?: string } | null>(null)

/** 点击快捷网站，在新 tab 中打开 */
function openSite(site: { url: string; accountId?: string }) {
  tabStore.createTabForSite(site.url, site.accountId)
}

/** 右键删除 */
function handleContextMenu(e: MouseEvent, site: { id: string; title: string; url: string; accountId?: string }) {
  e.preventDefault()
  // 简单的右键删除确认
  if (confirm(`删除快捷网站「${site.title}」？`)) {
    favoriteSiteStore.deleteSite(site.id)
  }
}

/** 编辑网站 */
function handleEdit(site: { id: string; title: string; url: string; accountId?: string }) {
  editSite.value = { ...site }
  showAddDialog.value = true
}

/** 添加按钮 */
function handleAdd() {
  editSite.value = null
  showAddDialog.value = true
}

/** 对话框关闭时清理编辑状态 */
function onDialogClose(open: boolean) {
  showAddDialog.value = open
  if (!open) editSite.value = null
}

/** 获取网站首字母作为 fallback 图标 */
function getInitial(title: string): string {
  return title.charAt(0).toUpperCase()
}
</script>

<template>
  <div class="flex items-center h-[34px] px-2 gap-1 bg-card/20 border-b border-border overflow-x-auto scrollbar-none">
    <!-- 添加按钮 -->
    <Tooltip :delay-duration="300">
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon-sm"
          class="h-7 w-7 flex-shrink-0 rounded-md hover:bg-secondary"
          @click="handleAdd"
        >
          <Plus class="w-3.5 h-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" :side-offset="4">添加快捷网站</TooltipContent>
    </Tooltip>

    <div class="w-px h-4 bg-border flex-shrink-0" />

    <!-- 快捷网站列表 -->
    <div class="flex items-center gap-0.5">
      <Tooltip v-for="site in favoriteSiteStore.sites" :key="site.id" :delay-duration="300">
        <TooltipTrigger as-child>
          <button
            class="h-7 min-w-[28px] px-1.5 flex items-center justify-center rounded-md text-xs hover:bg-secondary transition-colors flex-shrink-0"
            @click="openSite(site)"
            @contextmenu="handleContextMenu($event, site)"
            @dblclick.prevent="handleEdit(site)"
          >
            <Globe class="w-3.5 h-3.5 text-muted-foreground" />
            <span class="ml-1 truncate max-w-[60px]">{{ site.title }}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" :side-offset="4">
          {{ site.title }}<br />
          <span class="text-muted-foreground text-[10px]">{{ site.url }}</span>
        </TooltipContent>
      </Tooltip>
    </div>

    <!-- 添加/编辑对话框 -->
    <AddFavoriteDialog
      :open="showAddDialog"
      :edit-site="editSite"
      @update:open="onDialogClose"
    />
  </div>
</template>

<style scoped>
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
