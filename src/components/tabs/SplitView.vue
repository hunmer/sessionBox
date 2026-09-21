<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import type { SplitDropPosition, SplitNode, SplitPane } from '@/types'
import { isWebviewBlocked, setForcedWebviewBlocked } from '@/lib/webview-overlay'
import { useSplitStore } from '@/stores/split'
import { useTabStore } from '@/stores/tab'
import { useIpcEvent } from '@/composables/useIpc'
import type { Page } from '@/types'
import NewTabDialog from './NewTabDialog.vue'
import SplitLayoutTree from './SplitLayoutTree.vue'
import ExternalAuthBanner from './ExternalAuthBanner.vue'

const splitStore = useSplitStore()
const tabStore = useTabStore()

const draggingPaneId = ref<string | null>(null)
const preview = ref<{ targetPaneId: string; position: SplitDropPosition } | null>(null)
const showAddDialog = ref(false)
const pendingAddTabPaneId = ref<string | null>(null)
const fullscreenPaneId = ref<string | null>(null)
const dismissedAuthUrls = ref<Record<string, string>>({})

const paneMap = computed<Record<string, SplitPane | undefined>>(() =>
  Object.fromEntries(splitStore.activePanes.map((pane) => [pane.id, pane]))
)

const paneTitles = computed<Record<string, string>>(() => {
  const titleByTabId = new Map(
    tabStore.tabs.map((tab) => [tab.id, tab.title || tab.url || '当前页面'])
  )

  return Object.fromEntries(
    splitStore.activePanes.map((pane) => [
      pane.id,
      pane.activeTabId ? (titleByTabId.get(pane.activeTabId) ?? '当前页面') : '空分屏'
    ])
  )
})

const shouldRenderSplitLayout = computed(() =>
  splitStore.isSplitActive && !tabStore.isInternalPage
)

function isGoogleAuthUrl(url?: string): boolean {
  if (!url) return false
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname === 'accounts.google.com' || hostname === 'accounts.google.cn'
  } catch {
    return false
  }
}

function shouldShowAuthBanner(tabId?: string | null): boolean {
  if (!tabId) return false
  const url = tabStore.tabs.find((tab) => tab.id === tabId)?.url
  return isGoogleAuthUrl(url) && dismissedAuthUrls.value[tabId] !== url
}

function dismissAuthBanner(tabId: string) {
  const url = tabStore.tabs.find((tab) => tab.id === tabId)?.url
  if (!url) return
  dismissedAuthUrls.value = { ...dismissedAuthUrls.value, [tabId]: url }
  nextTick(() => sendPaneBounds())
}

const activeAuthTabId = computed(() =>
  !splitStore.isSplitActive && shouldShowAuthBanner(tabStore.activeTabId) ? tabStore.activeTabId : null
)

const googleAuthTabIds = computed(() =>
  splitStore.activePanes
    .map((pane) => pane.activeTabId)
    .filter((tabId): tabId is string => !!tabId && shouldShowAuthBanner(tabId))
)

const displayNode = computed<SplitNode | null>(() => {
  if (fullscreenPaneId.value) {
    return { kind: 'pane', paneId: fullscreenPaneId.value }
  }

  return splitStore.activeLayout?.root ?? null
})

/** Send bounds for all panes */
function sendPaneBounds() {
  if (!shouldRenderSplitLayout.value) return

  const bounds: Array<{ tabId: string; rect: { x: number; y: number; width: number; height: number } }> = []

  for (const pane of splitStore.activePanes) {
    if (!pane.activeTabId) continue
    const el = document.getElementById(`webview-pane-content-${pane.id}`)
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

  window.api.split.updateMultiBounds(bounds)
}

useIpcEvent('tab:request-bounds', () => {
  nextTick(() => sendPaneBounds())
})

function handlePaneClick(paneId?: string | null) {
  if (!paneId) return
  splitStore.focusPane(paneId)
}

function handleRequestAddTab(paneId: string) {
  splitStore.focusPane(paneId)
  pendingAddTabPaneId.value = paneId
  showAddDialog.value = true
}

function handlePaneFullscreen(paneId: string) {
  splitStore.focusPane(paneId)
  fullscreenPaneId.value = fullscreenPaneId.value === paneId ? null : paneId
  nextTick(() => sendPaneBounds())
}

async function handlePaneCloseTab(paneId: string) {
  const tabId = paneMap.value[paneId]?.activeTabId
  if (!tabId) return

  await tabStore.closeTab(tabId)
}

function handlePaneRemove(paneId: string) {
  splitStore.removePane(paneId)
}

function handleAddDialogOpenChange(open: boolean) {
  showAddDialog.value = open
  if (!open) {
    pendingAddTabPaneId.value = null
  }
}

function handleAddAccount(page: Page) {
  tabStore.createTab(page.id, pendingAddTabPaneId.value)
}

function handleNavigateUrl(url: string) {
  tabStore.createTabForSite(url, undefined, pendingAddTabPaneId.value)
}

function handleBranchLayout(path: number[], sizes: number[]) {
  splitStore.updateBranchSizes(path, sizes)
  nextTick(() => sendPaneBounds())
}

function getDropPosition(event: DragEvent, target: HTMLElement): SplitDropPosition {
  const rect = target.getBoundingClientRect()
  const x = (event.clientX - rect.left) / Math.max(rect.width, 1)
  const y = (event.clientY - rect.top) / Math.max(rect.height, 1)

  if (x > 0.28 && x < 0.72 && y > 0.28 && y < 0.72) {
    return 'center'
  }

  const edgeDistances = {
    left: x,
    right: 1 - x,
    top: y,
    bottom: 1 - y
  }

  return Object.entries(edgeDistances).sort((a, b) => a[1] - b[1])[0][0] as Exclude<SplitDropPosition, 'center'>
}

function getPaneRect(paneId: string): DOMRect | null {
  return document.getElementById(`webview-pane-content-${paneId}`)?.getBoundingClientRect() ?? null
}

function syncDragOverlayVisibility(blocked: boolean) {
  setForcedWebviewBlocked(blocked)
  window.api.tab.setOverlayVisible(!blocked && !isWebviewBlocked.value)
}

function endDrag() {
  draggingPaneId.value = null
  preview.value = null
  syncDragOverlayVisibility(false)
  nextTick(() => sendPaneBounds())
}

function handleDragStart(event: DragEvent, paneId: string) {
  if (!splitStore.manualAdjustEnabled) return

  draggingPaneId.value = paneId
  preview.value = null

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', paneId)
  }

  syncDragOverlayVisibility(true)
}

function updatePreview(event: DragEvent, targetPaneId: string) {
  const sourcePaneId = draggingPaneId.value
  const target = event.currentTarget as HTMLElement | null
  if (!sourcePaneId || !target || sourcePaneId === targetPaneId) {
    preview.value = null
    return
  }

  preview.value = {
    targetPaneId,
    position: getDropPosition(event, target)
  }
}

function handleDragEnterPane(event: DragEvent, targetPaneId: string) {
  updatePreview(event, targetPaneId)
}

function handleDragOverPane(event: DragEvent, targetPaneId: string) {
  updatePreview(event, targetPaneId)
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function handleDropPane(event: DragEvent, targetPaneId: string) {
  const sourcePaneId = draggingPaneId.value
  const target = event.currentTarget as HTMLElement | null

  if (!sourcePaneId || !target) {
    endDrag()
    return
  }

  const position = getDropPosition(event, target)
  if (sourcePaneId !== targetPaneId) {
    const sourceRect = getPaneRect(sourcePaneId)
    const targetRect = getPaneRect(targetPaneId)
    const horizontalMove = position === 'left' || position === 'right'

    splitStore.movePane(sourcePaneId, targetPaneId, position, {
      sourceSize: horizontalMove ? sourceRect?.width : sourceRect?.height,
      targetSize: horizontalMove ? targetRect?.width : targetRect?.height
    })
  }

  endDrag()
}

watch(
  () => [
    splitStore.activePanes.map((pane) => `${pane.id}:${pane.activeTabId}`).join(','),
    splitStore.manualAdjustEnabled,
    splitStore.activePanes.map((pane) => {
      const tab = tabStore.tabs.find((item) => item.id === pane.activeTabId)
      return `${pane.activeTabId || ''}:${tab?.url || ''}:${dismissedAuthUrls.value[pane.activeTabId || ''] || ''}`
    }).join(',')
  ],
  () => {
    nextTick(() => sendPaneBounds())
  },
  { immediate: true, flush: 'post' }
)

watch(
  () => tabStore.activeTabId,
  () => {
    nextTick(() => sendPaneBounds())
  },
  { flush: 'post' }
)

watch(
  () => tabStore.isInternalPage,
  (isInternalPage) => {
    if (isInternalPage) {
      fullscreenPaneId.value = null
      endDrag()
      return
    }

    nextTick(() => sendPaneBounds())
  },
  { flush: 'post' }
)

watch(
  () => splitStore.manualAdjustEnabled,
  (enabled) => {
    if (!enabled) {
      fullscreenPaneId.value = null
      endDrag()
      return
    }

    nextTick(() => sendPaneBounds())
  },
  { flush: 'post' }
)

watch(
  () => splitStore.activePanes.map((pane) => pane.id).join(','),
  () => {
    if (fullscreenPaneId.value && !paneMap.value[fullscreenPaneId.value]) {
      fullscreenPaneId.value = null
    }
  }
)

watch(
  () => splitStore.isSplitActive,
  (active) => {
    if (!active) {
      fullscreenPaneId.value = null
    }
  }
)

onUnmounted(() => {
  setForcedWebviewBlocked(false)
  window.api.tab.setOverlayVisible(!isWebviewBlocked.value)
})
</script>

<template>
  <div
    v-if="!shouldRenderSplitLayout"
    class="absolute inset-0"
  >
    <ExternalAuthBanner
      v-if="activeAuthTabId"
      :tab-id="activeAuthTabId"
      class="absolute inset-x-0 top-0 z-20"
      @dismiss="dismissAuthBanner(activeAuthTabId)"
    />
    <div
      id="webview-container"
      class="absolute inset-x-0 bottom-0"
      :class="activeAuthTabId ? 'top-9' : 'top-0'"
    />
  </div>

  <div v-else class="absolute inset-0">
    <template v-if="displayNode">
      <div class="absolute inset-0">
        <SplitLayoutTree
          :node="displayNode"
          :pane-map="paneMap"
          :pane-titles="paneTitles"
          :focused-pane-id="splitStore.focusedPaneId"
          :manual-adjust-enabled="splitStore.manualAdjustEnabled"
          :fullscreen-pane-id="fullscreenPaneId"
          :dragging-pane-id="draggingPaneId"
          :preview="preview"
          :google-auth-tab-ids="googleAuthTabIds"
          @pane-click="handlePaneClick"
          @request-add-tab="handleRequestAddTab"
          @branch-layout="handleBranchLayout"
          @drag-start="handleDragStart"
          @drag-end="endDrag"
          @drag-enter-pane="handleDragEnterPane"
          @drag-over-pane="handleDragOverPane"
          @drop-pane="handleDropPane"
          @pane-fullscreen="handlePaneFullscreen"
          @pane-remove="handlePaneRemove"
          @pane-close-tab="handlePaneCloseTab"
          @dismiss-auth="dismissAuthBanner"
        />
      </div>
      <NewTabDialog
        :open="showAddDialog"
        @update:open="handleAddDialogOpenChange"
        @select="handleAddAccount"
        @navigate="handleNavigateUrl"
      />
    </template>
    <div
      v-else
      id="webview-container"
      class="absolute inset-0"
    />
  </div>
</template>
