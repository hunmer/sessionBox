<script setup lang="ts">
import { Sun, Moon, Grid3x3, Rows3 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useThemeStore, type Theme } from '@/stores/theme'
import { useWorkspaceStore } from '@/stores/workspace'

const themeStore = useThemeStore()
const workspaceStore = useWorkspaceStore()

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

  <h3 class="text-sm font-medium mt-6 mb-3">工作区视图</h3>
  <div class="flex gap-2">
    <Button
      :variant="workspaceStore.viewMode === 'grid' ? 'default' : 'outline'"
      size="sm"
      class="gap-1.5"
      @click="workspaceStore.setViewMode('grid')"
    >
      <Grid3x3 class="w-3.5 h-3.5" />
      网格
    </Button>
    <Button
      :variant="workspaceStore.viewMode === 'icon' ? 'default' : 'outline'"
      size="sm"
      class="gap-1.5"
      @click="workspaceStore.setViewMode('icon')"
    >
      <Rows3 class="w-3.5 h-3.5" />
      图标
    </Button>
  </div>
</template>
