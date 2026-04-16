<script setup lang="ts">
import { onMounted } from 'vue'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { useWorkflowStore } from '@/stores/workflow'
import WorkflowEditor from './WorkflowEditor.vue'

const open = defineModel<boolean>('open', { default: false })
const store = useWorkflowStore()

onMounted(() => {
  store.loadData()
})

function onOpenChange(val: boolean) {
  open.value = val
  if (val) {
    store.loadData()
    // 尝试恢复上次编辑的草稿
    store.restoreDraft()
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent class="sm:max-w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden" :show-close-button="true">
      <WorkflowEditor />
    </DialogContent>
  </Dialog>
</template>
