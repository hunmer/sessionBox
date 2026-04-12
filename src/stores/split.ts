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
  const tabStore = useTabStore()
  const workspaceStore = useWorkspaceStore()

  // ====== State ======
  const activeLayout = ref<SplitLayout | null>(null)
  const focusedPaneId = ref<string | null>(null)
  const savedSchemes = ref<SavedSplitScheme[]>([])
  const layoutRevision = ref(0)

  // ====== Computed ======
  const paneCount = computed(() => activeLayout.value?.panes.length ?? 1)
  const isSplitActive = computed(() => paneCount.value > 1)

  const activePanes = computed(() => activeLayout.value?.panes ?? [])

  /** Get the pane that currently has focus */
  const focusedPane = computed(() =>
    activeLayout.value?.panes.find((p) => p.id === focusedPaneId.value) ?? null
  )

  // ====== Actions ======

  function bumpLayoutRevision() {
    layoutRevision.value += 1
  }

  function createPanes(paneCount: number): SplitPane[] {
    const workspaceTabs = tabStore.workspaceTabs
    const panes: SplitPane[] = []

    for (let i = 0; i < paneCount; i++) {
      panes.push({
        id: generatePaneId(),
        activeTabId: workspaceTabs[i]?.id ?? null,
        order: i
      })
    }

    return panes
  }

  function getInitialPaneId(panes: SplitPane[]): string | null {
    return panes.find((pane) => pane.activeTabId)?.id ?? panes[0]?.id ?? null
  }

  function applyLayout(
    presetType: SplitPresetType,
    panes: SplitPane[],
    direction: 'horizontal' | 'vertical',
    sizes: number[]
  ) {
    activeLayout.value = {
      presetType,
      panes,
      direction,
      sizes: [...sizes]
    }

    focusedPaneId.value = getInitialPaneId(activeLayout.value.panes)
    bumpLayoutRevision()

    if (focusedPaneId.value) {
      focusPane(focusedPaneId.value)
    }

    void persistState()
  }

  /** Apply a preset split layout */
  function applyPreset(type: SplitPresetType) {
    const preset = PRESETS[type]
    applyLayout(type, createPanes(preset.paneCount), preset.direction, preset.sizes)
  }

  /** Apply a saved scheme */
  function applyScheme(schemeId: string) {
    const scheme = savedSchemes.value.find((item) => item.id === schemeId)
    if (!scheme) return

    const preset = PRESETS[scheme.presetType]
    applyLayout(
      scheme.presetType,
      createPanes(preset.paneCount),
      scheme.direction,
      scheme.sizes
    )
  }

  /** Reset to single pane mode */
  function resetToSingle() {
    const currentTabId = focusedPane.value?.activeTabId ?? tabStore.activeTabId

    activeLayout.value = null
    focusedPaneId.value = null
    bumpLayoutRevision()

    if (currentTabId) {
      void tabStore.switchTab(currentTabId)
    }

    void persistState()
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
    const pane = activeLayout.value?.panes.find((p) => p.id === paneId)
    if (!pane) return

    focusedPaneId.value = paneId

    if (!pane.activeTabId) return

    tabStore.activeTabId = pane.activeTabId
    void api.tab.switch(pane.activeTabId)
  }

  /** Handle a tab click — route to the focused pane */
  function handleTabClick(tabId: string): boolean {
    if (!isSplitActive.value) return false

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

    for (const pane of activeLayout.value.panes) {
      if (pane.activeTabId === tabId) {
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
    const data = await api.split.getState(workspaceStore.activeWorkspaceId)
    if (data) {
      const panes = data.panes.map((p) => ({
        id: p.id,
        activeTabId: p.activeTabId,
        order: p.order
      }))

      activeLayout.value = {
        presetType: data.presetType as SplitPresetType | 'custom',
        panes,
        direction: data.direction,
        sizes: [...data.sizes]
      }
      focusedPaneId.value = getInitialPaneId(panes)
      bumpLayoutRevision()

      if (focusedPaneId.value) {
        focusPane(focusedPaneId.value)
      }
    } else {
      activeLayout.value = null
      focusedPaneId.value = null
      bumpLayoutRevision()
    }
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
    applyScheme,
    saveScheme,
    deleteScheme,
    loadSchemes,
    restoreState,
    persistState
  }
})
