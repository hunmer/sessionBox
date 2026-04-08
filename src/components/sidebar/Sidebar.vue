<script setup lang="ts">
import { ref, computed } from 'vue'
import { PanelLeftClose, PanelLeft, Plus, Globe, Settings, MoreVertical } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import GroupList from './GroupList.vue'
import GroupDialog from './GroupDialog.vue'
import AccountDialog from './AccountDialog.vue'
import { useAccountStore } from '@/stores/account'
import { useTabStore } from '@/stores/tab'
import type { Group, Account } from '@/types'

const accountStore = useAccountStore()
const tabStore = useTabStore()

const props = defineProps<{
  collapsed?: boolean
}>()

const emit = defineEmits<{
  openProxy: []
  openSettings: []
  toggleCollapse: []
}>()

// ====== 编辑弹窗状态 ======
const groupDialogOpen = ref(false)
const editingGroup = ref<Group | null>(null)
const accountDialogOpen = ref(false)
const editingAccount = ref<Account | null>(null)
const newAccountGroupId = ref('')

// ====== 删除确认 ======
const deleteDialogOpen = ref(false)
const deleteTarget = ref<{ type: 'group' | 'account'; item: Group | Account } | null>(null)
const deleteMessage = computed(() => {
  if (!deleteTarget.value) return ''
  if (deleteTarget.value.type === 'account') {
    const tabs = tabStore.sortedTabs.filter((t) => t.accountId === deleteTarget.value!.item.id)
    return tabs.length > 0
      ? `将关闭 ${tabs.length} 个已打开的标签页并删除账号「${(deleteTarget.value.item as Account).name}」`
      : `确定删除账号「${(deleteTarget.value.item as Account).name}」？`
  }
  return `确定删除分组「${(deleteTarget.value.item as Group).name}」？`
})

// ====== 分组操作 ======
function openNewGroup() {
  editingGroup.value = null
  groupDialogOpen.value = true
}

function openEditGroup(group: Group) {
  editingGroup.value = group
  groupDialogOpen.value = true
}

async function handleGroupSave(data: { name: string; proxyId?: string }) {
  if (editingGroup.value) {
    await accountStore.updateGroup(editingGroup.value.id, data)
  } else {
    await accountStore.createGroup(data.name)
  }
}

function confirmDeleteGroup(group: Group) {
  deleteTarget.value = { type: 'group', item: group }
  deleteDialogOpen.value = true
}

// ====== 账号操作 ======
function openNewAccount(groupId: string) {
  editingAccount.value = null
  newAccountGroupId.value = groupId
  accountDialogOpen.value = true
}

function openEditAccount(account: Account) {
  editingAccount.value = account
  accountDialogOpen.value = true
}

async function handleAccountSave(data: Partial<Account> & { groupId: string; name: string; icon: string; defaultUrl: string; order: number }) {
  if (editingAccount.value) {
    await accountStore.updateAccount(editingAccount.value.id, data)
  } else {
    await accountStore.createAccount(data)
  }
}

function confirmDeleteAccount(account: Account) {
  deleteTarget.value = { type: 'account', item: account }
  deleteDialogOpen.value = true
}

// ====== 删除确认处理 ======
async function handleDelete() {
  if (!deleteTarget.value) return
  if (deleteTarget.value.type === 'account') {
    // 先关闭该账号的所有 tab
    const accountTabs = tabStore.sortedTabs.filter((t) => t.accountId === deleteTarget.value.item.id)
    for (const tab of accountTabs) {
      await tabStore.closeTab(tab.id)
    }
    await accountStore.deleteAccount(deleteTarget.value.item.id)
  } else {
    await accountStore.deleteGroup(deleteTarget.value.item.id)
  }
  deleteTarget.value = null
}
</script>

<template>
  <aside
    class="flex flex-col h-full bg-sidebar border-r border-sidebar-border transition-all duration-200"
  >
    <!-- 顶部：折叠按钮（可拖拽区域） -->
    <div class="flex items-center justify-between px-3 h-11 border-b border-sidebar-border" style="-webkit-app-region: drag">
      <span v-if="!collapsed" class="text-sm font-medium text-sidebar-foreground">SessionBox</span>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" class="h-7 w-7" style="-webkit-app-region: no-drag" @click="emit('toggleCollapse')">
            <PanelLeftClose v-if="!collapsed" class="w-4 h-4" />
            <PanelLeft v-else class="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{{ collapsed ? '展开侧边栏' : '折叠侧边栏' }}</TooltipContent>
      </Tooltip>
    </div>

    <!-- 分组列表 -->
    <ScrollArea class="flex-1 px-1 py-1">
      <GroupList
        :collapsed="collapsed"
        @edit-group="openEditGroup"
        @delete-group="confirmDeleteGroup"
        @add-account="openNewAccount"
        @edit-account="openEditAccount"
        @delete-account="confirmDeleteAccount"
      />
    </ScrollArea>

    <!-- 底部操作 -->
    <div :class="['border-t border-sidebar-border py-2 flex gap-1', collapsed ? 'flex-col items-center px-1' : 'flex-row items-center gap-1.5 px-3']">
      <template v-if="collapsed">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon" class="h-7 w-7" @click="openNewGroup">
              <Plus class="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">新建分组</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon" class="h-7 w-7" @click="emit('openProxy')">
              <Globe class="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">代理设置</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon" class="h-7 w-7" @click="emit('openSettings')">
              <Settings class="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">设置</TooltipContent>
        </Tooltip>
      </template>
      <template v-else>
        <Button variant="ghost" size="sm" class="flex-1 text-xs" @click.stop="openNewGroup">
          <Plus class="w-3.5 h-3.5 mr-1" />新建分组
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" class="h-7 w-7">
              <MoreVertical class="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="emit('openProxy')">
              <Globe class="w-4 h-4 mr-2" />代理设置
            </DropdownMenuItem>
            <DropdownMenuItem @click="emit('openSettings')">
              <Settings class="w-4 h-4 mr-2" />设置
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </div>

    <!-- 分组编辑弹窗 -->
    <GroupDialog
      :open="groupDialogOpen"
      :group="editingGroup"
      @update:open="groupDialogOpen = $event"
      @save="handleGroupSave"
    />

    <!-- 账号编辑弹窗 -->
    <AccountDialog
      :open="accountDialogOpen"
      :account="editingAccount"
      :group-id="newAccountGroupId"
      @update:open="accountDialogOpen = $event"
      @save="handleAccountSave"
    />

    <!-- 删除确认弹窗 -->
    <AlertDialog :open="deleteDialogOpen" @update:open="deleteDialogOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>{{ deleteMessage }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction class="bg-destructive text-destructive-foreground hover:bg-destructive/90" @click="handleDelete">
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </aside>
</template>
