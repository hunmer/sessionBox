<script setup lang="ts">
import type { ListboxFilterProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { Search } from "lucide-vue-next"
import { ListboxFilter, useForwardProps } from "reka-ui"
import { cn } from "@/lib/utils"
import { useCommand } from "."

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<ListboxFilterProps & {
  class?: HTMLAttributes["class"]
  size?: "default" | "lg"
}>(), {
  size: "default",
})

const delegatedProps = reactiveOmit(props, "class", "size")

const forwardedProps = useForwardProps(delegatedProps)

const { filterState } = useCommand()
</script>

<template>
  <div
    data-slot="command-input-wrapper"
    :class="cn(
      'flex items-center gap-2 border-b px-3',
      props.size === 'lg' ? 'h-12' : 'h-9',
    )"
  >
    <Search
      :class="cn(
        'shrink-0 opacity-50',
        props.size === 'lg' ? 'size-5' : 'size-4',
      )"
    />
    <ListboxFilter
      v-bind="{ ...forwardedProps, ...$attrs }"
      v-model="filterState.search"
      data-slot="command-input"
      auto-focus
      :class="cn(
        'placeholder:text-muted-foreground flex w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
        props.size === 'lg' && 'h-12 text-base',
        props.class,
      )"
    />
  </div>
</template>
