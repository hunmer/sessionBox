<script setup lang="ts">
import { nextTick, watch } from 'vue'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { useSplitStore } from '@/stores/split'
import { useTabStore } from '@/stores/tab'

const splitStore = useSplitStore()
const tabStore = useTabStore()

/** Send bounds for all panes to main process */
function sendPaneBounds() {
  if (!splitStore.isSplitActive) return

  const panes = splitStore.activePanes
  const bounds: Array<{ tabId: string; rect: { x: number; y: number; width: number; height: number } }> = []

  for (const pane of panes) {
    if (!pane.activeTabId) continue
    const el = document.getElementById(`webview-pane-${pane.id}`)
    if (!el) continue
    const rect = el.getBoundingClientRect()
    bounds.push({
      tabId: pane.activeTabId,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    })
  }

  if (bounds.length > 0) {
    window.api.split.updateMultiBounds(bounds)
  }
}

function handlePaneClick(paneId?: string | null) {
  if (!paneId) return
  splitStore.focusPane(paneId)
}

function handleLayoutResize() {
  nextTick(() => sendPaneBounds())
}

// Watch for pane changes and re-send bounds
watch(
  () => [splitStore.activePanes.map((p) => `${p.id}:${p.activeTabId}`).join(',')],
  () => {
    nextTick(() => sendPaneBounds())
  },
  { immediate: true, flush: 'post' }
)

// Watch for active tab overlay state changes
watch(
  () => tabStore.activeTabId,
  () => {
    nextTick(() => sendPaneBounds())
  },
  { flush: 'post' }
)
</script>

<template>
  <!-- Single pane mode: just the original container -->
  <div
    v-if="!splitStore.isSplitActive"
    id="webview-container"
    class="absolute inset-0"
  />

  <!-- Multi pane mode: resizable panels -->
  <template v-else>
    <!-- 2-pane horizontal -->
    <ResizablePanelGroup
      v-if="splitStore.activeLayout!.presetType === '2h'"
      direction="horizontal"
      class="absolute inset-0"
      @layout="handleLayoutResize"
    >
      <template v-for="(pane, i) in splitStore.activePanes" :key="pane.id">
        <ResizablePanel :default-size="splitStore.activeLayout!.sizes[i] ?? 50">
          <div
            :id="`webview-pane-${pane.id}`"
            class="relative h-full w-full border-r last:border-r-0 border-border/40"
            @click="handlePaneClick(pane.id)"
          >
            <div v-if="!pane.activeTabId" class="flex items-center justify-center h-full text-muted-foreground text-xs">
              空
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle v-if="i < splitStore.activePanes.length - 1" :key="`handle-${i}`" />
      </template>
    </ResizablePanelGroup>

    <!-- 2-pane vertical -->
    <ResizablePanelGroup
      v-else-if="splitStore.activeLayout!.presetType === '2v'"
      direction="vertical"
      class="absolute inset-0"
      @layout="handleLayoutResize"
    >
      <template v-for="(pane, i) in splitStore.activePanes" :key="pane.id">
        <ResizablePanel :default-size="splitStore.activeLayout!.sizes[i] ?? 50">
          <div
            :id="`webview-pane-${pane.id}`"
            class="relative h-full w-full border-b last:border-b-0 border-border/40"
            @click="handlePaneClick(pane.id)"
          >
            <div v-if="!pane.activeTabId" class="flex items-center justify-center h-full text-muted-foreground text-xs">
              空
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle v-if="i < splitStore.activePanes.length - 1" :key="`handle-${i}`" />
      </template>
    </ResizablePanelGroup>

    <!-- 3-pane: left one, right two vertical -->
    <ResizablePanelGroup
      v-else-if="splitStore.activeLayout!.presetType === '3'"
      direction="horizontal"
      class="absolute inset-0"
      @layout="handleLayoutResize"
    >
      <ResizablePanel :default-size="splitStore.activeLayout!.sizes[0] ?? 50">
        <div
          :id="`webview-pane-${splitStore.activePanes[0]?.id}`"
          class="relative h-full w-full border-r border-border/40"
          @click="handlePaneClick(splitStore.activePanes[0]?.id)"
        >
          <div v-if="!splitStore.activePanes[0]?.activeTabId" class="flex items-center justify-center h-full text-muted-foreground text-xs">
            空
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel :default-size="splitStore.activeLayout!.sizes[1] ?? 50">
        <ResizablePanelGroup direction="vertical" @layout="handleLayoutResize">
          <ResizablePanel :default-size="50">
            <div
              :id="`webview-pane-${splitStore.activePanes[1]?.id}`"
              class="relative h-full w-full border-b border-border/40"
              @click="handlePaneClick(splitStore.activePanes[1]?.id)"
            >
              <div v-if="!splitStore.activePanes[1]?.activeTabId" class="flex items-center justify-center h-full text-muted-foreground text-xs">
                空
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel :default-size="50">
            <div
              :id="`webview-pane-${splitStore.activePanes[2]?.id}`"
              class="relative h-full w-full"
              @click="handlePaneClick(splitStore.activePanes[2]?.id)"
            >
              <div v-if="!splitStore.activePanes[2]?.activeTabId" class="flex items-center justify-center h-full text-muted-foreground text-xs">
                空
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>

    <!-- 4-pane: 2x2 grid -->
    <ResizablePanelGroup
      v-else-if="splitStore.activeLayout!.presetType === '4'"
      direction="horizontal"
      class="absolute inset-0"
      @layout="handleLayoutResize"
    >
      <ResizablePanel :default-size="50">
        <ResizablePanelGroup direction="vertical" @layout="handleLayoutResize">
          <ResizablePanel :default-size="50">
            <div
              :id="`webview-pane-${splitStore.activePanes[0]?.id}`"
              class="relative h-full w-full border-b border-r border-border/40"
              @click="handlePaneClick(splitStore.activePanes[0]?.id)"
            >
              <div v-if="!splitStore.activePanes[0]?.activeTabId" class="flex items-center justify-center h-full text-muted-foreground text-xs">
                空
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel :default-size="50">
            <div
              :id="`webview-pane-${splitStore.activePanes[1]?.id}`"
              class="relative h-full w-full border-r border-border/40"
              @click="handlePaneClick(splitStore.activePanes[1]?.id)"
            >
              <div v-if="!splitStore.activePanes[1]?.activeTabId" class="flex items-center justify-center h-full text-muted-foreground text-xs">
                空
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel :default-size="50">
        <ResizablePanelGroup direction="vertical" @layout="handleLayoutResize">
          <ResizablePanel :default-size="50">
            <div
              :id="`webview-pane-${splitStore.activePanes[2]?.id}`"
              class="relative h-full w-full border-b border-border/40"
              @click="handlePaneClick(splitStore.activePanes[2]?.id)"
            >
              <div v-if="!splitStore.activePanes[2]?.activeTabId" class="flex items-center justify-center h-full text-muted-foreground text-xs">
                空
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel :default-size="50">
            <div
              :id="`webview-pane-${splitStore.activePanes[3]?.id}`"
              class="relative h-full w-full"
              @click="handlePaneClick(splitStore.activePanes[3]?.id)"
            >
              <div v-if="!splitStore.activePanes[3]?.activeTabId" class="flex items-center justify-center h-full text-muted-foreground text-xs">
                空
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>

    <!-- Fallback for unknown preset: single pane -->
    <div v-else id="webview-container" class="absolute inset-0" />
  </template>
</template>
