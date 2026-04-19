<script setup lang="ts">
import { computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Trash2, Workflow } from 'lucide-vue-next'

const props = defineProps<{ folderId: string | null }>()
const emit = defineEmits<{ select: [workflow: any] }>()
const store = useWorkflowStore()

const filteredWorkflows = computed(() => {
  if (props.folderId === null) return store.workflows
  return store.workflows.filter((w) => w.folderId === props.folderId)
})

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <ScrollArea class="h-full">
    <div class="p-2 space-y-1">
      <div
        v-for="wf in filteredWorkflows"
        :key="wf.id"
        class="flex items-center gap-2 px-3 py-2 text-xs rounded cursor-pointer hover:bg-muted/50 group"
        @click="emit('select', wf)"
      >
        <Workflow class="w-4 h-4 text-muted-foreground shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="truncate font-medium">
            {{ wf.name }}
          </div>
          <div class="text-[10px] text-muted-foreground">
            {{ wf.nodes.length }} 个节点 · {{ formatDate(wf.updatedAt) }}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          class="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
          @click.stop="store.deleteWorkflow(wf.id)"
        >
          <Trash2 class="w-3 h-3 text-muted-foreground" />
        </Button>
      </div>

      <div
        v-if="filteredWorkflows.length === 0"
        class="text-xs text-muted-foreground text-center py-8"
      >
        暂无工作流
      </div>
    </div>
  </ScrollArea>
</template>
