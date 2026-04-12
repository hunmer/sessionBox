import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type {
  SplitDropPosition,
  SplitLayout,
  SplitLayoutType,
  SplitNode,
  SplitPane,
  SplitPresetType,
  SavedSplitScheme
} from '../types'
import {
  buildFallbackTree,
  buildPresetTree,
  cloneSplitNode,
  collectPaneIds,
  countSplitLeaves,
  detectLayoutType,
  movePaneInTree,
  normalizeSizes,
  removePaneFromTree,
  remapTreePaneIds,
  reorderPanesByTree,
  updateBranchSizesAtPath
} from '@/lib/split-layout'
import { useTabStore } from './tab'
import { useWorkspaceStore } from './workspace'

const api = window.api

/** Generate unique pane ID */
function generatePaneId(): string {
  return `pane-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const PRESET_PANE_COUNTS: Record<Exclude<SplitPresetType, '1'>, number> = {
  '2h': 2,
  '2v': 2,
  '3': 3,
  '4': 4
}

function getLayoutDirection(root: SplitNode): 'horizontal' | 'vertical' {
  return root.kind === 'branch' ? root.direction : 'horizontal'
}

function getLayoutSizes(root: SplitNode): number[] {
  return root.kind === 'branch' ? [...root.sizes] : [100]
}

function isPresetType(value: string): value is Exclude<SplitPresetType, '1'> {
  return value in PRESET_PANE_COUNTS
}

function isCompatibleRoot(root: SplitNode, panes: SplitPane[]): boolean {
  const paneIds = new Set(panes.map((pane) => pane.id))
  const layoutPaneIds = collectPaneIds(root)
  return layoutPaneIds.length === panes.length && layoutPaneIds.every((paneId) => paneIds.has(paneId))
}

function buildRuntimeRoot(
  presetType: string,
  panes: SplitPane[],
  root?: SplitNode
): SplitNode {
  if (root && isCompatibleRoot(root, panes)) {
    return cloneSplitNode(root)
  }

  if (isPresetType(presetType)) {
    return buildPresetTree(presetType, panes)
  }

  return buildFallbackTree(panes)
}

function buildSchemeRoot(
  presetType: string,
  panes: SplitPane[],
  root?: SplitNode
): SplitNode {
  if (root) {
    return remapTreePaneIds(cloneSplitNode(root), panes.map((pane) => pane.id))
  }

  if (isPresetType(presetType)) {
    return buildPresetTree(presetType, panes)
  }

  return buildFallbackTree(panes)
}

function resolvePaneCountForScheme(scheme: SavedSplitScheme): number {
  if (scheme.root) {
    return countSplitLeaves(scheme.root)
  }

  if (scheme.paneCount > 1) {
    return scheme.paneCount
  }

  if (isPresetType(scheme.presetType)) {
    return PRESET_PANE_COUNTS[scheme.presetType]
  }

  return 2
}

export const useSplitStore = defineStore('split', () => {
  const tabStore = useTabStore()
  const workspaceStore = useWorkspaceStore()

  // ====== State ======
  const activeLayout = ref<SplitLayout | null>(null)
  const focusedPaneId = ref<string | null>(null)
  const savedSchemes = ref<SavedSplitScheme[]>([])
  const layoutRevision = ref(0)
  const manualAdjustEnabled = ref(false)

  // ====== Computed ======
  const paneCount = computed(() => activeLayout.value?.panes.length ?? 1)
  const isSplitActive = computed(() => paneCount.value > 1)
  const activePanes = computed(() => activeLayout.value?.panes ?? [])

  /** Get the pane that currently has focus */
  const focusedPane = computed(() =>
    activeLayout.value?.panes.find((pane) => pane.id === focusedPaneId.value) ?? null
  )

  // ====== Actions ======

  function bumpLayoutRevision() {
    layoutRevision.value += 1
  }

  function createPanes(nextPaneCount: number): SplitPane[] {
    const workspaceTabs = tabStore.workspaceTabs
    const panes: SplitPane[] = []

    for (let index = 0; index < nextPaneCount; index += 1) {
      panes.push({
        id: generatePaneId(),
        activeTabId: workspaceTabs[index]?.id ?? null,
        order: index
      })
    }

    return panes
  }

  function getInitialPaneId(panes: SplitPane[], preferredPaneId?: string | null): string | null {
    if (preferredPaneId && panes.some((pane) => pane.id === preferredPaneId)) {
      return preferredPaneId
    }

    return panes.find((pane) => pane.activeTabId)?.id ?? panes[0]?.id ?? null
  }

  function resolveNewTabPaneId(preferredPaneId?: string | null): string | null {
    const panes = activeLayout.value?.panes ?? []
    if (panes.length === 0) return null

    if (preferredPaneId && panes.some((pane) => pane.id === preferredPaneId)) {
      return preferredPaneId
    }

    const focusedPane = panes.find((pane) => pane.id === focusedPaneId.value)
    if (focusedPane && !focusedPane.activeTabId) {
      return focusedPane.id
    }

    return panes.find((pane) => !pane.activeTabId)?.id ?? focusedPane?.id ?? panes[0]?.id ?? null
  }

  function getReplacementTabId(closedTabId: string, pane: SplitPane): string | null {
    if (!activeLayout.value) return null

    const occupiedTabIds = new Set(
      activeLayout.value.panes
        .filter((item) => item.id !== pane.id)
        .map((item) => item.activeTabId)
        .filter((tabId): tabId is string => !!tabId)
    )

    const availableTabs = tabStore.workspaceTabs.filter((tab) =>
      tab.id !== closedTabId
      && !occupiedTabIds.has(tab.id)
      && !tab.url?.startsWith('sessionbox://')
    )

    if (availableTabs.length === 0) return null

    return availableTabs[Math.min(pane.order, availableTabs.length - 1)]?.id ?? availableTabs[0]?.id ?? null
  }

  function applyLayout(
    presetType: SplitLayoutType,
    panes: SplitPane[],
    root: SplitNode,
    preferredPaneId?: string | null
  ) {
    const normalizedRoot = cloneSplitNode(root)
    const orderedPanes = reorderPanesByTree(panes, normalizedRoot)
    const detectedPresetType = detectLayoutType(normalizedRoot)
    const resolvedPresetType = presetType === 'custom' ? detectedPresetType : presetType

    activeLayout.value = {
      presetType: resolvedPresetType,
      panes: orderedPanes,
      direction: getLayoutDirection(normalizedRoot),
      sizes: getLayoutSizes(normalizedRoot),
      root: normalizedRoot
    }

    focusedPaneId.value = getInitialPaneId(orderedPanes, preferredPaneId)
    if (orderedPanes.length <= 1) {
      manualAdjustEnabled.value = false
    }

    bumpLayoutRevision()

    if (focusedPaneId.value) {
      focusPane(focusedPaneId.value)
    }

    void persistState()
  }

  /** Apply a preset split layout */
  function applyPreset(type: SplitPresetType) {
    if (type === '1') {
      resetToSingle()
      return
    }

    const panes = createPanes(PRESET_PANE_COUNTS[type])
    applyLayout(type, panes, buildPresetTree(type, panes))
  }

  /** Apply a saved scheme */
  function applyScheme(schemeId: string) {
    const scheme = savedSchemes.value.find((item) => item.id === schemeId)
    if (!scheme) return

    const panes = createPanes(resolvePaneCountForScheme(scheme))
    const root = buildSchemeRoot(scheme.presetType, panes, scheme.root)
    applyLayout(scheme.presetType, panes, root)
  }

  function setManualAdjustEnabled(enabled: boolean) {
    manualAdjustEnabled.value = enabled && isSplitActive.value
    if (activeLayout.value) {
      void persistState()
    }
  }

  /** Reset to single pane mode */
  function resetToSingle() {
    const currentTabId = focusedPane.value?.activeTabId ?? tabStore.activeTabId

    activeLayout.value = null
    focusedPaneId.value = null
    manualAdjustEnabled.value = false
    bumpLayoutRevision()

    if (currentTabId) {
      void tabStore.switchTab(currentTabId)
    }

    void persistState()
  }

  /** Set the active tab for a specific pane */
  function setPaneActiveTab(paneId: string, tabId: string | null) {
    if (!activeLayout.value) return
    const pane = activeLayout.value.panes.find((item) => item.id === paneId)
    if (pane) {
      pane.activeTabId = tabId
    }
  }

  /** Focus a specific pane */
  function focusPane(paneId: string) {
    const pane = activeLayout.value?.panes.find((item) => item.id === paneId)
    if (!pane) return

    focusedPaneId.value = paneId

    if (!pane.activeTabId) return

    tabStore.activeTabId = pane.activeTabId
    void api.tab.switch(pane.activeTabId)
  }

  /** Handle a tab click — route to the focused pane */
  function handleTabClick(tabId: string): boolean {
    if (!isSplitActive.value || !activeLayout.value) return false

    const targetPaneId = focusedPaneId.value ?? activeLayout.value.panes[0]?.id
    if (!targetPaneId) return false

    for (const pane of activeLayout.value.panes) {
      if (pane.activeTabId === tabId) {
        focusPane(pane.id)
        return true
      }
    }

    setPaneActiveTab(targetPaneId, tabId)
    focusPane(targetPaneId)
    return true
  }

  /** Handle tab close — clean up pane references */
  function handleTabClosed(tabId: string) {
    if (!activeLayout.value) return

    for (const pane of activeLayout.value.panes) {
      if (pane.activeTabId === tabId) {
        pane.activeTabId = getReplacementTabId(tabId, pane)
      }
    }
  }

  /** Handle new tab creation — prefer requested or empty pane before falling back */
  function handleTabCreated(tabId: string, preferredPaneId?: string | null) {
    if (!isSplitActive.value || !activeLayout.value) return
    const targetPaneId = resolveNewTabPaneId(preferredPaneId)
    if (targetPaneId) {
      setPaneActiveTab(targetPaneId, tabId)
      focusPane(targetPaneId)
    }
  }

  function removePane(paneId: string) {
    if (!activeLayout.value || activeLayout.value.panes.length <= 1) return

    const removedPane = activeLayout.value.panes.find((pane) => pane.id === paneId)
    if (!removedPane) return

    const nextPanes = activeLayout.value.panes.filter((pane) => pane.id !== paneId)
    if (nextPanes.length === 0) return

    if (nextPanes.length === 1) {
      const nextTabId = nextPanes[0]?.activeTabId ?? removedPane.activeTabId ?? tabStore.activeTabId

      activeLayout.value = null
      focusedPaneId.value = null
      manualAdjustEnabled.value = false
      bumpLayoutRevision()

      if (nextTabId) {
        void tabStore.switchTab(nextTabId)
      }

      void persistState()
      return
    }

    const nextRoot = removePaneFromTree(activeLayout.value.root, paneId)
    if (!nextRoot) return

    const preferredPaneId = focusedPaneId.value && focusedPaneId.value !== paneId
      ? focusedPaneId.value
      : nextPanes.find((pane) => pane.activeTabId)?.id ?? nextPanes[0]?.id ?? null

    applyLayout('custom', nextPanes, nextRoot, preferredPaneId)
  }

  function movePane(
    sourcePaneId: string,
    targetPaneId: string,
    position: SplitDropPosition,
    metrics?: { sourceSize?: number; targetSize?: number }
  ) {
    if (!activeLayout.value || sourcePaneId === targetPaneId && position !== 'center') return

    const nextRoot = movePaneInTree(
      activeLayout.value.root,
      sourcePaneId,
      targetPaneId,
      position,
      normalizeSizes([metrics?.sourceSize ?? 1, metrics?.targetSize ?? 1], 2)
    )

    applyLayout('custom', activeLayout.value.panes, nextRoot, focusedPaneId.value)
  }

  function updateBranchSizes(path: number[], sizes: number[]) {
    if (!activeLayout.value) return

    const nextRoot = updateBranchSizesAtPath(activeLayout.value.root, path, sizes)
    activeLayout.value = {
      ...activeLayout.value,
      root: nextRoot,
      direction: getLayoutDirection(nextRoot),
      sizes: getLayoutSizes(nextRoot),
      panes: reorderPanesByTree(activeLayout.value.panes, nextRoot)
    }
  }

  /** Save current layout as a custom scheme */
  async function saveScheme(name: string) {
    if (!activeLayout.value) return

    const scheme: SavedSplitScheme = {
      id: `scheme-${Date.now()}`,
      name,
      presetType: activeLayout.value.presetType,
      direction: activeLayout.value.direction,
      paneCount: countSplitLeaves(activeLayout.value.root),
      sizes: [...activeLayout.value.sizes],
      root: cloneSplitNode(activeLayout.value.root)
    }

    await api.split.createScheme(scheme)
    savedSchemes.value.push(scheme)
  }

  /** Delete a saved scheme */
  async function deleteScheme(id: string) {
    await api.split.deleteScheme(id)
    savedSchemes.value = savedSchemes.value.filter((scheme) => scheme.id !== id)
  }

  /** Load saved schemes from main process */
  async function loadSchemes() {
    savedSchemes.value = await api.split.listSchemes()
  }

  /** Persist current split state to main process */
  async function persistState() {
    const workspaceId = workspaceStore.activeWorkspaceId

    if (activeLayout.value) {
      await api.split.setState(workspaceId, {
        presetType: activeLayout.value.presetType,
        panes: activeLayout.value.panes.map((pane) => ({
          id: pane.id,
          activeTabId: pane.activeTabId,
          order: pane.order
        })),
        direction: activeLayout.value.direction,
        sizes: [...activeLayout.value.sizes],
        manualAdjustEnabled: manualAdjustEnabled.value,
        root: cloneSplitNode(activeLayout.value.root)
      })
    } else {
      await api.split.clearState(workspaceId)
    }
  }

  /** Restore split state for the current workspace */
  async function restoreState() {
    const data = await api.split.getState(workspaceStore.activeWorkspaceId)

    manualAdjustEnabled.value = false

    if (data) {
      const panes = data.panes.map((pane) => ({
        id: pane.id,
        activeTabId: pane.activeTabId,
        order: pane.order
      }))

      const root = buildRuntimeRoot(data.presetType, panes, data.root as SplitNode | undefined)
      const orderedPanes = reorderPanesByTree(panes, root)

      activeLayout.value = {
        presetType: detectLayoutType(root),
        panes: orderedPanes,
        direction: getLayoutDirection(root),
        sizes: getLayoutSizes(root),
        root
      }

      focusedPaneId.value = getInitialPaneId(orderedPanes)
      manualAdjustEnabled.value = !!data.manualAdjustEnabled && orderedPanes.length > 1
      bumpLayoutRevision()

      if (focusedPaneId.value) {
        focusPane(focusedPaneId.value)
      }
      return
    }

    activeLayout.value = null
    focusedPaneId.value = null
    bumpLayoutRevision()
  }

  watch(
    () => tabStore.activeTabId,
    (tabId) => {
      if (!isSplitActive.value || !tabId) return

      const pane = activeLayout.value?.panes.find((item) => item.activeTabId === tabId)
      if (pane && focusedPaneId.value !== pane.id) {
        focusedPaneId.value = pane.id
      }
    }
  )

  watch(
    isSplitActive,
    (active) => {
      if (!active) {
        manualAdjustEnabled.value = false
      }
    }
  )

  // ====== Workspace switch watcher ======
  watch(
    () => workspaceStore.activeWorkspaceId,
    async () => {
      if (activeLayout.value) {
        await persistState()
      }
      await restoreState()
    }
  )

  return {
    activeLayout,
    focusedPaneId,
    savedSchemes,
    layoutRevision,
    manualAdjustEnabled,
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
    removePane,
    movePane,
    updateBranchSizes,
    setManualAdjustEnabled,
    applyScheme,
    saveScheme,
    deleteScheme,
    loadSchemes,
    restoreState,
    persistState
  }
})
