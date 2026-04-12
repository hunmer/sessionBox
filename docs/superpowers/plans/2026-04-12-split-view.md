# Split View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add BrowserView split-screen functionality allowing multiple tabs to be displayed simultaneously in resizable panes.

**Architecture:** Renderer-driven — Vue components manage the ResizablePanelGroup layout, each pane has a div container whose bounds are sent to the main process via IPC. WebviewManager extends from single-active-view to multi-visible-views.

**Tech Stack:** Vue 3 + Pinia, reka-ui ResizablePanelGroup, Electron IPC, electron-store

**Design Spec:** `docs/superpowers/specs/2026-04-12-split-view-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/types/split.ts` | Split-pane type definitions |
| Create | `src/stores/split.ts` | SplitStore — pane layout state, tab assignment, scheme CRUD |
| Create | `src/components/tabs/SplitButton.vue` | Dropdown button in TabBar for split presets and saved schemes |
| Create | `src/components/tabs/SplitView.vue` | Dynamic ResizablePanelGroup rendering (single/multi pane) |
| Create | `electron/ipc/split.ts` | IPC handlers for split state persistence and scheme CRUD |
| Modify | `src/types/index.ts` | Re-export split types |
| Modify | `preload/index.ts` | Add `split` namespace API |
| Modify | `electron/services/store.ts` | Add split state and scheme CRUD functions |
| Modify | `electron/services/webview-manager.ts` | Add `updateMultiBounds` and `setViewVisible` methods |
| Modify | `electron/ipc/index.ts` | Register split IPC handlers |
| Modify | `src/App.vue` | Replace `#webview-container` with SplitView; refactor sendBounds |
| Modify | `src/components/tabs/TabBar.vue` | Add SplitButton component |
| Modify | `src/stores/tab.ts` | switchTab awareness of split panes |

---

### Task 1: Add Split Type Definitions

**Files:**
- Create: `src/types/split.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Create `src/types/split.ts`**

```typescript
/** Single split pane — maps to one visible WebContentsView */
export interface SplitPane {
  id: string
  activeTabId: string | null
  order: number
}

/** Preset split layout types */
export type SplitPresetType = '1' | '2h' | '2v' | '3' | '4'

/** Runtime split layout state (one per workspace) */
export interface SplitLayout {
  presetType: SplitPresetType | 'custom'
  panes: SplitPane[]
  direction: 'horizontal' | 'vertical'
  sizes: number[]
}

/** Persisted custom split scheme (saved by user) */
export interface SavedSplitScheme {
  id: string
  name: string
  presetType: SplitPresetType
  direction: 'horizontal' | 'vertical'
  paneCount: number
  sizes: number[]
}

/** Bounds payload for multi-view update */
export interface PaneBounds {
  tabId: string
  rect: { x: number; y: number; width: number; height: number }
}
```

- [ ] **Step 2: Add re-export in `src/types/index.ts`**

Append at end of file:

```typescript
export type { SplitPane, SplitPresetType, SplitLayout, SavedSplitScheme, PaneBounds } from './split'
```

- [ ] **Step 3: Commit**

```bash
git add src/types/split.ts src/types/index.ts
git commit -m "feat(split): add split pane type definitions"
```

---

### Task 2: Add Split Store Persistence (Main Process)

**Files:**
- Modify: `electron/services/store.ts`

- [ ] **Step 1: Add schema fields for split data**

In `electron/services/store.ts`, add to the `StoreSchema` interface (after `mutedSites`):

```typescript
  splitStates: Record<string, import('./store').SplitLayoutData>
  splitSchemes: import('./store').SavedSplitSchemeData[]
```

Add to `defaults`:

```typescript
  splitStates: {},
  splitSchemes: [],
```

- [ ] **Step 2: Add split data type definitions**

Add near the top of `store.ts` (after existing type imports):

```typescript
export interface SplitLayoutData {
  presetType: string
  panes: Array<{ id: string; activeTabId: string | null; order: number }>
  direction: 'horizontal' | 'vertical'
  sizes: number[]
}

export interface SavedSplitSchemeData {
  id: string
  name: string
  presetType: string
  direction: 'horizontal' | 'vertical'
  paneCount: number
  sizes: number[]
}
```

- [ ] **Step 3: Add CRUD functions for split state**

Append to `electron/services/store.ts`:

```typescript
// ====== Split View ======

export function getSplitState(workspaceId: string): SplitLayoutData | null {
  const states = store.get('splitStates', defaults.splitStates)
  return states[workspaceId] ?? null
}

export function setSplitState(workspaceId: string, data: SplitLayoutData): void {
  const states = store.get('splitStates', defaults.splitStates)
  states[workspaceId] = data
  store.set('splitStates', states)
}

export function clearSplitState(workspaceId: string): void {
  const states = store.get('splitStates', defaults.splitStates)
  delete states[workspaceId]
  store.set('splitStates', states)
}

export function listSplitSchemes(): SavedSplitSchemeData[] {
  return store.get('splitSchemes', defaults.splitSchemes)
}

export function createSplitScheme(data: SavedSplitSchemeData): SavedSplitSchemeData {
  const schemes = store.get('splitSchemes', defaults.splitSchemes)
  schemes.push(data)
  store.set('splitSchemes', schemes)
  return data
}

export function deleteSplitScheme(id: string): void {
  const schemes = store.get('splitSchemes', defaults.splitSchemes)
  store.set('splitSchemes', schemes.filter((s) => s.id !== id))
}
```

- [ ] **Step 4: Commit**

```bash
git add electron/services/store.ts
git commit -m "feat(split): add split state persistence to electron-store"
```

---

### Task 3: Add Split IPC Handlers (Main Process)

**Files:**
- Create: `electron/ipc/split.ts`
- Modify: `electron/ipc/index.ts`

- [ ] **Step 1: Create `electron/ipc/split.ts`**

```typescript
import { ipcMain } from 'electron'
import {
  getSplitState,
  setSplitState,
  clearSplitState,
  listSplitSchemes,
  createSplitScheme,
  deleteSplitScheme
} from '../services/store'
import type { SplitLayoutData, SavedSplitSchemeData } from '../services/store'
import { webviewManager } from '../services/webview-manager'

export function registerSplitIpcHandlers(): void {
  // Fire-and-forget: update multiple view bounds simultaneously
  ipcMain.on(
    'split:update-multi-bounds',
    (_e, paneBounds: Array<{ tabId: string; rect: { x: number; y: number; width: number; height: number } }>) => {
      webviewManager.updateMultiBounds(paneBounds)
    }
  )

  ipcMain.handle('split:get-state', (_e, workspaceId: string) => getSplitState(workspaceId))

  ipcMain.handle('split:set-state', (_e, workspaceId: string, data: SplitLayoutData) =>
    setSplitState(workspaceId, data)
  )

  ipcMain.handle('split:clear-state', (_e, workspaceId: string) => clearSplitState(workspaceId))

  ipcMain.handle('split:list-schemes', () => listSplitSchemes())

  ipcMain.handle('split:create-scheme', (_e, data: SavedSplitSchemeData) => createSplitScheme(data))

  ipcMain.handle('split:delete-scheme', (_e, id: string) => deleteSplitScheme(id))
}
```

- [ ] **Step 2: Register in `electron/ipc/index.ts`**

Add import at top:

```typescript
import { registerSplitIpcHandlers } from './split'
```

Add call inside `registerIpcHandlers()`, after `registerBookmarkCheckIpc()`:

```typescript
  // ====== 分屏 ======
  registerSplitIpcHandlers()
```

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/split.ts electron/ipc/index.ts
git commit -m "feat(split): add split IPC handlers"
```

---

### Task 4: Extend WebviewManager for Multi-View

**Files:**
- Modify: `electron/services/webview-manager.ts`

- [ ] **Step 1: Add `updateMultiBounds` method**

Add method to `WebviewManager` class (after the existing `updateBounds` method at line ~627):

```typescript
  /** Update bounds for multiple visible views simultaneously (split-screen mode) */
  updateMultiBounds(paneBounds: Array<{ tabId: string; rect: { x: number; y: number; width: number; height: number } }>): void {
    if (!this.mainWindow) return

    const visibleTabIds = new Set(paneBounds.map((p) => p.tabId))

    // Show and position all pane views
    for (const { tabId, rect } of paneBounds) {
      const entry = this.views.get(tabId)
      if (entry) {
        entry.view.setBounds(rect)
        entry.view.setVisible(true)
        entry.lastActiveAt = Date.now()
      }
    }

    // Hide views not in any pane
    for (const [id, entry] of this.views) {
      if (!visibleTabIds.has(id)) {
        entry.view.setVisible(false)
        entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      }
    }
  }

  /** Set visibility of a specific view by tabId */
  setViewVisible(tabId: string, visible: boolean): void {
    const entry = this.views.get(tabId)
    if (entry) {
      entry.view.setVisible(visible)
    }
  }
```

- [ ] **Step 2: Modify `switchView` to support split mode**

The existing `switchView` at line ~572 hides the previous active view and shows the new one. In split mode, multiple views are visible simultaneously. We need to avoid hiding other pane views when switching a single pane's tab.

Replace the `switchView` method with:

```typescript
  switchView(tabId: string): void {
    if (!this.mainWindow) return

    // If target tab is frozen, thaw it first
    if (this.frozenTabUrls.has(tabId)) {
      const frozen = this.frozenTabUrls.get(tabId)!
      this.frozenTabUrls.delete(tabId)
      this.createView(tabId, frozen.pageId, frozen.url)
      this.mainWindow.webContents.send('on:tab:frozen', tabId, false)
    }

    // If target tab hasn't been created yet (lazy load), create it
    if (!this.views.has(tabId) && this.pendingViews.has(tabId)) {
      const pending = this.pendingViews.get(tabId)!
      this.pendingViews.delete(tabId)
      this.createView(tabId, pending.pageId, pending.url)
    }

    const target = this.views.get(tabId)
    if (!target) {
      this.activeTabId = null
      return
    }

    target.lastActiveAt = Date.now()
    this.activeTabId = tabId

    const extensions = getExtensionsForContainer(target.containerId || null)
    extensions.selectTab(target.view.webContents)

    this.mainWindow.webContents.send('on:tab:activated', tabId)
    this.mainWindow.webContents.send('on:tab:request-bounds')
    void this.refreshProxyInfo(tabId)
  }
```

Key changes: removed the hide-previous-view logic (that is now handled by `updateMultiBounds`), removed the `setVisible(true)` + `setBounds` calls (also delegated to bounds update).

- [ ] **Step 3: Commit**

```bash
git add electron/services/webview-manager.ts
git commit -m "feat(split): extend WebviewManager with multi-view bounds support"
```

---

### Task 5: Add Split Preload API

**Files:**
- Modify: `preload/index.ts`

- [ ] **Step 1: Add split types**

After the `ShortcutItem` interface (around line 108), add:

```typescript
export interface SplitPaneData {
  id: string
  activeTabId: string | null
  order: number
}

export interface SplitLayoutData {
  presetType: string
  panes: SplitPaneData[]
  direction: 'horizontal' | 'vertical'
  sizes: number[]
}

export interface SavedSplitSchemeData {
  id: string
  name: string
  presetType: string
  direction: 'horizontal' | 'vertical'
  paneCount: number
  sizes: number[]
}
```

- [ ] **Step 2: Add split namespace to api object**

Add after the `shortcut` namespace and before `download`:

```typescript
  split: {
    updateMultiBounds: (paneBounds: Array<{ tabId: string; rect: { x: number; y: number; width: number; height: number } }>): void =>
      ipcRenderer.send('split:update-multi-bounds', paneBounds),
    getState: (workspaceId: string): Promise<SplitLayoutData | null> =>
      ipcRenderer.invoke('split:get-state', workspaceId),
    setState: (workspaceId: string, data: SplitLayoutData): Promise<void> =>
      ipcRenderer.invoke('split:set-state', workspaceId, data),
    clearState: (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke('split:clear-state', workspaceId),
    listSchemes: (): Promise<SavedSplitSchemeData[]> =>
      ipcRenderer.invoke('split:list-schemes'),
    createScheme: (data: SavedSplitSchemeData): Promise<SavedSplitSchemeData> =>
      ipcRenderer.invoke('split:create-scheme', data),
    deleteScheme: (id: string): Promise<void> =>
      ipcRenderer.invoke('split:delete-scheme', id)
  },
```

- [ ] **Step 3: Commit**

```bash
git add preload/index.ts
git commit -m "feat(split): add split namespace to preload IPC API"
```

---

### Task 6: Create SplitStore

**Files:**
- Create: `src/stores/split.ts`

- [ ] **Step 1: Create the SplitStore**

```typescript
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { SplitPane, SplitPresetType, SplitLayout, SavedSplitScheme } from '../types'
import { useTabStore } from './tab'
import { useWorkspaceStore } from './workspace'

const api = window.api

/** Generate unique pane ID */
function generatePaneId(): string {
  return `pane-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** Preset configurations */
const PRESETS: Record<SplitPresetType, { paneCount: number; direction: 'horizontal' | 'vertical'; sizes: number[] }> = {
  '1': { paneCount: 1, direction: 'horizontal', sizes: [100] },
  '2h': { paneCount: 2, direction: 'horizontal', sizes: [50, 50] },
  '2v': { paneCount: 2, direction: 'vertical', sizes: [50, 50] },
  '3': { paneCount: 3, direction: 'horizontal', sizes: [50, 50, 50] },
  '4': { paneCount: 4, direction: 'horizontal', sizes: [50, 50, 50, 50] }
}

export const useSplitStore = defineStore('split', () => {
  // ====== State ======
  const activeLayout = ref<SplitLayout | null>(null)
  const focusedPaneId = ref<string | null>(null)
  const savedSchemes = ref<SavedSplitScheme[]>([])

  // ====== Computed ======
  const paneCount = computed(() => activeLayout.value?.panes.length ?? 1)
  const isSplitActive = computed(() => paneCount.value > 1)

  const activePanes = computed(() => activeLayout.value?.panes ?? [])

  /** Get the pane that currently has focus */
  const focusedPane = computed(() =>
    activeLayout.value?.panes.find((p) => p.id === focusedPaneId.value) ?? null
  )

  // ====== Actions ======

  /** Apply a preset split layout */
  function applyPreset(type: SplitPresetType) {
    const preset = PRESETS[type]
    const tabStore = useTabStore()
    const workspaceTabs = tabStore.workspaceTabs

    // Create panes
    const panes: SplitPane[] = []
    for (let i = 0; i < preset.paneCount; i++) {
      panes.push({
        id: generatePaneId(),
        activeTabId: workspaceTabs[i]?.id ?? null,
        order: i
      })
    }

    // If switching from single to multi, ensure tabs are loaded into views
    activeLayout.value = {
      presetType: type,
      panes,
      direction: preset.direction,
      sizes: [...preset.sizes]
    }

    focusedPaneId.value = panes[0]?.id ?? null

    // Notify tab store to activate the first pane's tab
    if (panes[0]?.activeTabId) {
      tabStore.switchTab(panes[0].activeTabId)
    }

    // Save state
    persistState()
  }

  /** Reset to single pane mode */
  function resetToSingle() {
    const tabStore = useTabStore()
    // Keep the focused pane's tab active
    const currentTabId = focusedPane.value?.activeTabId ?? tabStore.activeTabId

    activeLayout.value = null
    focusedPaneId.value = null

    if (currentTabId) {
      tabStore.switchTab(currentTabId)
    }

    persistState()
  }

  /** Set the active tab for a specific pane */
  function setPaneActiveTab(paneId: string, tabId: string | null) {
    if (!activeLayout.value) return
    const pane = activeLayout.value.panes.find((p) => p.id === paneId)
    if (pane) {
      pane.activeTabId = tabId
    }
  }

  /** Focus a specific pane */
  function focusPane(paneId: string) {
    focusedPaneId.value = paneId
    // Also set the global activeTabId to this pane's active tab
    const pane = activeLayout.value?.panes.find((p) => p.id === paneId)
    if (pane?.activeTabId) {
      const tabStore = useTabStore()
      // Only update activeTabId locally, don't re-trigger full switch
      tabStore.activeTabId = pane.activeTabId
      void api.tab.switch(pane.activeTabId)
    }
  }

  /** Handle a tab click — route to the focused pane */
  function handleTabClick(tabId: string) {
    if (!isSplitActive.value) return false // Not handled by split

    const targetPaneId = focusedPaneId.value ?? activeLayout.value?.panes[0]?.id
    if (!targetPaneId) return false

    // If the tab is already active in another pane, just focus that pane
    for (const pane of activeLayout.value!.panes) {
      if (pane.activeTabId === tabId) {
        focusPane(pane.id)
        return true
      }
    }

    // Otherwise assign to focused pane
    setPaneActiveTab(targetPaneId, tabId)
    focusPane(targetPaneId)
    return true
  }

  /** Handle tab close — clean up pane references */
  function handleTabClosed(tabId: string) {
    if (!activeLayout.value) return

    const tabStore = useTabStore()
    for (const pane of activeLayout.value.panes) {
      if (pane.activeTabId === tabId) {
        // Find next available tab in workspace for this pane
        const remaining = tabStore.workspaceTabs.filter((t) => t.id !== tabId)
        pane.activeTabId = remaining[pane.order]?.id ?? remaining[0]?.id ?? null
      }
    }
  }

  /** Handle new tab creation — assign to focused pane */
  function handleTabCreated(tabId: string) {
    if (!isSplitActive.value) return
    const targetPaneId = focusedPaneId.value ?? activeLayout.value?.panes[0]?.id
    if (targetPaneId) {
      setPaneActiveTab(targetPaneId, tabId)
    }
  }

  /** Save current layout as a custom scheme */
  async function saveScheme(name: string) {
    if (!activeLayout.value) return
    const scheme: SavedSplitScheme = {
      id: `scheme-${Date.now()}`,
      name,
      presetType: activeLayout.value.presetType as SplitPresetType,
      direction: activeLayout.value.direction,
      paneCount: activeLayout.value.panes.length,
      sizes: [...activeLayout.value.sizes]
    }
    await api.split.createScheme(scheme)
    savedSchemes.value.push(scheme)
  }

  /** Delete a saved scheme */
  async function deleteScheme(id: string) {
    await api.split.deleteScheme(id)
    savedSchemes.value = savedSchemes.value.filter((s) => s.id !== id)
  }

  /** Load saved schemes from main process */
  async function loadSchemes() {
    savedSchemes.value = await api.split.listSchemes()
  }

  /** Persist current split state to main process */
  async function persistState() {
    const workspaceStore = useWorkspaceStore()
    const workspaceId = workspaceStore.activeWorkspaceId

    if (activeLayout.value) {
      await api.split.setState(workspaceId, {
        presetType: activeLayout.value.presetType,
        panes: activeLayout.value.panes.map((p) => ({
          id: p.id,
          activeTabId: p.activeTabId,
          order: p.order
        })),
        direction: activeLayout.value.direction,
        sizes: [...activeLayout.value.sizes]
      })
    } else {
      await api.split.clearState(workspaceId)
    }
  }

  /** Restore split state for the current workspace */
  async function restoreState() {
    const workspaceStore = useWorkspaceStore()
    const data = await api.split.getState(workspaceStore.activeWorkspaceId)
    if (data) {
      activeLayout.value = {
        presetType: data.presetType as SplitPresetType | 'custom',
        panes: data.panes.map((p) => ({
          id: p.id,
          activeTabId: p.activeTabId,
          order: p.order
        })),
        direction: data.direction,
        sizes: [...data.sizes]
      }
      focusedPaneId.value = data.panes[0]?.id ?? null
    } else {
      activeLayout.value = null
      focusedPaneId.value = null
    }
  }

  // ====== Workspace switch watcher ======
  watch(
    () => {
      const workspaceStore = useWorkspaceStore()
      return workspaceStore.activeWorkspaceId
    },
    async () => {
      // Save current state first
      if (activeLayout.value) {
        await persistState()
      }
      // Restore new workspace's state
      await restoreState()
    }
  )

  return {
    activeLayout,
    focusedPaneId,
    savedSchemes,
    paneCount,
    isSplitActive,
    activePanes,
    focusedPane,
    applyPreset,
    resetToSingle,
    setPaneActiveTab,
    focusPane,
    handleTabClick,
    handleTabClosed,
    handleTabCreated,
    saveScheme,
    deleteScheme,
    loadSchemes,
    restoreState,
    persistState
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/split.ts
git commit -m "feat(split): create SplitStore with pane management"
```

---

### Task 7: Create SplitView Component

**Files:**
- Create: `src/components/tabs/SplitView.vue`

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { useSplitStore } from '@/stores/split'
import { useTabStore } from '@/stores/tab'

const splitStore = useSplitStore()
const tabStore = useTabStore()

const isInternalPage = computed(() => tabStore.isInternalPage)

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

function handlePaneClick(paneId: string) {
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
  }
)

// Watch for active tab overlay state changes
watch(
  () => tabStore.activeTabId,
  () => {
    nextTick(() => sendPaneBounds())
  }
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tabs/SplitView.vue
git commit -m "feat(split): create SplitView component with resizable pane layouts"
```

---

### Task 8: Create SplitButton Component

**Files:**
- Create: `src/components/tabs/SplitButton.vue`

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import {
  Columns2,
  Square,
  Rows2,
  LayoutGrid,
  Save,
  Trash2
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useSplitStore } from '@/stores/split'
import type { SplitPresetType } from '@/types'

const splitStore = useSplitStore()
const showSaveInput = ref(false)
const schemeName = ref('')

const presets: Array<{ type: SplitPresetType; label: string; icon: any }> = [
  { type: '1', label: '一个', icon: Square },
  { type: '2h', label: '两个水平', icon: Columns2 },
  { type: '2v', label: '两个垂直', icon: Rows2 },
  { type: '3', label: '三个', icon: LayoutGrid },
  { type: '4', label: '四个', icon: LayoutGrid }
]

function handlePresetClick(type: SplitPresetType) {
  if (type === '1') {
    splitStore.resetToSingle()
  } else {
    splitStore.applyPreset(type)
  }
}

function handleSave() {
  const name = schemeName.value.trim()
  if (!name) return
  splitStore.saveScheme(name)
  schemeName.value = ''
  showSaveInput.value = false
}

function handleDeleteScheme(id: string) {
  splitStore.deleteScheme(id)
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-sm" class="h-7 w-7 rounded-full" title="分屏">
        <Columns2 class="w-3.5 h-3.5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-48">
      <!-- Preset options -->
      <DropdownMenuItem
        v-for="preset in presets"
        :key="preset.type"
        class="cursor-pointer"
        @click="handlePresetClick(preset.type)"
      >
        <component :is="preset.icon" class="size-4 mr-2" />
        <span class="flex-1">{{ preset.label }}</span>
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <!-- Save current layout -->
      <DropdownMenuItem class="cursor-pointer" @click="showSaveInput = true">
        <Save class="size-4 mr-2" />
        <span class="flex-1">保存当前方案</span>
      </DropdownMenuItem>

      <!-- Inline save input -->
      <div v-if="showSaveInput" class="flex items-center gap-1 px-2 py-1">
        <Input
          v-model="schemeName"
          placeholder="方案名称"
          class="h-7 text-xs"
          @keydown.enter="handleSave"
          @keydown.escape="showSaveInput = false"
        />
        <Button size="sm" variant="ghost" class="h-7 px-2" @click="handleSave">
          <Save class="size-3" />
        </Button>
      </div>

      <!-- Saved schemes -->
      <template v-if="splitStore.savedSchemes.length > 0">
        <DropdownMenuSeparator />
        <DropdownMenuItem
          v-for="scheme in splitStore.savedSchemes"
          :key="scheme.id"
          class="cursor-pointer"
          @click="splitStore.applyPreset(scheme.presetType as SplitPresetType)"
        >
          <LayoutGrid class="size-4 mr-2" />
          <span class="flex-1">{{ scheme.name }}</span>
          <Trash2
            class="size-3 text-muted-foreground hover:text-destructive"
            @click.stop="handleDeleteScheme(scheme.id)"
          />
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tabs/SplitButton.vue
git commit -m "feat(split): create SplitButton dropdown component"
```

---

### Task 9: Integrate SplitButton into TabBar

**Files:**
- Modify: `src/components/tabs/TabBar.vue`

- [ ] **Step 1: Add SplitButton import and usage**

In `src/components/tabs/TabBar.vue`, add import in `<script setup>`:

After line 6 (`import TabLayoutMenu from './TabLayoutMenu.vue'`), add:

```typescript
import SplitButton from './SplitButton.vue'
```

In the template, after the `<NewTabDialog>` block (around line 170) and before `<!-- 更多选项 -->`, add:

```html
      <!-- 分屏按钮 -->
      <SplitButton />
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tabs/TabBar.vue
git commit -m "feat(split): add SplitButton to TabBar"
```

---

### Task 10: Integrate SplitView into App.vue

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: Add imports**

Add to imports at top of `<script setup>`:

```typescript
import SplitView from '@/components/tabs/SplitView.vue'
import { useSplitStore } from '@/stores/split'
```

Add store initialization:

```typescript
const splitStore = useSplitStore()
```

- [ ] **Step 2: Replace the webview-container div with SplitView**

Find this block in the template (around line 434):

```html
                <!-- 主进程在此区域叠加 WebContentsView -->
                <div id="webview-container" class="absolute inset-x-0 top-0 bottom-7" />
```

Replace with:

```html
                <!-- 主进程在此区域叠加 WebContentsView -->
                <SplitView class="absolute inset-x-0 top-0 bottom-7" />
```

- [ ] **Step 3: Refactor sendBounds to support split mode**

Replace the existing `sendBounds` function with:

```typescript
/** 向主进程同步 webview 容器的位置和大小 */
function sendBounds() {
  if (splitStore.isSplitActive) {
    // Multi-pane mode: bounds are handled by SplitView component
    return
  }
  const container = document.getElementById('webview-container')
  if (!container || !tabStore.activeTabId) return
  const rect = container.getBoundingClientRect()
  window.api.tab.updateBounds({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  })
}
```

- [ ] **Step 4: Initialize split store in onMounted**

In the `onMounted` callback, add `splitStore.loadSchemes()` and `splitStore.restoreState()` to the parallel initialization:

```typescript
  await Promise.all([
    workspaceStore.init(),
    containerStore.init(),
    pageStore.loadPages(),
    tabStore.init(),
    proxyStore.init(),
    bookmarkStore.init(),
    splitStore.loadSchemes(),
    splitStore.restoreState()
  ])
```

- [ ] **Step 5: Commit**

```bash
git add src/App.vue
git commit -m "feat(split): integrate SplitView into App.vue layout"
```

---

### Task 11: Modify Tab Store for Split Awareness

**Files:**
- Modify: `src/stores/tab.ts`

- [ ] **Step 1: Modify switchTab to be split-aware**

Replace the `switchTab` function with:

```typescript
  async function switchTab(tabId: string) {
    // Let split store handle tab routing if split is active
    const { useSplitStore } = await import('./split')
    const splitStore = useSplitStore()

    if (splitStore.isSplitActive) {
      // In split mode, the click routes to the focused pane
      splitStore.handleTabClick(tabId)
      return
    }

    activeTabId.value = tabId
    await api.tab.switch(tabId)
  }
```

- [ ] **Step 2: Modify closeTab to notify split store**

In the `closeTab` function, after removing the tab from the array (`tabs.value = tabs.value.filter(...)`), add split notification:

After `proxyInfos.value.delete(tabId)` add:

```typescript
    // Notify split store
    const { useSplitStore } = await import('./split')
    const splitStore = useSplitStore()
    splitStore.handleTabClosed(tabId)
```

Note: Since closeTab is already async, the dynamic import is fine. But to avoid circular dependency issues, use dynamic import.

- [ ] **Step 3: Modify createTab to notify split store**

In the `createTab` function, after `await switchTab(tab.id)`, add:

```typescript
    // Notify split store of new tab
    const { useSplitStore } = await import('./split')
    const splitStore = useSplitStore()
    splitStore.handleTabCreated(tab.id)
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/tab.ts
git commit -m "feat(split): make TabStore aware of split pane state"
```

---

### Task 12: Save Split State on App Close

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: Add split state save to handleBeforeUnload**

Modify the `handleBeforeUnload` function:

```typescript
function handleBeforeUnload() {
  void tabStore.saveState()
  void splitStore.persistState()
}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.vue
git commit -m "feat(split): persist split state on app close"
```

---

### Task 13: Build Verification and Final Integration Test

**Files:**
- All modified files

- [ ] **Step 1: Run TypeScript type check**

```bash
cd /Users/Zhuanz/Documents/sessionBox && npx tsc --noEmit 2>&1 | head -50
```

Expected: No type errors, or only pre-existing errors not related to split changes.

- [ ] **Step 2: Run dev build to verify compilation**

```bash
cd /Users/Zhuanz/Documents/sessionBox && pnpm build 2>&1 | tail -20
```

Expected: Successful build with no errors.

- [ ] **Step 3: Start dev mode and verify**

```bash
cd /Users/Zhuanz/Documents/sessionBox && pnpm dev
```

Manual verification checklist:
- [ ] App starts without errors
- [ ] TabBar shows the split button (Columns2 icon)
- [ ] Clicking split button opens dropdown with preset options
- [ ] Clicking "两个水平" creates 2 horizontal panes
- [ ] Clicking "两个垂直" creates 2 vertical panes
- [ ] Clicking "三个" creates left-one-right-two layout
- [ ] Clicking "四个" creates 2x2 grid layout
- [ ] Clicking "一个" returns to single pane mode
- [ ] Resizable handles work between panes
- [ ] Clicking a tab in tab bar routes it to the focused pane
- [ ] Clicking a pane area focuses that pane
- [ ] Workspace switching saves/restores split state
- [ ] "保存当前方案" creates a saved scheme
- [ ] Saved schemes appear in dropdown and can be applied
- [ ] Saved schemes can be deleted

- [ ] **Step 4: Final commit with any fixes**

```bash
git add -A
git commit -m "feat(split): complete split view integration"
```
