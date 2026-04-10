<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <kbd
    data-slot="kbd"
    :class="cn(
      'inline-flex items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground min-w-[22px] h-[22px]',
      'shadow-[0_1px_0_1px_rgba(0,0,0,0.05)]',
      props.class
    )"
  >
    <slot />
  </kbd>
</template>
