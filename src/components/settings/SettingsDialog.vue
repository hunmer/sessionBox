<script setup lang="ts">
import { ref } from 'vue'
import { Settings, Sun, Moon } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useThemeStore, type Theme } from '@/stores/theme'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const themeStore = useThemeStore()

// 左侧 tab 列表
const tabs = [
  { key: 'general', label: '常规' }
]
const activeTab = ref('general')

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: '亮色', icon: Sun },
  { value: 'dark', label: '暗色', icon: Moon }
]
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-2xl max-h-[70vh] flex flex-col p-0 gap-0">
      <DialogHeader class="px-6 pt-6 pb-4 border-b">
        <DialogTitle class="flex items-center gap-2">
          <Settings class="w-4 h-4" />
          设置
        </DialogTitle>
      </DialogHeader>

      <div class="flex flex-1 min-h-0">
        <!-- 左侧垂直 Tabs -->
        <nav class="w-[140px] shrink-0 border-r p-2 flex flex-col gap-0.5">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="w-full text-left text-sm px-3 py-2 rounded-md transition-colors"
            :class="activeTab === tab.key
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-muted/50'"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </nav>

        <!-- 右侧设置内容 -->
        <div class="flex-1 p-6 overflow-y-auto">
          <!-- 常规 - 主题设置 -->
          <div v-if="activeTab === 'general'">
            <h3 class="text-sm font-medium mb-3">主题设置</h3>
            <div class="flex gap-2">
              <Button
                v-for="opt in themeOptions"
                :key="opt.value"
                :variant="themeStore.theme === opt.value ? 'default' : 'outline'"
                size="sm"
                class="gap-1.5"
                @click="themeStore.setTheme(opt.value)"
              >
                <component :is="opt.icon" class="w-3.5 h-3.5" />
                {{ opt.label }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
