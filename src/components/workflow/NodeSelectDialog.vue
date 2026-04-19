<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  getNodeDefinitionsByCategory,
  searchNodeDefinitions,
  allNodeDefinitions,
} from '@/lib/workflow/nodeRegistry'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [type: string]
}>()

const searchQuery = ref('')
const selectedCategory = ref<string | null>(null)

const categories = computed(() => {
  const grouped = getNodeDefinitionsByCategory()
  return Object.keys(grouped)
})

const filteredNodes = computed(() => {
  if (searchQuery.value.trim()) {
    return searchNodeDefinitions(searchQuery.value)
  }
  if (selectedCategory.value) {
    const grouped = getNodeDefinitionsByCategory()
    return grouped[selectedCategory.value] || []
  }
  return allNodeDefinitions
})

function getIcon(name: string) {
  return resolveLucideIcon(name)
}

function handleSelect(type: string) {
  emit('select', type)
  emit('update:open', false)
  searchQuery.value = ''
  selectedCategory.value = null
}

function handleOpenChange(value: boolean) {
  if (!value) {
    searchQuery.value = ''
    selectedCategory.value = null
  }
  emit('update:open', value)
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="handleOpenChange"
  >
    <DialogContent class="sm:max-w-[640px] p-0 gap-0 overflow-hidden">
      <DialogHeader class="p-4 pb-3">
        <DialogTitle class="text-sm">
          选择节点
        </DialogTitle>
        <div class="relative mt-2">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            placeholder="搜索节点..."
            class="pl-8 h-7 text-xs"
          />
        </div>
      </DialogHeader>

      <div class="flex h-[380px] border-t border-border">
        <!-- 左侧：分类列表 -->
        <div class="w-36 shrink-0 border-r border-border bg-muted/30">
          <ScrollArea class="h-full">
            <div class="p-1 space-y-0.5">
              <button
                class="w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors"
                :class="selectedCategory === null
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'"
                @click="selectedCategory = null"
              >
                全部节点
              </button>
              <button
                v-for="cat in categories"
                :key="cat"
                class="w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors truncate"
                :class="selectedCategory === cat
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'"
                @click="selectedCategory = cat"
              >
                {{ cat }}
              </button>
            </div>
          </ScrollArea>
        </div>

        <!-- 右侧：节点网格 -->
        <div class="flex-1 min-w-0">
          <ScrollArea class="h-full">
            <div
              v-if="filteredNodes.length > 0"
              class="grid grid-cols-3 gap-2 p-3"
            >
              <button
                v-for="node in filteredNodes"
                :key="node.type"
                class="group flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border
                       hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer"
                @click="handleSelect(node.type)"
              >
                <div class="p-2 rounded-md bg-muted group-hover:bg-primary/10 transition-colors">
                  <component
                    :is="getIcon(node.icon)"
                    v-if="getIcon(node.icon)"
                    class="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors"
                  />
                </div>
                <span class="text-[11px] text-center leading-tight line-clamp-2 w-full">
                  {{ node.label }}
                </span>
              </button>
            </div>
            <div
              v-else
              class="flex items-center justify-center h-40 text-xs text-muted-foreground"
            >
              暂无匹配节点
            </div>
          </ScrollArea>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
