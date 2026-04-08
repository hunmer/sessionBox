import { onMounted, onUnmounted } from 'vue'

type EventCallback = (...args: unknown[]) => void

/**
 * IPC 事件监听组合函数
 * 组件卸载时自动清理监听器
 */
export function useIpcEvent(event: string, callback: EventCallback) {
  let cleanup: (() => void) | null = null

  onMounted(() => {
    cleanup = window.api.on(event, callback)
  })

  onUnmounted(() => {
    cleanup?.()
  })
}
