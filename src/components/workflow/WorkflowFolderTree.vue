<script setup lang="ts">
import { computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Folder, FolderOpen, Plus } from 'lucide-vue-next'

const store = useWorkflowStore()
const selectedFolderId = defineModel<string | null>('selectedFolderId', { default: null })

const rootFolders = computed(() =>
  store.workflowFolders.filter((f) => f.parentId === null).sort((a, b) => a.order - b.order),
)

function getChildren(parentId: string) {
  return store.workflowFolders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.order - b.order)
}

async function addFolder(parentId: string | null) {
  await store.createFolder('新文件夹', parentId)
}
</script>

<template>
  <ScrollArea class="h-full">
    <div class="p-2 space-y-0.5">
      <div
        class="flex items-center gap-1.5 px-2 py-1 text-xs rounded cursor-pointer hover:bg-muted/50"
        :class="selectedFolderId === null ? 'bg-muted' : ''"
        @click="selectedFolderId = null"
      >
        <Folder class="w-3.5 h-3.5 text-muted-foreground" />
        <span>全部工作流</span>
      </div>

      <template
        v-for="folder in rootFolders"
        :key="folder.id"
      >
        <div
          class="flex items-center gap-1.5 px-2 py-1 text-xs rounded cursor-pointer hover:bg-muted/50"
          :class="selectedFolderId === folder.id ? 'bg-muted' : ''"
          @click="selectedFolderId = folder.id"
        >
          <component
            :is="selectedFolderId === folder.id ? FolderOpen : Folder"
            class="w-3.5 h-3.5 text-muted-foreground"
          />
          <span class="truncate">{{ folder.name }}</span>
        </div>
        <div
          v-for="child in getChildren(folder.id)"
          :key="child.id"
          class="ml-4"
        >
          <div
            class="flex items-center gap-1.5 px-2 py-1 text-xs rounded cursor-pointer hover:bg-muted/50"
            :class="selectedFolderId === child.id ? 'bg-muted' : ''"
            @click="selectedFolderId = child.id"
          >
            <component
              :is="selectedFolderId === child.id ? FolderOpen : Folder"
              class="w-3.5 h-3.5 text-muted-foreground"
            />
            <span class="truncate">{{ child.name }}</span>
          </div>
        </div>
      </template>

      <Button
        variant="ghost"
        size="sm"
        class="w-full h-6 text-xs justify-start gap-1 px-2"
        @click="addFolder(null)"
      >
        <Plus class="w-3 h-3" /> 新建文件夹
      </Button>
    </div>
  </ScrollArea>
</template>
