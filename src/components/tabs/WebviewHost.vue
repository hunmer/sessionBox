<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

interface WebviewSpec {
  tabId: string
  partition: string
  userAgent: string
  visible: boolean
  bounds: { x: number; y: number; width: number; height: number }
}

type WebviewElement = HTMLElement & { getWebContentsId: () => number }

const views = ref<Record<string, WebviewSpec>>({})
const elements = new Map<string, WebviewElement>()
const attachedTabIds = new Set<string>()
const attachingTabIds = new Set<string>()
const attachRetryTimers = new Map<string, ReturnType<typeof setTimeout>>()
const cleanups: Array<() => void> = []

function addView(request: { tabId: string; partition: string; userAgent: string }) {
  if (views.value[request.tabId]) return
  views.value[request.tabId] = {
    ...request,
    visible: false,
    bounds: { x: 0, y: 0, width: 0, height: 0 }
  }
}

function bindElement(tabId: string, element: unknown) {
  const webview = element as WebviewElement | null
  if (!webview || elements.get(tabId) === webview) return
  elements.set(tabId, webview)

  const attach = (attempt = 0) => {
    if (attachedTabIds.has(tabId) || attachingTabIds.has(tabId) || elements.get(tabId) !== webview) return

    try {
      const webContentsId = webview.getWebContentsId()
      if (webContentsId > 0) {
        attachingTabIds.add(tabId)
        console.log('[WebviewHost] attaching guest', { tabId, webContentsId, attempt })
        void window.api.tab.attachWebview(tabId, webContentsId).then((attached) => {
          attachingTabIds.delete(tabId)
          if (attached) {
            attachedTabIds.add(tabId)
            const timer = attachRetryTimers.get(tabId)
            if (timer) clearTimeout(timer)
            attachRetryTimers.delete(tabId)
            console.log('[WebviewHost] guest attached', { tabId, webContentsId })
            return
          }
          scheduleRetry(attempt + 1)
        }).catch((error) => {
          attachingTabIds.delete(tabId)
          console.error('[WebviewHost] attach guest failed', { tabId, webContentsId, error })
          scheduleRetry(attempt + 1)
        })
        return
      }
    } catch {
      // webview 尚未完成 attach，继续短时重试。
    }

    scheduleRetry(attempt + 1)
  }

  const scheduleRetry = (attempt: number) => {
    if (attempt > 100 || attachedTabIds.has(tabId)) return
    const timer = setTimeout(() => attach(attempt), 50)
    attachRetryTimers.set(tabId, timer)
  }

  webview.addEventListener('did-attach', () => attach())
  webview.addEventListener('dom-ready', () => attach())
  attach()
}

onMounted(async () => {
  cleanups.push(
    window.api.on('tab-webview:create', (payload) => addView(payload as WebviewSpec)),
    window.api.on('tab-webview:set-visible', (payload) => {
      const { tabId, visible } = payload as { tabId: string; visible: boolean }
      if (views.value[tabId]) views.value[tabId].visible = visible
    }),
    window.api.on('tab-webview:set-bounds', (payload) => {
      const { tabId, bounds } = payload as Pick<WebviewSpec, 'tabId' | 'bounds'>
      if (views.value[tabId]) views.value[tabId].bounds = bounds
    }),
    window.api.on('tab-webview:destroy', (payload) => {
      const { tabId } = payload as { tabId: string }
      delete views.value[tabId]
      elements.delete(tabId)
      attachedTabIds.delete(tabId)
      attachingTabIds.delete(tabId)
      const timer = attachRetryTimers.get(tabId)
      if (timer) clearTimeout(timer)
      attachRetryTimers.delete(tabId)
    })
  )

  const pending = await window.api.tab.listRequestedWebviews()
  for (const request of pending) addView(request)
  await nextTick()
})

onUnmounted(() => {
  for (const cleanup of cleanups) cleanup()
  for (const timer of attachRetryTimers.values()) clearTimeout(timer)
  attachRetryTimers.clear()
})
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-[5]">
    <webview
      v-for="view in views"
      :key="view.tabId"
      :ref="(element: unknown) => bindElement(view.tabId, element)"
      src="about:blank"
      allowpopups
      :partition="view.partition || undefined"
      :useragent="view.userAgent"
      class="fixed bg-background"
      :style="{
        display: view.visible ? 'flex' : 'none',
        left: `${view.bounds.x}px`,
        top: `${view.bounds.y}px`,
        width: `${view.bounds.width}px`,
        height: `${view.bounds.height}px`,
        pointerEvents: view.visible ? 'auto' : 'none'
      }"
    />
  </div>
</template>
