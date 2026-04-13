<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { ExternalLink, RefreshCw, Plus, Trash2, Check, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import appIcon from '../../../resources/icon.png'

// ====== 类型定义 ======

interface UpdateSource {
  id: string
  name: string
  type: 'github' | 'generic'
  url?: string
  owner?: string
  repo?: string
}

// ====== 状态 ======

const currentVersion = ref('')
const isChecking = ref(false)
const checkResult = ref<{ type: 'success' | 'error' | 'available'; message: string } | null>(null)
const sources = ref<UpdateSource[]>([])
const activeSourceId = ref('github')

// 新增源表单
const showAddForm = ref(false)
const newSourceName = ref('')
const newSourceType = ref<'generic'>('generic')
const newSourceUrl = ref('')

// 事件清理函数
const cleanupFns: (() => void)[] = []

// ====== 计算属性 ======

const activeSource = computed(() =>
  sources.value.find((s) => s.id === activeSourceId.value)
)

const customSources = computed(() =>
  sources.value.filter((s) => s.id !== 'github')
)

// ====== 方法 ======

function openExternal(url: string) {
  window.api.openExternal(url)
}

// 加载更新源列表
async function loadSources() {
  if (!window.api?.updater) return
  sources.value = await window.api.updater.listSources()
  activeSourceId.value = await window.api.updater.getActiveSource()
}

// 获取当前版本
async function loadVersion() {
  if (!window.api?.updater) return
  try {
    const result = await window.api.updater.getVersion()
    if (result.success) {
      currentVersion.value = result.version
    }
  } catch (e) {
    console.warn('[SettingsAbout] 获取版本失败:', e)
  }
}

// 检查更新
async function checkForUpdates() {
  if (!window.api?.updater || isChecking.value) return

  isChecking.value = true
  checkResult.value = null

  try {
    const result = await window.api.updater.check()
    if (result.success && result.updateInfo) {
      checkResult.value = {
        type: 'available',
        message: `发现新版本 v${result.updateInfo.version}`
      }
    } else if (result.success) {
      checkResult.value = {
        type: 'success',
        message: '当前已是最新版本'
      }
    } else {
      checkResult.value = {
        type: 'error',
        message: result.error || '检查更新失败'
      }
    }
  } catch (error: unknown) {
    checkResult.value = {
      type: 'error',
      message: (error as Error).message || '检查更新失败'
    }
  } finally {
    isChecking.value = false
  }
}

// 切换更新源
async function switchSource(id: string) {
  if (!window.api?.updater) return
  const result = await window.api.updater.setActiveSource(id)
  if (result.success) {
    activeSourceId.value = id
  }
}

// 添加自定义源
async function addCustomSource() {
  if (!window.api?.updater || !newSourceUrl.value.trim()) return

  const id = `custom_${Date.now()}`
  const source: UpdateSource = {
    id,
    name: newSourceName.value.trim() || '自定义源',
    type: newSourceType.value,
    url: newSourceUrl.value.trim()
  }

  const result = await window.api.updater.addSource(source)
  if (result.success) {
    sources.value.push(source)
    showAddForm.value = false
    newSourceName.value = ''
    newSourceUrl.value = ''
    // 自动切换到新添加的源
    await switchSource(id)
  }
}

// 删除自定义源
async function removeSource(id: string) {
  if (!window.api?.updater) return
  await window.api.updater.removeSource(id)
  sources.value = sources.value.filter((s) => s.id !== id)
}

// 3 秒后自动清除检查结果
let resultTimer: ReturnType<typeof setTimeout> | null = null

function scheduleClearResult() {
  if (resultTimer) clearTimeout(resultTimer)
  resultTimer = setTimeout(() => {
    checkResult.value = null
  }, 5000)
}

// ====== 生命周期 ======

onMounted(async () => {
  await Promise.all([loadVersion(), loadSources()])

  if (!window.api?.updater) return

  // 监听更新可用
  const unsubAvailable = window.api.updater.onAvailable((info) => {
    checkResult.value = { type: 'available', message: `发现新版本 v${info.version}` }
    isChecking.value = false
  })
  cleanupFns.push(unsubAvailable)

  // 监听无更新
  const unsubNotAvailable = window.api.updater.onNotAvailable(() => {
    checkResult.value = { type: 'success', message: '当前已是最新版本' }
    isChecking.value = false
    scheduleClearResult()
  })
  cleanupFns.push(unsubNotAvailable)

  // 监听错误
  const unsubError = window.api.updater.onError((error) => {
    checkResult.value = { type: 'error', message: error.message }
    isChecking.value = false
    scheduleClearResult()
  })
  cleanupFns.push(unsubError)
})

onUnmounted(() => {
  cleanupFns.forEach((fn) => fn())
  if (resultTimer) clearTimeout(resultTimer)
})
</script>

<template>
  <div class="flex flex-col items-center py-8 gap-6">
    <!-- 应用图标与版本 -->
    <img :src="appIcon" alt="SessionBox" class="w-20 h-20 rounded-xl" />
    <div class="text-center">
      <h3 class="text-lg font-semibold">SessionBox</h3>
      <p class="text-xs text-muted-foreground mt-1">
        版本 v{{ currentVersion || '...' }}
      </p>
    </div>

    <!-- GitHub 链接 -->
    <button
      class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
      @click="openExternal('https://github.com/hunmer/sessionBox')"
    >
      <ExternalLink class="w-3.5 h-3.5" />
      GitHub
    </button>

    <!-- 分割线 -->
    <div class="w-full max-w-sm border-t" />

    <!-- 检查更新按钮 -->
    <div class="flex flex-col items-center gap-3 w-full max-w-sm">
      <Button
        variant="outline"
        class="w-full gap-2"
        :disabled="isChecking"
        @click="checkForUpdates"
      >
        <Loader2 v-if="isChecking" class="w-4 h-4 animate-spin" />
        <RefreshCw v-else class="w-4 h-4" />
        {{ isChecking ? '正在检查...' : '检查更新' }}
      </Button>

      <!-- 检查结果 -->
      <div v-if="checkResult" class="w-full text-center">
        <Badge
          :variant="checkResult.type === 'error' ? 'destructive' : 'default'"
          class="gap-1"
        >
          <Check v-if="checkResult.type === 'success'" class="w-3 h-3" />
          {{ checkResult.message }}
        </Badge>
      </div>
    </div>

    <!-- 分割线 -->
    <div class="w-full max-w-sm border-t" />

    <!-- 更新源选择 -->
    <div class="flex flex-col gap-3 w-full max-w-sm">
      <label class="text-sm font-medium">更新源</label>

      <Select :model-value="activeSourceId" @update:model-value="switchSource">
        <SelectTrigger class="w-full">
          <SelectValue placeholder="选择更新源" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="source in sources"
            :key="source.id"
            :value="source.id"
          >
            {{ source.name }}
          </SelectItem>
        </SelectContent>
      </Select>

      <!-- 当前源信息 -->
      <p v-if="activeSource" class="text-xs text-muted-foreground">
        <template v-if="activeSource.type === 'github'">
          GitHub: {{ activeSource.owner }}/{{ activeSource.repo }}
        </template>
        <template v-else>
          {{ activeSource.url }}
        </template>
      </p>

      <!-- 已添加的自定义源列表 -->
      <div v-if="customSources.length > 0" class="flex flex-col gap-1.5">
        <div
          v-for="source in customSources"
          :key="source.id"
          class="flex items-center justify-between rounded-md border px-3 py-1.5"
        >
          <div class="flex flex-col min-w-0">
            <span class="text-sm truncate">{{ source.name }}</span>
            <span class="text-xs text-muted-foreground truncate">{{ source.url }}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            @click="removeSource(source.id)"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <!-- 添加自定义源 -->
      <Button
        v-if="!showAddForm"
        variant="ghost"
        size="sm"
        class="w-full gap-1 text-muted-foreground"
        @click="showAddForm = true"
      >
        <Plus class="w-3.5 h-3.5" />
        添加自定义源
      </Button>

      <div v-if="showAddForm" class="flex flex-col gap-2 rounded-md border p-3">
        <Input
          v-model="newSourceName"
          placeholder="名称（如：镜像站）"
          class="h-8 text-sm"
        />
        <Input
          v-model="newSourceUrl"
          placeholder="更新源 URL"
          class="h-8 text-sm"
        />
        <div class="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            class="flex-1"
            @click="showAddForm = false; newSourceName = ''; newSourceUrl = ''"
          >
            取消
          </Button>
          <Button
            size="sm"
            class="flex-1"
            :disabled="!newSourceUrl.trim()"
            @click="addCustomSource"
          >
            添加
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
