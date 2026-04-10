<script setup lang="ts">
import { Sun, Moon } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useThemeStore, type Theme } from '@/stores/theme'
import { useHomepageStore, type HomepageOpenMethod } from '@/stores/homepage'

const themeStore = useThemeStore()
const homepageStore = useHomepageStore()

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: '亮色', icon: Sun },
  { value: 'dark', label: '暗色', icon: Moon }
]

const openMethodOptions: { value: HomepageOpenMethod; label: string }[] = [
  { value: 'newTab', label: '新标签页' },
  { value: 'currentTab', label: '当前标签页' },
]
</script>

<template>
  <h3 class="text-sm font-medium mb-3">主题设置</h3>
  <div class="flex gap-2 mb-6">
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

  <h3 class="text-sm font-medium mb-3">主页设置</h3>
  <div class="space-y-3">
    <!-- 主页 URL -->
    <div>
      <label class="text-xs text-muted-foreground mb-1 block">主页地址</label>
      <Input
        :model-value="homepageStore.settings.url"
        placeholder="https://example.com"
        @update:model-value="homepageStore.updateSettings({ url: $event })"
      />
    </div>

    <!-- 打开方式 -->
    <div>
      <label class="text-xs text-muted-foreground mb-1 block">打开方式</label>
      <div class="flex gap-2">
        <Button
          v-for="opt in openMethodOptions"
          :key="opt.value"
          :variant="homepageStore.settings.openMethod === opt.value ? 'default' : 'outline'"
          size="sm"
          @click="homepageStore.updateSettings({ openMethod: opt.value })"
        >
          {{ opt.label }}
        </Button>
      </div>
    </div>

    <!-- 启动自动打开 -->
    <div class="flex items-center justify-between">
      <label class="text-xs text-muted-foreground">启动时自动打开主页</label>
      <button
        role="switch"
        :aria-checked="homepageStore.settings.autoOpen"
        class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
        :class="homepageStore.settings.autoOpen ? 'bg-primary' : 'bg-input'"
        @click="homepageStore.updateSettings({ autoOpen: !homepageStore.settings.autoOpen })"
      >
        <span
          class="pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform"
          :class="homepageStore.settings.autoOpen ? 'translate-x-4' : 'translate-x-0'"
        />
      </button>
    </div>
  </div>
</template>
