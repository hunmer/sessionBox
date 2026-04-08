<script setup lang="ts">
import type { ContextMenuRootEmits, ContextMenuRootProps } from "reka-ui"
import { ContextMenuRoot, useForwardPropsEmits } from "reka-ui"
import { webviewOverlayShow, webviewOverlayHide } from "@/lib/webview-overlay"

const props = defineProps<ContextMenuRootProps>()
const emits = defineEmits<ContextMenuRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)

function handleOpenChange(open: boolean) {
  if (open) webviewOverlayHide()
  else webviewOverlayShow()
  emits('update:open', open)
}
</script>

<template>
  <ContextMenuRoot
    data-slot="context-menu"
    v-bind="forwarded"
    @update:open="handleOpenChange"
  >
    <slot />
  </ContextMenuRoot>
</template>
