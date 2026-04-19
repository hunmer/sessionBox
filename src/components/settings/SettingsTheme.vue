<script setup lang="ts">
import { ref, computed } from 'vue'
import { useThemeStore, themePresets, THEME_VARS, createEmptyThemeVars } from '@/stores/theme'
import { Sun, Moon, Check, Palette, Download, Upload, FileJson, Copy, RotateCcw } from 'lucide-vue-next'
import { useNotification } from '@/composables/useNotification'

const themeStore = useThemeStore()
const { success, error: showError } = useNotification()

const activeView = ref<'presets' | 'custom'>('presets')
const editMode = ref<'light' | 'dark'>('light')

/** 编辑区 JSON 文本 */
const customJsonText = ref('')

/** 初始化编辑区内容 */
function initEditorFromStore() {
  const vars = editMode.value === 'dark'
    ? themeStore.customTheme.dark
    : themeStore.customTheme.light
  customJsonText.value = JSON.stringify(vars, null, 2)
}

/** 切换到自定义主题选项卡 */
function openCustomTab() {
  activeView.value = 'custom'
  initEditorFromStore()
}

/** 切换编辑模式（light/dark）时刷新编辑区 */
function switchEditMode(mode: 'light' | 'dark') {
  // 先保存当前编辑内容到临时
  const currentVars = parseJson(customJsonText.value)
  if (currentVars) {
    if (editMode.value === 'light') {
      themeStore.customTheme.light = currentVars
    } else {
      themeStore.customTheme.dark = currentVars
    }
  }
  editMode.value = mode
  initEditorFromStore()
}

/** 解析 JSON，返回 null 表示格式错误 */
function parseJson(text: string): Record<string, string> | null {
  try {
    const obj = JSON.parse(text)
    if (typeof obj !== 'object' || Array.isArray(obj)) return null
    return obj
  } catch {
    return null
  }
}

/** 应用自定义主题 */
function applyCustom() {
  const vars = parseJson(customJsonText.value)
  if (!vars) {
    showError('JSON 格式错误，请检查输入')
    return
  }

  const otherMode = editMode.value === 'light' ? 'dark' : 'light'
  const otherVars = editMode.value === 'light'
    ? themeStore.customTheme.dark
    : themeStore.customTheme.light

  themeStore.applyCustomTheme({
    light: editMode.value === 'light' ? vars : otherVars,
    dark: editMode.value === 'dark' ? vars : otherVars,
  })
  success('自定义主题已应用')
}

/** 从当前预设填充为自定义主题的起点 */
function fillFromCurrentPreset() {
  const p = themePresets.find(t => t.key === themeStore.preset)
  if (!p) return
  const vars = themeStore.theme === 'dark' ? p.dark : p.light
  const filled = { ...createEmptyThemeVars(), ...vars }
  customJsonText.value = JSON.stringify(filled, null, 2)
}

/** 填充空白模板 */
function fillTemplate() {
  customJsonText.value = JSON.stringify(createEmptyThemeVars(), null, 2)
}

/** 复制 JSON 到剪贴板 */
async function copyJson() {
  try {
    await navigator.clipboard.writeText(customJsonText.value)
    success('已复制到剪贴板')
  } catch {
    showError('复制失败')
  }
}

/** 导入主题 zip */
async function importTheme() {
  try {
    const result = await window.api.theme.importOpenFile()
    if (!result) return
    const vars = parseJson(result.json)
    if (!vars) {
      showError('主题文件格式无效')
      return
    }
    // 导入时同时应用到 light 和 dark
    themeStore.applyCustomTheme({
      light: vars,
      dark: vars,
    })
    // 刷新编辑区
    initEditorFromStore()
    success('主题导入成功')
  } catch (e) {
    showError('导入失败: ' + (e as Error).message)
  }
}

/** 导出当前自定义主题为 zip */
async function exportTheme() {
  try {
    const data = themeStore.exportCustomTheme()
    await window.api.theme.exportSaveFile(JSON.stringify(data, null, 2))
    success('主题导出成功')
  } catch (e) {
    showError('导出失败: ' + (e as Error).message)
  }
}

/** 预览色值（从 JSON 文本中提取） */
function extractVar(key: string): string {
  const vars = parseJson(customJsonText.value)
  return vars?.[key] || ''
}

const previewPrimary = computed(() => extractVar('--primary') || (editMode.value === 'dark' ? '#3b82f6' : '#1456f0'))
const previewBackground = computed(() => extractVar('--background') || (editMode.value === 'dark' ? '#181e25' : '#ffffff'))
const previewSidebar = computed(() => extractVar('--sidebar') || extractVar('--muted') || (editMode.value === 'dark' ? '#131920' : '#f8f9fa'))
const previewForeground = computed(() => extractVar('--foreground') || (editMode.value === 'dark' ? '#e8eaed' : '#222222'))
</script>

<template>
  <div class="space-y-6">
    <!-- 亮色/暗色切换 -->
    <div>
      <h3 class="text-sm font-medium mb-3">
        外观模式
      </h3>
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

    <!-- 选项卡切换：预设 / 自定义 -->
    <div>
      <div class="flex gap-1 mb-3 bg-muted/30 rounded-md p-1">
        <button
          class="flex-1 text-sm px-3 py-1.5 rounded-md transition-colors"
          :class="activeView === 'presets'
            ? 'bg-background shadow-sm font-medium'
            : 'text-muted-foreground hover:text-foreground'"
          @click="activeView = 'presets'"
        >
          主题风格
        </button>
        <button
          class="flex-1 text-sm px-3 py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5"
          :class="activeView === 'custom'
            ? 'bg-background shadow-sm font-medium'
            : 'text-muted-foreground hover:text-foreground'"
          @click="openCustomTab"
        >
          <Palette class="w-3.5 h-3.5" />
          自定义
        </button>
      </div>

      <!-- 预设主题 -->
      <div
        v-if="activeView === 'presets'"
        class="grid grid-cols-3 gap-3"
      >
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
            >
              {{ p.label }}
            </div>
            <div
              class="text-[10px] mt-0.5 opacity-60"
              :style="{ color: (() => {
                const vars = themeStore.theme === 'dark' ? p.dark : p.light
                return vars['--foreground'] || (themeStore.theme === 'dark' ? '#e8eaed' : '#222222')
              })() }"
            >
              {{ p.desc }}
            </div>
          </div>
        </button>
      </div>

      <!-- 自定义主题 -->
      <div
        v-else
        class="space-y-4"
      >
        <!-- 预览色块 -->
        <div class="rounded-lg border overflow-hidden">
          <div class="h-12 flex overflow-hidden">
            <div
              class="flex-1 flex flex-col"
              :style="{ backgroundColor: previewBackground }"
            >
              <div
                class="w-5 h-full"
                :style="{ backgroundColor: previewSidebar }"
              />
            </div>
            <div
              class="w-3 h-full"
              :style="{ backgroundColor: previewPrimary }"
            />
          </div>
        </div>

        <!-- light / dark 切换 -->
        <div class="flex gap-2">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-colors"
            :class="editMode === 'light'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border hover:bg-muted/50'"
            @click="switchEditMode('light')"
          >
            <Sun class="w-3 h-3" />
            浅色变量
          </button>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-colors"
            :class="editMode === 'dark'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border hover:bg-muted/50'"
            @click="switchEditMode('dark')"
          >
            <Moon class="w-3 h-3" />
            深色变量
          </button>
        </div>

        <!-- JSON 编辑器 -->
        <div class="relative">
          <textarea
            v-model="customJsonText"
            class="w-full h-64 text-xs font-mono bg-muted/30 border rounded-md p-3 resize-y focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="输入 JSON 格式的 CSS 变量..."
            spellcheck="false"
          />
        </div>

        <!-- 操作按钮 -->
        <div class="flex flex-wrap gap-2">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            @click="applyCustom"
          >
            <Check class="w-3.5 h-3.5" />
            应用
          </button>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border hover:bg-muted/50 transition-colors"
            @click="fillTemplate"
          >
            <FileJson class="w-3.5 h-3.5" />
            空白模板
          </button>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border hover:bg-muted/50 transition-colors"
            @click="fillFromCurrentPreset"
          >
            <RotateCcw class="w-3.5 h-3.5" />
            基于当前预设
          </button>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border hover:bg-muted/50 transition-colors"
            @click="copyJson"
          >
            <Copy class="w-3.5 h-3.5" />
            复制
          </button>
        </div>

        <!-- 导入/导出 -->
        <div class="pt-2 border-t">
          <h4 class="text-xs font-medium text-muted-foreground mb-2">
            导入 / 导出
          </h4>
          <div class="flex gap-2">
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border hover:bg-muted/50 transition-colors"
              @click="importTheme"
            >
              <Upload class="w-3.5 h-3.5" />
              导入主题 (.zip)
            </button>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border hover:bg-muted/50 transition-colors"
              @click="exportTheme"
            >
              <Download class="w-3.5 h-3.5" />
              导出主题 (.zip)
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
