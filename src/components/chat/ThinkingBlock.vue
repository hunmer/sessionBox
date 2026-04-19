<script setup lang="ts">
import { ref } from 'vue'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

defineProps<{
  content: string
}>()

const open = ref(false)
</script>

<template>
  <Collapsible
    v-model:open="open"
    class="my-1"
  >
    <CollapsibleTrigger class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
      <svg
        class="w-3 h-3 transition-transform"
        :class="open ? 'rotate-90' : ''"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
      💭 思考过程
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="mt-1 pl-4 text-xs text-muted-foreground border-l-2 border-muted whitespace-pre-wrap break-words">
        {{ content }}
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
