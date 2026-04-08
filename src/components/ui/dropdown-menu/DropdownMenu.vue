<script setup lang="ts">
import type { DropdownMenuRootEmits, DropdownMenuRootProps } from "reka-ui"
import { DropdownMenuRoot, useForwardPropsEmits } from "reka-ui"
import { webviewOverlayShow, webviewOverlayHide } from "@/lib/webview-overlay"

const props = defineProps<DropdownMenuRootProps>()
const emits = defineEmits<DropdownMenuRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)

function handleOpenChange(open: boolean) {
  if (open) webviewOverlayHide()
  else webviewOverlayShow()
  emits('update:open', open)
}
</script>

<template>
  <DropdownMenuRoot
    v-slot="slotProps"
    data-slot="dropdown-menu"
    v-bind="forwarded"
    @update:open="handleOpenChange"
  >
    <slot v-bind="slotProps" />
  </DropdownMenuRoot>
</template>
