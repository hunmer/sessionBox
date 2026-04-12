<script setup lang="ts">
import type { PopoverRootEmits, PopoverRootProps } from "reka-ui"
import { PopoverRoot, useForwardPropsEmits } from "reka-ui"
import { watch } from "vue"
import { webviewOverlayShow, webviewOverlayHide } from "@/lib/webview-overlay"

const props = defineProps<PopoverRootProps>()
const emits = defineEmits<PopoverRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)

watch(() => props.open, (open) => {
  if (open) webviewOverlayHide()
  else webviewOverlayShow()
})
</script>

<template>
  <PopoverRoot
    v-slot="slotProps"
    data-slot="popover"
    v-bind="forwarded"
  >
    <slot v-bind="slotProps" />
  </PopoverRoot>
</template>
