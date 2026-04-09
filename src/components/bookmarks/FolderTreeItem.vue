<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronRight, Folder, FolderOpen, MoreHorizontal, FolderPlus, Pencil, Trash2 } from 'lucide-vue-next'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useBookmarkStore } from '@/stores/bookmark'
import type { BookmarkFolder } from '@/types'

const props = defineProps<{
  folder: BookmarkFolder
  selectedFolderId: string
  searchQuery: string
  depth: number
}>()

const emit = defineEmits<{
  select: [id: string]
  addFolder: [parentId: string | null]
  editFolder: [id: string]
}>()

const bookmarkStore = useBookmarkStore()
const open = ref(true)

const children = computed(() => bookmarkStore.getChildFolders(props.folder.id))
const isSelected = computed(() => props.selectedFolderId === props.folder.id)
const bookmarkCount = computed(() => bookmarkStore.getBookmarksByFolder(props.folder.id).length)

function handleClick() {
  emit('select', props.folder.id)
}
</script>

<template>
  <div>
    <Collapsible v-model:open="open">
      <div
        class="group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors"
        :class="isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'"
        :style="{ paddingLeft: `${depth * 16 + 8}px` }"
        @click="handleClick"
      >
        <!-- 折叠按钮 -->
        <CollapsibleTrigger as-child>
          <button
            v-if="children.length > 0"
            class="flex-shrink-0 transition-transform p-0.5 rounded hover:bg-accent/80"
            :class="open ? 'rotate-90' : ''"
            @click.stop
          >
            <ChevronRight class="w-3 h-3" />
          </button>
          <span v-else class="w-4 flex-shrink-0" />
        </CollapsibleTrigger>

        <!-- 文件夹图标 -->
        <component :is="open ? FolderOpen : Folder" class="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />

        <!-- 文件夹名 -->
        <span class="flex-1 truncate text-xs">{{ folder.name }}</span>

        <!-- 书签数量 -->
        <span v-if="bookmarkCount > 0" class="text-[10px] text-muted-foreground flex-shrink-0">
          {{ bookmarkCount }}
        </span>

        <!-- 更多操作 -->
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              class="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent/80 transition-opacity"
              @click.stop
            >
              <MoreHorizontal class="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-32">
            <DropdownMenuItem class="text-xs" @click="emit('addFolder', folder.id)">
              <FolderPlus class="w-3 h-3 mr-1.5" /> 新建子文件夹
            </DropdownMenuItem>
            <DropdownMenuItem class="text-xs" @click="emit('editFolder', folder.id)">
              <Pencil class="w-3 h-3 mr-1.5" /> 重命名
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="folder.id !== '__bookmark_bar__'"
              class="text-xs text-destructive"
              @click="bookmarkStore.deleteFolder(folder.id)"
            >
              <Trash2 class="w-3 h-3 mr-1.5" /> 删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <!-- 子文件夹 -->
      <CollapsibleContent>
        <FolderTreeItem
          v-for="child in children"
          :key="child.id"
          :folder="child"
          :selected-folder-id="selectedFolderId"
          :search-query="searchQuery"
          :depth="depth + 1"
          @select="emit('select', $event)"
          @add-folder="emit('addFolder', $event)"
          @edit-folder="emit('editFolder', $event)"
        />
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
