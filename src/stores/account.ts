import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Group, Account } from '../types'
import { useWorkspaceStore } from './workspace'

const api = window.api

export const useAccountStore = defineStore('account', () => {
  // ====== 状态 ======
  const groups = ref<Group[]>([])
  const accounts = ref<Account[]>([])

  // ====== 计算属性 ======

  /** 按分组归类的账号映射 */
  const accountsByGroup = computed(() => {
    const map = new Map<string, Account[]>()
    for (const account of accounts.value) {
      const list = map.get(account.groupId) || []
      list.push(account)
      map.set(account.groupId, list)
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

  /** 根据 ID 获取账号 */
  function getAccount(id: string): Account | undefined {
    return accounts.value.find((a) => a.id === id)
  }

  /** 根据 ID 获取分组 */
  function getGroup(id: string): Group | undefined {
    return groups.value.find((g) => g.id === id)
  }

  // ====== 分组操作 ======

  async function loadGroups() {
    groups.value = await api.group.list()
  }

  async function createGroup(name: string, color?: string, workspaceId?: string) {
    const group = await api.group.create(name, color, workspaceId)
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

  // ====== 账号操作 ======

  async function loadAccounts() {
    accounts.value = await api.account.list()
  }

  async function createAccount(data: Omit<Account, 'id'>) {
    const account = await api.account.create(data)
    accounts.value.push(account)
    return account
  }

  async function updateAccount(id: string, data: Partial<Omit<Account, 'id'>>) {
    await api.account.update(id, data)
    const idx = accounts.value.findIndex((a) => a.id === id)
    if (idx !== -1) accounts.value[idx] = { ...accounts.value[idx], ...data }
  }

  async function deleteAccount(id: string) {
    await api.account.delete(id)
    accounts.value = accounts.value.filter((a) => a.id !== id)
  }

  async function reorderAccounts(accountIds: string[]) {
    await api.account.reorder(accountIds)
    accountIds.forEach((id, order) => {
      const a = accounts.value.find((a) => a.id === id)
      if (a) a.order = order
    })
  }

  /** 初始化：加载所有分组和账号数据 */
  async function init() {
    await Promise.all([loadGroups(), loadAccounts()])
  }

  return {
    groups,
    accounts,
    accountsByGroup,
    sortedGroups,
    workspaceGroups,
    getAccount,
    getGroup,
    loadGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
    loadAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    reorderAccounts,
    init
  }
})
