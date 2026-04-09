import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Workspace } from '../types'

const api = window.api

const WORKSPACE_VIEW_KEY = 'sessionbox-workspace-view'
const DEFAULT_WORKSPACE_ID = '__default__'

export type WorkspaceViewMode = 'grid' | 'icon'

export const useWorkspaceStore = defineStore('workspace', () => {
  // ====== 状态 ======
  const workspaces = ref<Workspace[]>([])
  const activeWorkspaceId = ref<string>(DEFAULT_WORKSPACE_ID)
  const workspaceHistory = ref<string[]>([])

  // 视图模式
  const viewMode = ref<WorkspaceViewMode>(
    (localStorage.getItem(WORKSPACE_VIEW_KEY) as WorkspaceViewMode) || 'grid'
  )

  // ====== 计算属性 ======
  const sortedWorkspaces = computed(() =>
    [...workspaces.value].sort((a, b) => a.order - b.order)
  )

  const activeWorkspace = computed(() =>
    workspaces.value.find((w) => w.id === activeWorkspaceId.value) ?? workspaces.value[0]
  )

  function isDefaultWorkspace(id: string): boolean {
    return id === DEFAULT_WORKSPACE_ID
  }

  // ====== 操作 ======
  async function loadWorkspaces() {
    workspaces.value = await api.workspace.list()
  }

  async function createWorkspace(title: string, color: string) {
    const workspace = await api.workspace.create(title, color)
    workspaces.value.push(workspace)
    return workspace
  }

  async function updateWorkspace(id: string, data: Partial<Omit<Workspace, 'id'>>) {
    await api.workspace.update(id, data)
    const idx = workspaces.value.findIndex((w) => w.id === id)
    if (idx !== -1) workspaces.value[idx] = { ...workspaces.value[idx], ...data }
  }

  async function deleteWorkspace(id: string) {
    await api.workspace.delete(id)
    workspaces.value = workspaces.value.filter((w) => w.id !== id)
  }

  async function reorderWorkspaces(workspaceIds: string[]) {
    await api.workspace.reorder(workspaceIds)
    workspaceIds.forEach((id, order) => {
      const w = workspaces.value.find((w) => w.id === id)
      if (w) w.order = order
    })
  }

  /** 激活工作区，压入历史栈 */
  function activate(id: string) {
    if (activeWorkspaceId.value === id) return
    workspaceHistory.value.push(activeWorkspaceId.value)
    activeWorkspaceId.value = id
  }

  /** 关闭工作区，回到上一个 */
  function close(id: string) {
    if (isDefaultWorkspace(id)) return
    // 从历史栈中找到最近一个非当前 id 的工作区
    const history = [...workspaceHistory.value]
    // 如果关闭的是当前激活的，弹出历史栈
    if (activeWorkspaceId.value === id) {
      let prev = history.pop()
      // 跳过自身
      while (prev === id && history.length > 0) {
        prev = history.pop()
      }
      activeWorkspaceId.value = prev || DEFAULT_WORKSPACE_ID
    }
    // 从历史栈中移除该 id
    workspaceHistory.value = history.filter((h) => h !== id)
  }

  function setViewMode(mode: WorkspaceViewMode) {
    viewMode.value = mode
    localStorage.setItem(WORKSPACE_VIEW_KEY, mode)
  }

  async function init() {
    await loadWorkspaces()
  }

  return {
    workspaces,
    activeWorkspaceId,
    workspaceHistory,
    viewMode,
    sortedWorkspaces,
    activeWorkspace,
    isDefaultWorkspace,
    loadWorkspaces,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    reorderWorkspaces,
    activate,
    close,
    setViewMode,
    init
  }
})
