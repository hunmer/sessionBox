<script setup lang="ts">
import { ref, computed, watch, markRaw } from 'vue'
import * as lucideIcons from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

const props = defineProps<{
  open: boolean
  currentIcon?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [iconName: string]
}>()

const search = ref('')
const selected = ref('')
const page = ref(1)
const PAGE_SIZE = 64 // 8 cols * 8 rows

/** 所有可用的 lucide 图标名（排除 Icon 后缀的别名） */
const allIconNames = Object.keys(lucideIcons).filter(k => !k.endsWith('Icon'))

/** 按关键词过滤 */
const filteredIcons = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return allIconNames
  return allIconNames.filter(name => name.toLowerCase().includes(q))
})

/** 总页数 */
const totalPages = computed(() => Math.max(1, Math.ceil(filteredIcons.value.length / PAGE_SIZE)))

/** 当前页的图标 */
const pageIcons = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filteredIcons.value.slice(start, start + PAGE_SIZE)
})

/** 搜索时重置页码 */
function onSearchChange() {
  page.value = 1
}

/** 选择图标 */
function selectIcon(name: string) {
  selected.value = selected.value === name ? '' : name
}

/** 确认选择 */
function handleConfirm() {
  if (selected.value) {
    emit('confirm', `lucide:${selected.value}`)
  }
  emit('update:open', false)
}

/** 打开时初始化选中状态 */
watch(() => props.open, (val) => {
  if (val) {
    search.value = ''
    page.value = 1
    // 从当前图标恢复选中（如果是 lucide 图标）
    if (props.currentIcon?.startsWith('lucide:')) {
      selected.value = props.currentIcon.slice(6)
    } else {
      selected.value = ''
    }
  }
})

/** 获取图标组件 */
const iconCache = new Map<string, any>()
function getIconComponent(name: string) {
  let comp = iconCache.get(name)
  if (comp !== undefined) return comp
  const raw = (lucideIcons as any)[name]
  comp = raw ? markRaw(raw) : null
  iconCache.set(name, comp)
  return comp
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle>选择图标</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-3">
        <!-- 搜索栏 -->
        <Input
          v-model="search"
          placeholder="搜索图标..."
          @update:model-value="onSearchChange"
        />

        <!-- 图标网格 -->
        <ScrollArea class="h-[360px]">
          <div class="grid grid-cols-8 place-items-center gap-4 p-1">
            <button
              v-for="name in pageIcons"
              :key="name"
              class="w-10 h-10 rounded-lg flex items-center justify-center transition-colors border-2 hover:bg-accent"
              :class="selected === name ? 'border-primary bg-primary/10' : 'border-transparent'"
              :title="name"
              @click="selectIcon(name)"
            >
              <component :is="getIconComponent(name)" class="w-5 h-5" />
            </button>
          </div>

          <div v-if="pageIcons.length === 0" class="flex items-center justify-center h-32 text-muted-foreground text-sm">
            没有找到匹配的图标
          </div>
        </ScrollArea>

        <!-- 分页 -->
        <div class="flex items-center justify-between pt-1">
          <span class="text-xs text-muted-foreground">
            {{ filteredIcons.length }} 个图标
          </span>
          <div class="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              class="h-7 w-7"
              :disabled="page <= 1"
              @click="page--"
            >
              ‹
            </Button>
            <span class="text-xs text-muted-foreground px-2 min-w-[60px] text-center">
              {{ page }} / {{ totalPages }}
            </span>
            <Button
              variant="outline"
              size="icon"
              class="h-7 w-7"
              :disabled="page >= totalPages"
              @click="page++"
            >
              ›
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter class="gap-2">
        <Button variant="secondary" @click="emit('update:open', false)">取消</Button>
        <Button :disabled="!selected" @click="handleConfirm">确定</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
