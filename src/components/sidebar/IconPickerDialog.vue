<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import EmojiPicker from 'vue3-emoji-picker'
import 'vue3-emoji-picker/css'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { lucideIconNames, resolveLucideIcon } from '@/lib/lucide-resolver'
import { useThemeStore } from '@/stores/theme'

const props = defineProps<{
  open: boolean
  currentIcon?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [iconName: string]
}>()

const themeStore = useThemeStore()
const activeTab = ref<'icon' | 'emoji'>('icon')
const search = ref('')
const selected = ref('')
const page = ref(1)
const PAGE_SIZE = 64 // 8 cols * 8 rows

/** 按关键词过滤 */
const filteredIcons = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return lucideIconNames
  return lucideIconNames.filter(name => name.toLowerCase().includes(q))
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

/** 选择 emoji */
function onSelectEmoji(emoji: { i: string }) {
  emit('confirm', emoji.i)
  emit('update:open', false)
}

/** 确认选择 lucide 图标 */
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
    activeTab.value = 'icon'
    // 从当前图标恢复选中（如果是 lucide 图标）
    if (props.currentIcon?.startsWith('lucide:')) {
      selected.value = props.currentIcon.slice(7)
    } else {
      selected.value = ''
    }
  }
})

/** 获取图标组件 */
function getIconComponent(name: string) {
  return resolveLucideIcon(name)
}

/** emoji picker 主题 */
const emojiTheme = computed(() => themeStore.theme === 'dark' ? 'dark' : 'light')
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle>选择图标</DialogTitle>
      </DialogHeader>

      <!-- Tab 切换 -->
      <div class="flex border-b border-border mb-0">
        <button
          class="flex-1 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'icon' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'icon'"
        >
          图标
          <span v-if="activeTab === 'icon'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
        </button>
        <button
          class="flex-1 py-2 text-sm font-medium transition-colors relative"
          :class="activeTab === 'emoji' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'emoji'"
        >
          Emoji
          <span v-if="activeTab === 'emoji'" class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
        </button>
      </div>

      <!-- 图标 Tab -->
      <div v-if="activeTab === 'icon'" class="flex flex-col gap-3">
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

      <!-- Emoji Tab -->
      <div v-else>
        <EmojiPicker
          class="!h-[440px] !w-full"
          :native="true"
          :hide-search="false"
          :disable-skin-tones="true"
          :display-recent="true"
          :theme="emojiTheme"
          :static-texts="{ placeholder: '搜索 emoji...' }"
          @select="onSelectEmoji"
        />
      </div>

      <DialogFooter v-if="activeTab === 'icon'" class="gap-2">
        <Button variant="secondary" @click="emit('update:open', false)">取消</Button>
        <Button :disabled="!selected" @click="handleConfirm">确定</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
