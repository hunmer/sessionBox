import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Group, Container } from '../types'
import { useWorkspaceStore } from './workspace'

const api = window.api

export const useContainerStore = defineStore('container', () => {
  // ====== 状态 ======
  const groups = ref<Group[]>([])
  const containers = ref<Container[]>([])
  const defaultContainerId = ref('default')
  const askContainerOnOpen = ref(false)

  // ====== 计算属性 ======

  /** 按分组归类的容器映射 */
  const containersByGroup = computed(() => {
    const map = new Map<string, Container[]>()
    for (const container of containers.value) {
      const list = map.get(container.groupId) || []
      list.push(container)
      map.set(container.groupId, list)
    }
    return map
  })

  /** 排序后的分组列表 */
  const sortedGroups = computed(() =>
    [...groups.value].sort((a, b) => a.order - b.order)
  )

  /** 根据当前激活工作区过滤的分组列表 */
  const workspaceGroups = computed(() => {
    const workspaceStore = useWorkspaceStore()
    const activeId = workspaceStore.activeWorkspaceId
    return sortedGroups.value.filter((g) => {
      // workspaceId 为空时视为属于默认工作区
      const gWorkspaceId = g.workspaceId || '__default__'
      return gWorkspaceId === activeId
    })
  })

  /** 根据 ID 获取容器 */
  function getContainer(id: string): Container | undefined {
    return containers.value.find((c) => c.id === id)
  }

  /** 根据 ID 获取分组 */
  function getGroup(id: string): Group | undefined {
    return groups.value.find((g) => g.id === id)
  }

  // ====== 分组操作 ======

  async function loadGroups() {
    groups.value = await api.group.list()
  }

  async function createGroup(name: string, color?: string, workspaceId?: string, proxyId?: string, icon?: string) {
    const group = await api.group.create(name, color, workspaceId, proxyId, icon)
    groups.value.push(group)
    return group
  }

  async function updateGroup(id: string, data: Partial<Omit<Group, 'id'>>) {
    await api.group.update(id, data)
    const idx = groups.value.findIndex((g) => g.id === id)
    if (idx !== -1) groups.value[idx] = { ...groups.value[idx], ...data }
  }

  async function deleteGroup(id: string) {
    await api.group.delete(id)
    groups.value = groups.value.filter((g) => g.id !== id)
  }

  async function reorderGroups(groupIds: string[]) {
    await api.group.reorder(groupIds)
    // 按新顺序更新本地 order
    groupIds.forEach((id, order) => {
      const g = groups.value.find((g) => g.id === id)
      if (g) g.order = order
    })
  }

  // ====== 容器操作 ======

  async function loadContainers() {
    containers.value = await api.container.list()
  }

  async function createContainer(data: Omit<Container, 'id'>) {
    const container = await api.container.create(data)
    containers.value.push(container)
    return container
  }

  async function updateContainer(id: string, data: Partial<Omit<Container, 'id'>>) {
    await api.container.update(id, data)
    const idx = containers.value.findIndex((c) => c.id === id)
    if (idx !== -1) containers.value[idx] = { ...containers.value[idx], ...data }
  }

  async function deleteContainer(id: string) {
    await api.container.delete(id)
    containers.value = containers.value.filter((c) => c.id !== id)
  }

  async function reorderContainers(containerIds: string[]) {
    await api.container.reorder(containerIds)
    containerIds.forEach((id, order) => {
      const c = containers.value.find((c) => c.id === id)
      if (c) c.order = order
    })
  }

  /** 初始化：加载所有分组和容器数据 */
  async function init() {
    await Promise.all([loadGroups(), loadContainers()])
    defaultContainerId.value = await api.settings.getDefaultContainerId()
    askContainerOnOpen.value = await api.settings.getAskContainerOnOpen()
  }

  /** 设置默认容器 */
  async function setDefaultContainer(id: string) {
    await api.settings.setDefaultContainerId(id)
    defaultContainerId.value = id
  }

  /** 设置是否每次询问容器 */
  async function setAskContainerOnOpen(enabled: boolean) {
    await api.settings.setAskContainerOnOpen(enabled)
    askContainerOnOpen.value = enabled
  }

  return {
    groups,
    containers,
    defaultContainerId,
    askContainerOnOpen,
    containersByGroup,
    sortedGroups,
    workspaceGroups,
    getContainer,
    getGroup,
    loadGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
    loadContainers,
    createContainer,
    updateContainer,
    deleteContainer,
    reorderContainers,
    setDefaultContainer,
    setAskContainerOnOpen,
    init
  }
})
