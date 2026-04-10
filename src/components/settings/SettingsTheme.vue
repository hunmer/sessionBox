<script setup lang="ts">
import { useThemeStore, themePresets } from '@/stores/theme'
import { Sun, Moon, Check } from 'lucide-vue-next'

const themeStore = useThemeStore()
</script>

<template>
  <div class="space-y-6">
    <!-- 亮色/暗色切换 -->
    <div>
      <h3 class="text-sm font-medium mb-3">外观模式</h3>
      <div class="flex gap-2">
        <button
          class="flex items-center gap-2 px-4 py-2 rounded-md text-sm border transition-colors"
          :class="themeStore.theme === 'light'
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border hover:bg-muted/50'"
          @click="themeStore.setTheme('light')"
        >
          <Sun class="w-4 h-4" />
          浅色
        </button>
        <button
          class="flex items-center gap-2 px-4 py-2 rounded-md text-sm border transition-colors"
          :class="themeStore.theme === 'dark'
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border hover:bg-muted/50'"
          @click="themeStore.setTheme('dark')"
        >
          <Moon class="w-4 h-4" />
          深色
        </button>
      </div>
    </div>

    <!-- 主题预设 -->
    <div>
      <h3 class="text-sm font-medium mb-3">主题风格</h3>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="p in themePresets"
          :key="p.key"
          class="group relative rounded-lg border overflow-hidden text-left transition-all hover:ring-2 hover:ring-ring/50"
          :class="themeStore.preset === p.key ? 'ring-2 ring-primary' : 'border-border'"
          @click="themeStore.setPreset(p.key)"
        >
          <!-- 选中标记 -->
          <div
            v-if="themeStore.preset === p.key"
            class="absolute top-1.5 right-1.5 z-10 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
          >
            <Check class="w-2.5 h-2.5" />
          </div>

          <!-- 预览色块 -->
          <div class="h-16 flex overflow-hidden">
            <div
              class="flex-1 flex flex-col"
              :style="{ backgroundColor: (() => {
                const vars = themeStore.theme === 'dark' ? p.dark : p.light
                return vars['--background'] || (themeStore.theme === 'dark' ? '#181e25' : '#ffffff')
              })() }"
            >
              <!-- 模拟侧边栏 -->
              <div
                class="w-5 h-full"
                :style="{ backgroundColor: (() => {
                  const vars = themeStore.theme === 'dark' ? p.dark : p.light
                  return vars['--sidebar'] || vars['--muted'] || (themeStore.theme === 'dark' ? '#131920' : '#f8f9fa')
                })() }"
              />
            </div>
            <!-- 主色条 -->
            <div
              class="w-3 h-full"
              :style="{ backgroundColor: (() => {
                const vars = themeStore.theme === 'dark' ? p.dark : p.light
                return vars['--primary'] || (themeStore.theme === 'dark' ? '#3b82f6' : '#1456f0')
              })() }"
            />
          </div>

          <!-- 标签 -->
          <div
            class="px-2.5 py-2"
            :style="{ backgroundColor: (() => {
              const vars = themeStore.theme === 'dark' ? p.dark : p.light
              return vars['--card'] || (themeStore.theme === 'dark' ? '#1f2733' : '#ffffff')
            })() }"
          >
            <div
              class="text-xs font-medium"
              :style="{ color: (() => {
                const vars = themeStore.theme === 'dark' ? p.dark : p.light
                return vars['--foreground'] || (themeStore.theme === 'dark' ? '#e8eaed' : '#222222')
              })() }"
            >{{ p.label }}</div>
            <div
              class="text-[10px] mt-0.5 opacity-60"
              :style="{ color: (() => {
                const vars = themeStore.theme === 'dark' ? p.dark : p.light
                return vars['--foreground'] || (themeStore.theme === 'dark' ? '#e8eaed' : '#222222')
              })() }"
            >{{ p.desc }}</div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
