<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string
}

interface DownloadProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

// 状态
const isOpen = ref(false)
const isChecking = ref(false)
const updateInfo = ref<UpdateInfo | null>(null)
const isDownloading = ref(false)
const downloadProgress = ref<DownloadProgress | null>(null)
const isDownloaded = ref(false)
const errorMessage = ref<string | null>(null)
const currentVersion = ref<string>('')

// 清理函数数组
const cleanupFns: (() => void)[] = []

// 格式化文件大小
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 格式化下载速度
const formatSpeed = (bytesPerSecond: number): string => {
  return formatBytes(bytesPerSecond) + '/s'
}

// 下载进度百分比
const progressPercent = computed(() => {
  return downloadProgress.value?.percent ?? 0
})

// 渲染 release notes（支持 HTML 和纯文本）
const renderedReleaseNotes = computed(() => {
  const notes = updateInfo.value?.releaseNotes
  if (!notes) return ''

  // electron-updater 的 releaseNotes 可能是字符串或对象数组
  if (typeof notes === 'string') {
    // 如果包含 HTML 标签，直接返回
    if (/<[a-z][\s\S]*>/i.test(notes)) {
      return notes
    }
    // 纯文本转为 HTML（保留换行）
    return notes
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
  }

  // 如果是数组（GitHub Release 格式）
  if (Array.isArray(notes)) {
    return notes
      .map((note) => {
        if (typeof note === 'string') return note
        return note.note || ''
      })
      .join('<br>')
  }

  return String(notes)
})

// 检查更新
const checkForUpdates = async () => {
  if (!window.api?.updater) return

  isChecking.value = true
  errorMessage.value = null

  try {
    const result = await window.api.updater.check()
    if (result.success && result.updateInfo) {
      updateInfo.value = result.updateInfo
      isOpen.value = true
    }
  } catch (error: unknown) {
    console.error('[UpdateNotification] 检查更新失败:', error)
    errorMessage.value = (error as Error).message || '检查更新失败'
  } finally {
    isChecking.value = false
  }
}

// 下载更新
const downloadUpdate = async () => {
  if (!window.api?.updater) return

  isDownloading.value = true
  downloadProgress.value = null
  errorMessage.value = null

  try {
    const result = await window.api.updater.download()
    if (!result.success) {
      errorMessage.value = result.error || '下载失败'
    }
  } catch (error: unknown) {
    console.error('[UpdateNotification] 下载更新失败:', error)
    errorMessage.value = (error as Error).message || '下载失败'
  } finally {
    isDownloading.value = false
  }
}

// 安装更新
const installUpdate = async () => {
  if (!window.api?.updater) return

  try {
    await window.api.updater.install()
    // 安装会重启应用
  } catch (error: unknown) {
    console.error('[UpdateNotification] 安装更新失败:', error)
    errorMessage.value = (error as Error).message || '安装失败'
  }
}

// 稍后提醒
const remindLater = () => {
  isOpen.value = false
}

// 初始化事件监听
onMounted(async () => {
  if (!window.api?.updater) {
    console.log('[UpdateNotification] 非 Electron 环境，跳过更新检查')
    return
  }

  // 获取当前版本
  try {
    const versionResult = await window.api.updater.getVersion()
    if (versionResult.success) {
      currentVersion.value = versionResult.version
    }
  } catch (e) {
    console.warn('[UpdateNotification] 获取版本失败:', e)
  }

  // 监听发现新版本
  const unsubAvailable = window.api.updater.onAvailable((info) => {
    console.log('[UpdateNotification] 发现新版本:', info.version)
    updateInfo.value = info
    isOpen.value = true
    isChecking.value = false
  })
  cleanupFns.push(unsubAvailable)

  // 监听已是最新版本
  const unsubNotAvailable = window.api.updater.onNotAvailable(() => {
    console.log('[UpdateNotification] 当前已是最新版本')
    isChecking.value = false
  })
  cleanupFns.push(unsubNotAvailable)

  // 监听下载进度
  const unsubProgress = window.api.updater.onDownloadProgress((progress) => {
    console.log(`[UpdateNotification] 下载进度: ${progress.percent.toFixed(1)}%`)
    downloadProgress.value = progress
  })
  cleanupFns.push(unsubProgress)

  // 监听下载完成
  const unsubDownloaded = window.api.updater.onDownloaded(() => {
    console.log('[UpdateNotification] 下载完成')
    isDownloading.value = false
    isDownloaded.value = true
    downloadProgress.value = null
  })
  cleanupFns.push(unsubDownloaded)

  // 监听错误
  const unsubError = window.api.updater.onError((error) => {
    console.error('[UpdateNotification] 更新错误:', error.message)
    errorMessage.value = error.message
    isChecking.value = false
    isDownloading.value = false
  })
  cleanupFns.push(unsubError)
})

// 清理事件监听
onUnmounted(() => {
  cleanupFns.forEach((fn) => fn())
})
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <span class="text-lg">发现新版本</span>
          <span
            v-if="updateInfo"
            class="rounded bg-green-100 px-2 py-0.5 text-sm font-medium text-green-700 dark:bg-green-900 dark:text-green-300"
          >
            v{{ updateInfo.version }}
          </span>
        </DialogTitle>
        <DialogDescription>
          <span v-if="currentVersion">
            当前版本: v{{ currentVersion }}
          </span>
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-4">
        <!-- 更新信息 -->
        <div
          v-if="updateInfo && !isDownloading && !isDownloaded"
          class="space-y-2"
        >
          <p class="text-sm text-muted-foreground">
            有新版本可用，建议更新以获取最新功能和修复。
          </p>
          <div
            v-if="updateInfo.releaseNotes"
            class="max-h-60 overflow-y-auto rounded-md bg-muted p-3"
          >
            <div
              class="prose prose-sm dark:prose-invert max-w-none text-sm"
              v-html="renderedReleaseNotes"
            />
          </div>
        </div>

        <!-- 下载进度 -->
        <div
          v-if="isDownloading && downloadProgress"
          class="space-y-2"
        >
          <div class="flex justify-between text-sm text-muted-foreground">
            <span>正在下载...</span>
            <span>{{ progressPercent.toFixed(1) }}%</span>
          </div>
          <!-- 简单进度条 -->
          <div class="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              class="h-full bg-primary transition-all duration-300"
              :style="{ width: `${progressPercent}%` }"
            />
          </div>
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>{{ formatBytes(downloadProgress.transferred) }} / {{ formatBytes(downloadProgress.total) }}</span>
            <span>{{ formatSpeed(downloadProgress.bytesPerSecond) }}</span>
          </div>
        </div>

        <!-- 下载完成 -->
        <div
          v-if="isDownloaded"
          class="rounded-md bg-green-50 p-3 dark:bg-green-950"
        >
          <p class="text-sm text-green-700 dark:text-green-300">
            更新已下载完成，点击"立即安装"重启应用并安装更新。
          </p>
        </div>

        <!-- 错误提示 -->
        <div
          v-if="errorMessage"
          class="rounded-md bg-red-50 p-3 dark:bg-red-950"
        >
          <p class="text-sm text-red-700 dark:text-red-300">
            {{ errorMessage }}
          </p>
        </div>
      </div>

      <DialogFooter class="flex gap-2 sm:gap-0">
        <!-- 初始状态：下载或稍后提醒 -->
        <template v-if="!isDownloading && !isDownloaded">
          <Button
            variant="outline"
            @click="remindLater"
          >
            稍后提醒
          </Button>
          <Button
            :disabled="isChecking"
            @click="downloadUpdate"
          >
            {{ isChecking ? '检查中...' : '立即下载' }}
          </Button>
        </template>

        <!-- 下载中 -->
        <template v-else-if="isDownloading">
          <Button
            variant="outline"
            disabled
          >
            下载中...
          </Button>
        </template>

        <!-- 下载完成：安装或稍后 -->
        <template v-else-if="isDownloaded">
          <Button
            variant="outline"
            @click="remindLater"
          >
            稍后安装
          </Button>
          <Button @click="installUpdate">
            立即安装
          </Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.prose {
  line-height: 1.6;
  word-break: break-word;
  overflow-wrap: break-word;
}
.prose :deep(a) {
  color: hsl(var(--primary));
  text-decoration: underline;
}
.prose :deep(ul),
.prose :deep(ol) {
  padding-left: 1.25em;
  margin: 0.5em 0;
}
.prose :deep(li) {
  margin: 0.25em 0;
}
.prose :deep(code) {
  background: hsl(var(--muted));
  padding: 0.125em 0.375em;
  border-radius: 0.25em;
  font-size: 0.875em;
}
.prose :deep(pre) {
  background: hsl(var(--muted));
  padding: 0.75em;
  border-radius: 0.375em;
  overflow-x: auto;
  margin: 0.5em 0;
}
.prose :deep(pre code) {
  background: transparent;
  padding: 0;
}
.prose :deep(img) {
  max-width: 100%;
  height: auto;
}
</style>
