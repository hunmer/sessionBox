<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useNotification } from '@/composables/useNotification'
import { useHomepageStore, type HomepageOpenMethod } from '@/stores/homepage'

const homepageStore = useHomepageStore()
const notify = useNotification()
const isDefaultBrowser = ref(false)
const minimizeOnClose = ref(true)
const isWindows = navigator.userAgent.includes('Windows')
let defaultBrowserPollTimer: ReturnType<typeof setInterval> | null = null
let defaultBrowserPollStopTimer: ReturnType<typeof setTimeout> | null = null

function stopDefaultBrowserPolling() {
  if (defaultBrowserPollTimer) {
    clearInterval(defaultBrowserPollTimer)
    defaultBrowserPollTimer = null
  }
  if (defaultBrowserPollStopTimer) {
    clearTimeout(defaultBrowserPollStopTimer)
    defaultBrowserPollStopTimer = null
  }
}

function startDefaultBrowserPolling(targetValue: boolean) {
  stopDefaultBrowserPolling()

  defaultBrowserPollTimer = setInterval(async () => {
    await checkDefaultBrowser()
    if (isDefaultBrowser.value === targetValue) {
      stopDefaultBrowserPolling()
    }
  }, 1200)

  defaultBrowserPollStopTimer = setTimeout(() => {
    stopDefaultBrowserPolling()
  }, 30000)
}

async function checkDefaultBrowser() {
  isDefaultBrowser.value = await window.api.settings.checkDefaultBrowser()
}

async function toggleDefaultBrowser() {
  const next = !isDefaultBrowser.value
  const result = await window.api.settings.setDefaultBrowser(next)
  await checkDefaultBrowser()

  if (result.requiresSystemSelection) {
    startDefaultBrowserPolling(next)
    notify.info({
      title: result.openedSystemSettings ? '已打开系统默认应用设置' : '请手动打开系统默认应用设置',
      description: next
        ? '请在 Windows 的“默认应用 > Web 浏览器”中将 SessionBox 设为默认浏览器。'
        : '请在 Windows 的“默认应用 > Web 浏览器”中改选其他浏览器。'
    })
    return
  }

  if (result.isDefault) {
    notify.success('SessionBox 已设为默认浏览器')
  } else {
    notify.warning('系统未接受默认浏览器变更')
  }
}

async function toggleMinimizeOnClose() {
  const next = !minimizeOnClose.value
  await window.api.settings.setMinimizeOnClose(next)
  minimizeOnClose.value = next
}

onMounted(async () => {
  await checkDefaultBrowser()
  minimizeOnClose.value = await window.api.settings.getMinimizeOnClose()
})

onBeforeUnmount(() => {
  stopDefaultBrowserPolling()
})

const openMethodOptions: { value: HomepageOpenMethod; label: string }[] = [
  { value: 'newTab', label: '新标签页' },
  { value: 'currentTab', label: '当前标签页' },
]
</script>

<template>
  <h3 class="text-sm font-medium mb-3">
    主页设置
  </h3>
  <div class="space-y-3">
    <div>
      <label class="text-xs text-muted-foreground mb-1 block">主页地址</label>
      <Input
        :model-value="homepageStore.settings.url"
        placeholder="https://example.com"
        @update:model-value="homepageStore.updateSettings({ url: $event })"
      />
    </div>

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

  <h3 class="text-sm font-medium mb-3 mt-6">
    默认浏览器
  </h3>
  <div class="flex items-center justify-between">
    <div>
      <label class="text-xs text-muted-foreground">将 SessionBox 设为默认浏览器</label>
      <p class="text-xs text-muted-foreground/60 mt-0.5">
        {{ isWindows ? 'Windows 需要在系统默认应用里确认 SessionBox 作为 Web 浏览器。' : '外部链接将优先在 SessionBox 中打开。' }}
      </p>
    </div>
    <button
      role="switch"
      :aria-checked="isDefaultBrowser"
      class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
      :class="isDefaultBrowser ? 'bg-primary' : 'bg-input'"
      @click="toggleDefaultBrowser"
    >
      <span
        class="pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform"
        :class="isDefaultBrowser ? 'translate-x-4' : 'translate-x-0'"
      />
    </button>
  </div>
  <p
    v-if="isWindows && !isDefaultBrowser"
    class="text-xs text-muted-foreground/60 mt-2"
  >
    如果系统“默认应用”的 Web 浏览器列表里没有 SessionBox，重新安装此版本后会自动补齐浏览器注册信息。
  </p>

  <h3 class="text-sm font-medium mb-3 mt-6">
    窗口行为
  </h3>
  <div class="flex items-center justify-between">
    <div>
      <label class="text-xs text-muted-foreground">关闭时最小化到托盘</label>
      <p class="text-xs text-muted-foreground/60 mt-0.5">
        关闭后应用将继续在后台运行
      </p>
    </div>
    <button
      role="switch"
      :aria-checked="minimizeOnClose"
      class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
      :class="minimizeOnClose ? 'bg-primary' : 'bg-input'"
      @click="toggleMinimizeOnClose"
    >
      <span
        class="pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform"
        :class="minimizeOnClose ? 'translate-x-4' : 'translate-x-0'"
      />
    </button>
  </div>
</template>
