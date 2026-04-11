<script setup lang="ts">
import { computed } from 'vue'
import { MoreHorizontal, ExternalLink, Pencil, Trash2 } from 'lucide-vue-next'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
import { useTabStore } from '@/stores/tab'
import { useContainerStore } from '@/stores/container'
import type { Container } from '@/types'

const props = defineProps<{
  container: Container
  collapsed: boolean
}>()

const emit = defineEmits<{
  edit: [container: Container]
  delete: [container: Container]
}>()

const tabStore = useTabStore()
const containerStore = useContainerStore()
const api = window.api

/** 创建桌面快捷方式 */
async function createDesktopShortcut() {
  try {
    await api.container.createDesktopShortcut(props.container.id)
  } catch (e) {
    console.error('创建快捷方式失败', e)
  }
}

/** 当前容器是否有激活的 tab */
const isActive = computed(() =>
  tabStore.activeTab?.containerId === props.container.id
)

/** 容器所属分组的颜色 */
const groupColor = computed(() => {
  const group = containerStore.getGroup(props.container.groupId)
  return group?.color || ''
})

/** 激活态的内联样式（分组颜色） */
const activeStyle = computed(() => {
  if (!isActive.value || !groupColor.value) return undefined
  return { color: groupColor.value, backgroundColor: groupColor.value + '1a' }
})

/** 图标是否为自定义图片 */
const isImageIcon = computed(() => props.container.icon?.startsWith('img:'))

/** 图片图标的协议路径 */
const imageIconSrc = computed(() => {
  if (!isImageIcon.value) return ''
  return `account-icon://${props.container.icon.slice(4)}`
})

/** 显示的文本图标 */
const textIcon = computed(() => {
  if (isImageIcon.value || props.container.icon?.startsWith('lucide:')) return ''
  return props.collapsed ? props.container.name.charAt(0) : props.container.icon || props.container.name.charAt(0)
})

/** 点击容器 */
function handleClick() {
  // 查找该容器的所有 tab
  const containerTabs = tabStore.sortedTabs.filter((t) => t.containerId === props.container.id)
  if (containerTabs.length > 0) {
    // 切换到该容器最近活跃的 tab
    tabStore.switchTab(containerTabs[containerTabs.length - 1].id)
  } else {
    // 创建新 tab
    tabStore.createTab(props.container.id)
  }
}
</script>

<template>
  <div
    class="group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors"
    :class="isActive ? (groupColor ? '' : 'bg-primary/10 text-primary') : 'hover:bg-sidebar-hover text-sidebar-foreground'"
    :style="activeStyle"
    @click="handleClick"
  >
    <!-- 图标 -->
    <span class="flex-shrink-0 w-5 h-5 flex items-center justify-center text-sm overflow-hidden">
      <img v-if="isImageIcon" :src="imageIconSrc" alt="" class="w-full h-full object-cover rounded-sm" />
      <EmojiRenderer v-else-if="container.icon?.startsWith('lucide:')" :emoji="container.icon" />
      <template v-else>{{ textIcon }}</template>
    </span>

    <!-- 名称（折叠时隐藏） -->
    <span v-if="!collapsed" class="flex-1 truncate text-sm">{{ container.name }}</span>

    <!-- 代理标记 -->
    <span
      v-if="!collapsed && container.proxyId"
      class="flex-shrink-0 w-2 h-2 rounded-full bg-primary"
      title="已绑定代理"
    />

    <!-- 更多按钮（折叠时隐藏） -->
    <DropdownMenu v-if="!collapsed">
      <DropdownMenuTrigger as-child>
        <button
          class="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-sidebar-hover transition-opacity"
          @click.stop
        >
          <MoreHorizontal class="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-44">
        <DropdownMenuItem @click="createDesktopShortcut">
          <ExternalLink class="w-3.5 h-3.5 mr-2" />创建桌面快捷方式
        </DropdownMenuItem>
        <DropdownMenuItem @click="emit('edit', container)">
          <Pencil class="w-3.5 h-3.5 mr-2" />编辑
        </DropdownMenuItem>
        <DropdownMenuItem class="text-destructive" @click="emit('delete', container)">
          <Trash2 class="w-3.5 h-3.5 mr-2" />删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
