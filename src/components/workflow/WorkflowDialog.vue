<script setup lang="ts">
import { onMounted, watch } from 'vue'
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

// 监听 open 变化：打开时恢复草稿（比 @update:open 更可靠）
watch(open, (val) => {
  if (val) {
    store.loadData()
    store.restoreDraft()
  }
})
</script>

<template>
  <Dialog
    :open="open"
    @update:open="open = $event"
  >
    <DialogContent
      class="sm:max-w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden"
      :show-close-button="true"
    >
      <WorkflowEditor />
    </DialogContent>
  </Dialog>
</template>
