<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
import WorkflowFolderTree from './WorkflowFolderTree.vue'
import WorkflowList from './WorkflowList.vue'
import type { Workflow } from '@/lib/workflow/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [workflow: Workflow | null]
}>()

const store = useWorkflowStore()
const selectedFolderId = ref<string | null>(null)
const selectedWorkflow = ref<Workflow | null>(null)

onMounted(() => {
  store.loadData()
})

function onSelectWorkflow(wf: Workflow) {
  selectedWorkflow.value = wf
}

function confirm() {
  emit('select', selectedWorkflow.value)
  emit('update:open', false)
}

function createNew() {
  store.newWorkflow(selectedFolderId.value)
  emit('select', null)
  emit('update:open', false)
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="sm:max-w-[700px] h-[500px] flex flex-col p-0">
      <DialogHeader class="px-4 pt-4">
        <DialogTitle class="text-sm">
          打开工作流
        </DialogTitle>
      </DialogHeader>

      <ResizablePanelGroup
        direction="horizontal"
        class="flex-1 min-h-0 px-4"
      >
        <ResizablePanel
          :default-size="30"
          :min-size="20"
          :max-size="40"
        >
          <WorkflowFolderTree v-model:selected-folder-id="selectedFolderId" />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>
          <WorkflowList
            :folder-id="selectedFolderId"
            @select="onSelectWorkflow"
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <DialogFooter class="px-4 pb-4 gap-2">
        <Button
          variant="outline"
          size="sm"
          class="text-xs"
          @click="createNew"
        >
          新建工作流
        </Button>
        <Button
          size="sm"
          class="text-xs"
          :disabled="!selectedWorkflow"
          @click="confirm"
        >
          打开
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
