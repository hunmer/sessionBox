<!-- src/components/command-palette/CommandPaletteDialog.vue -->

<script setup lang="ts">
import { ref, watch, computed, nextTick, onBeforeUnmount } from 'vue'
import CommandDialog from '@/components/ui/command/CommandDialog.vue'
import CommandList from '@/components/ui/command/CommandList.vue'
import CommandEmpty from '@/components/ui/command/CommandEmpty.vue'
import CommandGroup from '@/components/ui/command/CommandGroup.vue'
import CommandItem from '@/components/ui/command/CommandItem.vue'
import { Search, X } from 'lucide-vue-next'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { createAllProviders } from './providers'
import type { CommandItem as CommandItemType } from '@/types/command'

const props = defineProps<{
  open: boolean
  toggleSidebar: () => void
  openSettings: () => void
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'run'): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<InstanceType<typeof CommandList> | null>(null)
const localInput = ref('')

const {
  providers,
  results,
  loading,
  activeProvider,
  search,
  searchWithProvider,
  registerProviders,
  activateProvider,
  deactivateProvider,
} = useCommandPalette()

// 注册所有 Provider（只执行一次）
registerProviders(
  createAllProviders({
    toggleSidebar: props.toggleSidebar,
    openSettings: props.openSettings,
  })
)

// skipNextWatch: 标记下一次 localInput watch 应跳过（被消费后自动重置）
let skipNextWatch = false

let focusTimer: ReturnType<typeof setTimeout> | null = null

function focusInput() {
  if (focusTimer) clearTimeout(focusTimer)

  nextTick(() => {
    focusTimer = setTimeout(() => {
      focusTimer = null
      if (!props.open) return
      inputRef.value?.focus()
    }, 1)
  })
}

// 输入变化时搜索
let debounceTimer: ReturnType<typeof setTimeout> | null = null
watch(localInput, (val) => {
  if (skipNextWatch) {
    skipNextWatch = false
    return
  }
  if (debounceTimer) clearTimeout(debounceTimer)

  if (activeProvider.value) {
    // 激活态：防抖搜索（避免频繁请求）
    debounceTimer = setTimeout(() => {
      searchWithProvider(activeProvider.value!, val)
    }, 150)
  } else {
    // 未激活：立即搜索（保证工具列表实时更新，空格自动激活依赖最新数据）
    search(val).then(() => {
      if (activeProvider.value) {
        skipNextWatch = true
        localInput.value = ''
        focusInput()
      }
    })
  }
})

// 打开时初始化搜索
watch(() => props.open, (val) => {
  if (val) {
    skipNextWatch = true
    localInput.value = ''
    search('')
    focusInput()
  } else if (focusTimer) {
    clearTimeout(focusTimer)
    focusTimer = null
  }
})

// 接管 reka-ui FocusScope 的自动焦点，聚焦到输入框
function handleOpenAutoFocus(e: Event) {
  e.preventDefault()
  focusInput()
}

// 选中项目
function handleSelect(item: CommandItemType) {
  emit('update:open', false)
  item.run()
  emit('run')
}

// 选中 Provider 工具项：激活该 Provider
function handleProviderSelect(item: CommandItemType) {
  const target = providers.value.find(
    (p) => `provider-${p.id}` === item.id
  )
  if (target) {
    activateProvider(target)
    skipNextWatch = true
    localInput.value = ''
    focusInput()
  }
}

// 同步计算匹配当前输入的 Provider 列表（不依赖异步 search 结果）
function findMatchingProviders(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return providers.value.filter(
    (p) =>
      p.prefix !== '' &&
      (p.prefix.toLowerCase().includes(q) ||
        (p.prefixShort && p.prefixShort.toLowerCase().includes(q)) ||
        p.label.toLowerCase().includes(q))
  )
}

// 获取所有可见的候选项 DOM 元素
function getVisibleItems(): HTMLElement[] {
  const listEl = listRef.value?.$el as HTMLElement | undefined
  if (!listEl) return []
  return Array.from(listEl.querySelectorAll('[role="option"]:not([hidden])')) as HTMLElement[]
}

// 处理键盘事件
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const items = getVisibleItems()
    if (items.length === 0) return

    e.preventDefault()

    const currentHighlight = document.activeElement as HTMLElement
    const currentIndex = items.indexOf(currentHighlight)

    let nextIndex: number
    if (e.key === 'ArrowDown') {
      nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
    }

    items[nextIndex]?.focus()
    return
  }

  // 可打印字符：从候选项回到输入框继续输入
  if (document.activeElement !== inputRef.value && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    inputRef.value?.focus()
    // 不 preventDefault，让字符正常输入
    return
  }

  // Escape / Backspace 从候选项回到输入框
  if ((e.key === 'Escape' || e.key === 'Backspace') && document.activeElement !== inputRef.value) {
    e.preventDefault()
    inputRef.value?.focus()
    return
  }

  if (e.key === 'Backspace' && activeProvider.value && !localInput.value) {
    // 激活态空输入时 Backspace 回退
    e.preventDefault()
    deactivateProvider()
    skipNextWatch = true
    localInput.value = ''
    focusInput()
    return
  }

  if (e.key === ' ' && !activeProvider.value && localInput.value.trim()) {
    // 空格时同步检查：只有一个候选项或精确匹配前缀 → 自动激活
    const matches = findMatchingProviders(localInput.value)
    if (matches.length === 1) {
      e.preventDefault()
      activateProvider(matches[0])
      skipNextWatch = true
      localInput.value = ''
      focusInput()
    }
  }
}

// 取消激活
function clearProvider() {
  deactivateProvider()
  skipNextWatch = true
  localInput.value = ''
  focusInput()
}

// 获取 Provider 的分组标题（排除无搜索结果的分组）
const visibleGroups = computed(() => {
  return providers.value.filter((p) => results.value.has(p.id))
})

// Provider 工具列表（无前缀搜索时展示）
const providerItems = computed(() => results.value.get('__providers__') || [])

// 输入占位文本
const placeholder = computed(() =>
  activeProvider.value ? `搜索${activeProvider.value.label}...` : '输入命令或搜索...'
)

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (focusTimer) clearTimeout(focusTimer)
})
</script>

<template>
  <CommandDialog :open="open" @update:open="emit('update:open', $event)" title="命令面板" description="搜索书签、页面、标签页或输入命令..." @open-auto-focus="handleOpenAutoFocus">
    <!-- 自定义搜索输入区域 -->
    <div class="flex h-9 items-center gap-2 border-b px-3">
      <div v-if="activeProvider" class="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary whitespace-nowrap">
        <component :is="activeProvider.icon" class="size-3.5 shrink-0" />
        <span>{{ activeProvider.label }}</span>
        <button class="ml-0.5 rounded-sm hover:bg-primary/20 hover:text-destructive" @click="clearProvider">
          <X class="size-3" />
        </button>
      </div>
      <Search v-else class="size-4 shrink-0 opacity-50" />
      <input
        ref="inputRef"
        v-model="localInput"
        :placeholder="placeholder"
        class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
        @keydown="handleKeydown"
      />
    </div>
    <CommandList ref="listRef" @keydown="handleKeydown">
      <CommandEmpty v-if="!loading && localInput.trim() && visibleGroups.length === 0 && providerItems.length === 0">
        未找到结果
      </CommandEmpty>
      <CommandGroup
        v-if="providerItems.length"
        heading="搜索工具"
      >
        <CommandItem
          v-for="item in providerItems"
          :key="item.id"
          :value="item.label + ' ' + (item.description || '') + ' ' + (item.keywords?.join(' ') || '')"
          @select="handleProviderSelect(item)"
        >
          <component :is="item.icon" class="mr-2 h-4 w-4 shrink-0" />
          <div class="flex flex-1 flex-col overflow-hidden">
            <span class="truncate text-sm">{{ item.label }}</span>
            <span v-if="item.description" class="truncate text-xs text-muted-foreground">
              {{ item.description }}
            </span>
          </div>
        </CommandItem>
      </CommandGroup>
      <CommandGroup
        v-for="provider in visibleGroups"
        :key="provider.id"
        :heading="provider.label"
      >
        <CommandItem
          v-for="item in results.get(provider.id)"
          :key="item.id"
          :value="item.label + ' ' + (item.description || '') + ' ' + (item.keywords?.join(' ') || '')"
          @select="handleSelect(item)"
        >
          <component :is="item.icon" class="mr-2 h-4 w-4 shrink-0" />
          <div class="flex flex-1 flex-col overflow-hidden">
            <span class="truncate text-sm">{{ item.label }}</span>
            <span v-if="item.description" class="truncate text-xs text-muted-foreground">
              {{ item.description }}
            </span>
          </div>
          <span v-if="item.shortcut" class="ml-2 text-xs text-muted-foreground">
            {{ item.shortcut }}
          </span>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>
