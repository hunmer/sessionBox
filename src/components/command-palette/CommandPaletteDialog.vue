<!-- src/components/command-palette/CommandPaletteDialog.vue -->

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useMagicKeys, whenever } from '@vueuse/core'
import CommandDialog from '@/components/ui/command/CommandDialog.vue'
import CommandInput from '@/components/ui/command/CommandInput.vue'
import CommandList from '@/components/ui/command/CommandList.vue'
import CommandEmpty from '@/components/ui/command/CommandEmpty.vue'
import CommandGroup from '@/components/ui/command/CommandGroup.vue'
import CommandItem from '@/components/ui/command/CommandItem.vue'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { createAllProviders } from './providers'
import type { CommandItem as CommandItemType } from '@/types/command'

const props = defineProps<{
  toggleSidebar: () => void
  openSettings: () => void
}>()

const emit = defineEmits<{
  (e: 'run'): void
}>()

const open = ref(false)
const input = ref('')

const { providers, results, loading, search, registerProviders } = useCommandPalette()

// 注册所有 Provider（只执行一次）
registerProviders(
  createAllProviders({
    toggleSidebar: props.toggleSidebar,
    openSettings: props.openSettings,
  })
)

// 快捷键 Cmd/Ctrl+K
const { meta_k, ctrl_k } = useMagicKeys()
whenever(meta_k!, () => {
  open.value = true
})
whenever(ctrl_k!, () => {
  open.value = true
})

// 输入变化时搜索（防抖 150ms）
let debounceTimer: ReturnType<typeof setTimeout> | null = null
watch(input, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    search(val)
  }, 150)
})

// 打开时初始化搜索
watch(open, (val) => {
  if (val) {
    input.value = ''
    search('')
  }
})

// 选中项目
function handleSelect(item: CommandItemType) {
  open.value = false
  item.run()
  emit('run')
}

// 获取 Provider 的分组标题（排除无搜索结果的分组）
const visibleGroups = computed(() => {
  return providers.value.filter((p) => results.value.has(p.id))
})
</script>

<template>
  <CommandDialog v-model:open="open" title="命令面板" description="搜索书签、页面、标签页或输入命令...">
    <CommandInput v-model="input" placeholder="输入命令或搜索..." />
    <CommandList>
      <CommandEmpty v-if="!loading && input.trim() && visibleGroups.length === 0">
        未找到结果
      </CommandEmpty>
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
