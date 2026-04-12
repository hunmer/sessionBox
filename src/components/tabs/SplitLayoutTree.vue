<script setup lang="ts">
import { computed } from 'vue'
import { GripVertical, Maximize2, Minimize2, Minus, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import type { SplitDropPosition, SplitNode, SplitPane } from '@/types'

defineOptions({
  name: 'SplitLayoutTree'
})

const props = withDefaults(defineProps<{
  node: SplitNode
  paneMap: Record<string, SplitPane | undefined>
  paneTitles: Record<string, string>
  focusedPaneId?: string | null
  manualAdjustEnabled: boolean
  fullscreenPaneId?: string | null
  draggingPaneId: string | null
  preview: { targetPaneId: string; position: SplitDropPosition } | null
  branchPath?: number[]
}>(), {
  branchPath: () => [],
  focusedPaneId: null,
  fullscreenPaneId: null
})

const emit = defineEmits<{
  'pane-click': [paneId: string]
  'request-add-tab': [paneId: string]
  'branch-layout': [path: number[], sizes: number[]]
  'drag-start': [event: DragEvent, paneId: string]
  'drag-end': []
  'drag-enter-pane': [event: DragEvent, paneId: string]
  'drag-over-pane': [event: DragEvent, paneId: string]
  'drop-pane': [event: DragEvent, paneId: string]
  'pane-fullscreen': [paneId: string]
  'pane-close-tab': [paneId: string]
  'pane-remove': [paneId: string]
}>()

const pane = computed(() =>
  props.node.kind === 'pane' ? props.paneMap[props.node.paneId] : undefined
)

const paneId = computed(() => (props.node.kind === 'pane' ? props.node.paneId : ''))
const paneTitle = computed(() => {
  if (props.node.kind !== 'pane') return ''
  return props.paneTitles[props.node.paneId] ?? '空分屏'
})

const isFocused = computed(() => props.node.kind === 'pane' && props.focusedPaneId === props.node.paneId)
const isDragSource = computed(() => props.node.kind === 'pane' && props.draggingPaneId === props.node.paneId)
const isFullscreenPane = computed(() => props.node.kind === 'pane' && props.fullscreenPaneId === props.node.paneId)
const hasActiveTab = computed(() => !!pane.value?.activeTabId)
const canRemovePane = computed(() => Object.keys(props.paneMap).length > 1)
const previewPosition = computed(() => {
  if (props.node.kind !== 'pane') return null
  return props.preview?.targetPaneId === props.node.paneId ? props.preview.position : null
})

function emitBranchLayout(sizes: number[]) {
  emit('branch-layout', props.branchPath, sizes)
}

function hotspotClass(position: SplitDropPosition): string {
  return previewPosition.value === position
    ? 'border-primary/70 bg-primary/18 text-primary shadow-sm'
    : 'border-border/45 bg-background/45 text-muted-foreground/70'
}
</script>

<template>
  <template v-if="node.kind === 'branch'">
    <ResizablePanelGroup
      :direction="node.direction"
      class="h-full w-full"
      @layout="emitBranchLayout"
    >
      <template v-for="(child, index) in node.children" :key="`${branchPath.join('-') || 'root'}-${index}`">
        <ResizablePanel :default-size="node.sizes[index] ?? 50">
          <SplitLayoutTree
            :node="child"
            :pane-map="paneMap"
            :pane-titles="paneTitles"
            :focused-pane-id="focusedPaneId"
            :manual-adjust-enabled="manualAdjustEnabled"
            :fullscreen-pane-id="fullscreenPaneId"
            :dragging-pane-id="draggingPaneId"
            :preview="preview"
            :branch-path="[...branchPath, index]"
            @pane-click="emit('pane-click', $event)"
            @request-add-tab="emit('request-add-tab', $event)"
            @branch-layout="(path, sizes) => emit('branch-layout', path, sizes)"
            @drag-start="(event, paneId) => emit('drag-start', event, paneId)"
            @drag-end="emit('drag-end')"
            @drag-enter-pane="(event, paneId) => emit('drag-enter-pane', event, paneId)"
            @drag-over-pane="(event, paneId) => emit('drag-over-pane', event, paneId)"
            @drop-pane="(event, paneId) => emit('drop-pane', event, paneId)"
            @pane-fullscreen="emit('pane-fullscreen', $event)"
            @pane-close-tab="emit('pane-close-tab', $event)"
            @pane-remove="emit('pane-remove', $event)"
          />
        </ResizablePanel>
        <ResizableHandle v-if="index < node.children.length - 1" />
      </template>
    </ResizablePanelGroup>
  </template>

  <div
    v-else
    :id="`split-pane-shell-${node.paneId}`"
    class="relative h-full w-full overflow-hidden ring-1 ring-inset ring-border/25"
    :class="isFocused ? 'ring-primary/50' : ''"
    @click="emit('pane-click', node.paneId)"
  >
    <div
      v-if="manualAdjustEnabled"
      class="absolute inset-x-0 top-0 z-20 flex h-9 items-center justify-between gap-2 border-b border-border/60 bg-background/92 px-2 backdrop-blur-sm"
      :class="isFocused ? 'bg-background/96' : ''"
    >
      <div class="min-w-0 truncate text-[11px] text-muted-foreground">
        {{ paneTitle }}
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          class="h-6 w-6 rounded-md"
          title="拖拽调整"
          draggable="true"
          @click.stop
          @dragstart="emit('drag-start', $event, node.paneId)"
          @dragend="emit('drag-end')"
        >
          <GripVertical class="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="h-6 w-6 rounded-md"
          :title="isFullscreenPane ? '退出全屏' : '全屏'"
          :disabled="!hasActiveTab"
          @click.stop="emit('pane-fullscreen', node.paneId)"
        >
          <Minimize2 v-if="isFullscreenPane" class="size-3.5" />
          <Maximize2 v-else class="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="h-6 w-6 rounded-md"
          title="移除此分屏"
          :disabled="!canRemovePane"
          @click.stop="emit('pane-remove', node.paneId)"
        >
          <Minus class="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="h-6 w-6 rounded-md"
          title="关闭 tab"
          :disabled="!hasActiveTab"
          @click.stop="emit('pane-close-tab', node.paneId)"
        >
          <X class="size-3.5" />
        </Button>
      </div>
    </div>

    <div
      :id="`webview-pane-content-${node.paneId}`"
      class="absolute inset-x-0 bottom-0"
      :class="manualAdjustEnabled ? 'top-9' : 'top-0'"
    >
      <div
        v-if="!pane?.activeTabId"
        class="flex h-full items-center justify-center px-4"
      >
        <button
          type="button"
          class="rounded-lg border border-dashed border-border/70 bg-background/70 px-4 py-2 text-xs text-muted-foreground transition hover:border-primary/45 hover:text-foreground"
          @click.stop="emit('request-add-tab', node.paneId)"
        >
          【点击打开新标签】
        </button>
      </div>
    </div>

    <div
      v-if="manualAdjustEnabled && draggingPaneId"
      class="absolute inset-x-0 bottom-0 z-30"
      :class="manualAdjustEnabled ? 'top-9' : 'top-0'"
      @dragenter.prevent.stop="emit('drag-enter-pane', $event, node.paneId)"
      @dragover.prevent.stop="emit('drag-over-pane', $event, node.paneId)"
      @drop.prevent.stop="emit('drop-pane', $event, node.paneId)"
    >
      <div class="absolute inset-0 bg-background/20 backdrop-blur-[1px]" />
      <div
        class="absolute inset-2 rounded-xl border border-dashed border-border/50 bg-background/18 transition-all"
        :class="isDragSource ? 'opacity-55' : 'opacity-100'"
      />

      <div class="absolute left-[25%] right-[25%] top-3 flex h-[22%] items-center justify-center rounded-lg border text-[11px] transition-all" :class="hotspotClass('top')">
        上
      </div>
      <div class="absolute bottom-3 left-[25%] right-[25%] flex h-[22%] items-center justify-center rounded-lg border text-[11px] transition-all" :class="hotspotClass('bottom')">
        下
      </div>
      <div class="absolute bottom-[25%] left-3 top-[25%] flex w-[22%] items-center justify-center rounded-lg border text-[11px] transition-all" :class="hotspotClass('left')">
        左
      </div>
      <div class="absolute bottom-[25%] right-3 top-[25%] flex w-[22%] items-center justify-center rounded-lg border text-[11px] transition-all" :class="hotspotClass('right')">
        右
      </div>
      <div class="absolute inset-[31%] flex items-center justify-center rounded-lg border text-[11px] transition-all" :class="hotspotClass('center')">
        中
      </div>
    </div>
  </div>
</template>
