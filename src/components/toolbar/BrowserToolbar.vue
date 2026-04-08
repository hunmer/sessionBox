<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ArrowLeft, ArrowRight, RotateCw, Loader2, Code2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTabStore } from '@/stores/tab'

const tabStore = useTabStore()
const urlInput = ref('')
const isFocused = ref(false)

/** 同步当前 tab URL 到输入框 */
watch(() => tabStore.activeTab?.url, (url) => {
  if (!isFocused.value) {
    urlInput.value = url ?? ''
  }
}, { immediate: true })

const navState = computed(() => tabStore.activeNavState)

function goBack() {
  if (tabStore.activeTabId) tabStore.goBack(tabStore.activeTabId)
}

function goForward() {
  if (tabStore.activeTabId) tabStore.goForward(tabStore.activeTabId)
}

function reload() {
  if (tabStore.activeTabId) tabStore.reload(tabStore.activeTabId)
}

function openDevTools() {
  if (tabStore.activeTabId) tabStore.openDevTools(tabStore.activeTabId)
}

function navigate() {
  const url = urlInput.value.trim()
  if (!url || !tabStore.activeTabId) return
  // 自动补全协议
  const finalUrl = url.match(/^https?:\/\//) ? url : `https://${url}`
  tabStore.navigate(tabStore.activeTabId, finalUrl)
}

function onFocus() {
  isFocused.value = true
  // 聚焦时全选
  const input = document.querySelector<HTMLInputElement>('.toolbar-url-input input')
  input?.select()
}

function onBlur() {
  isFocused.value = false
  urlInput.value = tabStore.activeTab?.url ?? ''
}
</script>

<template>
  <div class="flex items-center gap-2 h-[42px] px-2.5 border-b border-border bg-card/50">
    <!-- 后退 -->
    <Button
      variant="ghost" size="icon" class="h-7 w-7"
      :disabled="!navState.canGoBack"
      @click="goBack"
    >
      <ArrowLeft class="w-4 h-4" />
    </Button>

    <!-- 前进 -->
    <Button
      variant="ghost" size="icon" class="h-7 w-7"
      :disabled="!navState.canGoForward"
      @click="goForward"
    >
      <ArrowRight class="w-4 h-4" />
    </Button>

    <!-- 刷新/加载中 -->
    <Button variant="ghost" size="icon" class="h-7 w-7" @click="reload">
      <Loader2 v-if="navState.isLoading" class="w-4 h-4 animate-spin" />
      <RotateCw v-else class="w-4 h-4" />
    </Button>

    <!-- 地址栏 -->
    <Input
      v-model="urlInput"
      class="toolbar-url-input flex-1 h-7 text-xs bg-secondary/60 border-transparent focus:border-ring"
      placeholder="输入网址..."
      :disabled="!tabStore.activeTabId"
      @keydown.enter="navigate"
      @focus="onFocus"
      @blur="onBlur"
    />

    <!-- 开发者工具 -->
    <Button
      variant="ghost" size="icon" class="h-7 w-7"
      :disabled="!tabStore.activeTabId"
      @click="openDevTools"
    >
      <Code2 class="w-4 h-4" />
    </Button>
  </div>
</template>
