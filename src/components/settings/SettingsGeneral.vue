<script setup lang="ts">
import { Sun, Moon } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useThemeStore, type Theme } from '@/stores/theme'

const themeStore = useThemeStore()

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: '亮色', icon: Sun },
  { value: 'dark', label: '暗色', icon: Moon }
]
</script>

<template>
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
</template>
