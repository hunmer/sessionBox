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

// ====== 常量与纯工具函数 ======

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

/** 在给定 pane 列表中查找初始焦点 pane ID */
function findInitialPaneId(panes: SplitPane[], preferredPaneId?: string | null): string | null {
  if (preferredPaneId && panes.some((pane) => pane.id === preferredPaneId)) {
    return preferredPaneId
  }
  return panes.find((pane) => pane.activeTabId)?.id ?? panes[0]?.id ?? null
}

/** 为新标签页解析目标 pane ID */
function resolveNewTabPaneTarget(
  panes: SplitPane[],
  focusedPaneId: string | null,
  preferredPaneId?: string | null
): string | null {
  if (panes.length === 0) return null

  if (preferredPaneId && panes.some((pane) => pane.id === preferredPaneId)) {
    return preferredPaneId
  }

  const focusedPane = panes.find((pane) => pane.id === focusedPaneId)
  if (focusedPane && !focusedPane.activeTabId) {
    return focusedPane.id
  }

  return panes.find((pane) => !pane.activeTabId)?.id ?? focusedPane?.id ?? panes[0]?.id ?? null
}

/** 查找关闭标签页后 pane 的替代标签页 */
function findReplacementTabId(
  panes: SplitPane[],
  pane: SplitPane,
  closedTabId: string,
  workspaceTabs: { id: string; url?: string }[]
): string | null {
  const occupiedTabIds = new Set(
    panes
      .filter((item) => item.id !== pane.id)
      .map((item) => item.activeTabId)
      .filter((tabId): tabId is string => !!tabId)
  )

  const availableTabs = workspaceTabs.filter((tab) =>
    tab.id !== closedTabId
    && !occupiedTabIds.has(tab.id)
    && !tab.url?.startsWith('sessionbox://')
  )

  if (availableTabs.length === 0) return null

  return availableTabs[Math.min(pane.order, availableTabs.length - 1)]?.id ?? availableTabs[0]?.id ?? null
}

/** 构建完整的 SplitLayout 对象 */
function buildSplitLayout(presetType: SplitLayoutType, panes: SplitPane[], root: SplitNode): SplitLayout {
  const normalizedRoot = cloneSplitNode(root)
  const orderedPanes = reorderPanesByTree(panes, normalizedRoot)
  const detectedPresetType = detectLayoutType(normalizedRoot)
  const resolvedPresetType = presetType === 'custom' ? detectedPresetType : presetType

  return {
    presetType: resolvedPresetType,
    panes: orderedPanes,
    direction: getLayoutDirection(normalizedRoot),
    sizes: getLayoutSizes(normalizedRoot),
    root: normalizedRoot
  }
}

/** 将 layout 序列化为 IPC 持久化数据 */
function serializeLayoutForPersist(layout: SplitLayout, manualAdjust: boolean) {
  return {
    presetType: layout.presetType,
    panes: layout.panes.map((pane) => ({
      id: pane.id,
      activeTabId: pane.activeTabId,
      order: pane.order
    })),
    direction: layout.direction,
    sizes: [...layout.sizes],
    manualAdjustEnabled: manualAdjust,
    root: cloneSplitNode(layout.root)
  }
}

/** 从持久化数据构建 restored layout */
function buildRestoredLayout(data: {
  presetType: string
  panes: { id: string; activeTabId: string | null; order: number }[]
  root?: SplitNode
  manualAdjustEnabled?: boolean
}): { layout: SplitLayout; manualAdjust: boolean } {
  const panes = data.panes.map((pane) => ({
    id: pane.id,
    activeTabId: pane.activeTabId,
    order: pane.order
  }))
  const root = buildRuntimeRoot(data.presetType, panes, data.root as SplitNode | undefined)
  const orderedPanes = reorderPanesByTree(panes, root)

  return {
    layout: {
      presetType: detectLayoutType(root),
      panes: orderedPanes,
      direction: getLayoutDirection(root),
      sizes: getLayoutSizes(root),
      root
    },
    manualAdjust: !!data.manualAdjustEnabled && orderedPanes.length > 1
  }
}

/** 构建 SavedSplitScheme 对象 */
function buildSchemeFromLayout(layout: SplitLayout): SavedSplitScheme {
  return {
    id: `scheme-${Date.now()}`,
    name: '',
    presetType: layout.presetType,
    direction: layout.direction,
    paneCount: countSplitLeaves(layout.root),
    sizes: [...layout.sizes],
    root: cloneSplitNode(layout.root)
  }
}

/** 构建 updateBranchSizes 后的新 layout */
function buildUpdatedBranchLayout(layout: SplitLayout, path: number[], sizes: number[]): SplitLayout {
  const nextRoot = updateBranchSizesAtPath(layout.root, path, sizes)
  return {
    ...layout,
    root: nextRoot,
    direction: getLayoutDirection(nextRoot),
    sizes: getLayoutSizes(nextRoot),
    panes: reorderPanesByTree(layout.panes, nextRoot)
  }
}

/** 为给定数量的 pane 创建初始 pane 对象列表 */
function createPaneList(paneCount: number, workspaceTabs: { id: string }[]): SplitPane[] {
  const panes: SplitPane[] = []
  for (let index = 0; index < paneCount; index += 1) {
    panes.push({
      id: generatePaneId(),
      activeTabId: workspaceTabs[index]?.id ?? null,
      order: index
    })
  }
  return panes
}

/** 计算 removePane 后的下一步偏好 pane ID */
function resolvePreferredPaneAfterRemove(
  focusedPaneId: string | null,
  removedPaneId: string,
  remainingPanes: SplitPane[]
): string | null {
  if (focusedPaneId && focusedPaneId !== removedPaneId) return focusedPaneId
  return remainingPanes.find((pane) => pane.activeTabId)?.id ?? remainingPanes[0]?.id ?? null
}

/** 计算 removePane 还原到单 pane 时的 tab ID */
function resolveSinglePaneTabId(
  remainingPane: SplitPane | undefined,
  removedPane: SplitPane,
  activeTabId: string | undefined
): string | undefined {
  return remainingPane?.activeTabId ?? removedPane.activeTabId ?? activeTabId
}

/** 处理 tab 点击的路由逻辑：查找 tab 已在哪个 pane 或分配到目标 pane */
function routeTabClick(
  panes: SplitPane[],
  focusedPaneId: string | null,
  tabId: string
): { action: 'focus'; paneId: string } | { action: 'assign'; paneId: string } | null {
  const targetPaneId = focusedPaneId ?? panes[0]?.id
  if (!targetPaneId) return null

  for (const pane of panes) {
    if (pane.activeTabId === tabId) {
      return { action: 'focus', paneId: pane.id }
    }
  }
  return { action: 'assign', paneId: targetPaneId }
}

// ====== Store ======

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
  const focusedPane = computed(() =>
    activeLayout.value?.panes.find((pane) => pane.id === focusedPaneId.value) ?? null
  )

  // ====== Actions ======
  function bumpLayoutRevision() { layoutRevision.value += 1 }

  function createPanes(nextPaneCount: number): SplitPane[] {
    return createPaneList(nextPaneCount, tabStore.workspaceTabs)
  }

  function focusPane(paneId: string) {
    const pane = activeLayout.value?.panes.find((item) => item.id === paneId)
    if (!pane) return
    focusedPaneId.value = paneId
    if (pane.activeTabId) {
      tabStore.activeTabId = pane.activeTabId
      void api.tab.switch(pane.activeTabId)
    }
  }

  function clearLayout(nextTabId?: string | null) {
    activeLayout.value = null
    focusedPaneId.value = null
    manualAdjustEnabled.value = false
    bumpLayoutRevision()
    if (nextTabId) void tabStore.switchTab(nextTabId)
    void persistState()
  }

  function assignLayout(layout: SplitLayout, preferredPaneId?: string | null) {
    activeLayout.value = layout
    focusedPaneId.value = findInitialPaneId(layout.panes, preferredPaneId)
    if (layout.panes.length <= 1) manualAdjustEnabled.value = false
    bumpLayoutRevision()
    if (focusedPaneId.value) focusPane(focusedPaneId.value)
    void persistState()
  }

  function applyLayout(presetType: SplitLayoutType, panes: SplitPane[], root: SplitNode, preferredPaneId?: string | null) {
    assignLayout(buildSplitLayout(presetType, panes, root), preferredPaneId)
  }

  function applyPreset(type: SplitPresetType) {
    if (type === '1') { clearLayout(focusedPane.value?.activeTabId ?? tabStore.activeTabId); return }
    const panes = createPanes(PRESET_PANE_COUNTS[type])
    applyLayout(type, panes, buildPresetTree(type, panes))
  }

  function applyScheme(schemeId: string) {
    const scheme = savedSchemes.value.find((item) => item.id === schemeId)
    if (!scheme) return
    const panes = createPanes(resolvePaneCountForScheme(scheme))
    applyLayout(scheme.presetType, panes, buildSchemeRoot(scheme.presetType, panes, scheme.root))
  }

  function setManualAdjustEnabled(enabled: boolean) {
    manualAdjustEnabled.value = enabled && isSplitActive.value
    if (activeLayout.value) void persistState()
  }

  function resetToSingle() { clearLayout(focusedPane.value?.activeTabId ?? tabStore.activeTabId) }

  function setPaneActiveTab(paneId: string, tabId: string | null) {
    const pane = activeLayout.value?.panes.find((item) => item.id === paneId)
    if (pane) pane.activeTabId = tabId
  }

  function handleTabClick(tabId: string): boolean {
    if (!isSplitActive.value || !activeLayout.value) return false
    const result = routeTabClick(activeLayout.value.panes, focusedPaneId.value, tabId)
    if (!result) return false
    if (result.action === 'assign') setPaneActiveTab(result.paneId, tabId)
    focusPane(result.paneId)
    return true
  }

  function handleTabClosed(tabId: string) {
    if (!activeLayout.value) return
    activeLayout.value.panes.forEach((pane) => {
      if (pane.activeTabId === tabId)
        pane.activeTabId = findReplacementTabId(activeLayout.value!.panes, pane, tabId, tabStore.workspaceTabs)
    })
  }

  function handleTabCreated(tabId: string, preferredPaneId?: string | null) {
    if (!isSplitActive.value || !activeLayout.value) return
    const pid = resolveNewTabPaneTarget(activeLayout.value.panes, focusedPaneId.value, preferredPaneId)
    if (pid) { setPaneActiveTab(pid, tabId); focusPane(pid) }
  }

  function removePane(paneId: string) {
    if (!activeLayout.value || activeLayout.value.panes.length <= 1) return
    const removedPane = activeLayout.value.panes.find((p) => p.id === paneId)
    if (!removedPane) return
    const nextPanes = activeLayout.value.panes.filter((p) => p.id !== paneId)
    if (nextPanes.length === 0) return
    if (nextPanes.length === 1) {
      clearLayout(resolveSinglePaneTabId(nextPanes[0], removedPane, tabStore.activeTabId))
      return
    }
    const nextRoot = removePaneFromTree(activeLayout.value.root, paneId)
    if (nextRoot) applyLayout('custom', nextPanes, nextRoot, resolvePreferredPaneAfterRemove(focusedPaneId.value, paneId, nextPanes))
  }

  function movePane(sourcePaneId: string, targetPaneId: string, position: SplitDropPosition, metrics?: { sourceSize?: number; targetSize?: number }) {
    if (!activeLayout.value || (sourcePaneId === targetPaneId && position !== 'center')) return
    const sizes = normalizeSizes([metrics?.sourceSize ?? 1, metrics?.targetSize ?? 1], 2)
    applyLayout('custom', activeLayout.value.panes, movePaneInTree(activeLayout.value.root, sourcePaneId, targetPaneId, position, sizes), focusedPaneId.value)
  }

  function updateBranchSizes(path: number[], sizes: number[]) {
    if (activeLayout.value) activeLayout.value = buildUpdatedBranchLayout(activeLayout.value, path, sizes)
  }

  async function saveScheme(name: string) {
    if (!activeLayout.value) return
    const scheme = { ...buildSchemeFromLayout(activeLayout.value), name }
    await api.split.createScheme(scheme)
    savedSchemes.value.push(scheme)
  }

  async function deleteScheme(id: string) {
    await api.split.deleteScheme(id)
    savedSchemes.value = savedSchemes.value.filter((s) => s.id !== id)
  }

  async function loadSchemes() { savedSchemes.value = await api.split.listSchemes() }

  async function persistState(targetWorkspaceId = workspaceStore.activeWorkspaceId) {
    if (activeLayout.value) {
      await api.split.setState(targetWorkspaceId, serializeLayoutForPersist(activeLayout.value, manualAdjustEnabled.value))
    } else {
      await api.split.clearState(targetWorkspaceId)
    }
  }

  async function restoreState(targetWorkspaceId = workspaceStore.activeWorkspaceId) {
    const data = await api.split.getState(targetWorkspaceId)
    manualAdjustEnabled.value = false
    if (data) {
      const { layout, manualAdjust } = buildRestoredLayout(data)
      activeLayout.value = layout
      focusedPaneId.value = findInitialPaneId(layout.panes)
      manualAdjustEnabled.value = manualAdjust
      bumpLayoutRevision()
      if (focusedPaneId.value) focusPane(focusedPaneId.value)
    } else {
      activeLayout.value = null
      focusedPaneId.value = null
      bumpLayoutRevision()
    }
  }

  // ====== Watchers ======
  watch(() => tabStore.activeTabId, (tabId) => {
    if (!isSplitActive.value || !tabId) return
    const pane = activeLayout.value?.panes.find((p) => p.activeTabId === tabId)
    if (pane && focusedPaneId.value !== pane.id) focusedPaneId.value = pane.id
  })
  watch(isSplitActive, (active) => { if (!active) manualAdjustEnabled.value = false })
  watch(() => workspaceStore.activeWorkspaceId, async (nextId, prevId) => {
    if (activeLayout.value && prevId) await persistState(prevId)
    await restoreState(nextId)
  })

  return {
    activeLayout, focusedPaneId, savedSchemes, layoutRevision, manualAdjustEnabled,
    paneCount, isSplitActive, activePanes, focusedPane,
    applyPreset, resetToSingle, setPaneActiveTab, focusPane,
    handleTabClick, handleTabClosed, handleTabCreated,
    removePane, movePane, updateBranchSizes, setManualAdjustEnabled,
    applyScheme, saveScheme, deleteScheme, loadSchemes, restoreState, persistState
  }
})
