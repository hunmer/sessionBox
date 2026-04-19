<script setup lang="ts">
import { ref, computed } from 'vue'
import { getNodeDefinitionsByCategory, searchNodeDefinitions } from '@/lib/workflow/nodeRegistry'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Search } from 'lucide-vue-next'

const searchQuery = ref('')
const openCategories = ref<Record<string, boolean>>({})

const categories = computed(() => {
  if (searchQuery.value.trim()) {
    const results = searchNodeDefinitions(searchQuery.value)
    const grouped: Record<string, typeof results> = {}
    for (const def of results) {
      if (!grouped[def.category]) grouped[def.category] = []
      grouped[def.category].push(def)
    }
    return grouped
  }
  return getNodeDefinitionsByCategory()
})

function onDragStart(event: DragEvent, nodeType: string) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/vueflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }
}

function getIcon(name: string) {
  return resolveLucideIcon(name)
}
</script>

<template>
  <div class="border-r border-border bg-background flex flex-col h-full">
    <div class="p-2 border-b border-border">
      <div class="relative">
        <Search class="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          placeholder="搜索节点..."
          class="pl-7 h-7 text-xs"
        />
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-hidden">
      <ScrollArea class="h-full">
        <div class="p-2 space-y-1">
          <Collapsible
            v-for="(nodes, category) in categories"
            :key="category"
            :open="openCategories[category] ?? true"
            @update:open="openCategories[category] = $event"
          >
            <CollapsibleTrigger class="flex items-center w-full px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground rounded hover:bg-muted/50">
              <span>{{ category }}</span>
              <span class="ml-auto text-[10px]">{{ nodes.length }}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div class="space-y-0.5 mt-0.5">
                <div
                  v-for="node in nodes"
                  :key="node.type"
                  draggable="true"
                  class="flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-grab hover:bg-muted/50 active:cursor-grabbing"
                  @dragstart="onDragStart($event, node.type)"
                >
                  <component
                    :is="getIcon(node.icon)"
                    v-if="getIcon(node.icon)"
                    class="w-3.5 h-3.5 text-muted-foreground shrink-0"
                  />
                  <div class="min-w-0">
                    <div class="truncate">
                      {{ node.label }}
                    </div>
                    <div
                      v-if="node.description"
                      class="text-[10px] text-muted-foreground truncate"
                    >
                      {{ node.description }}
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>
    </div>
  </div>
</template>
