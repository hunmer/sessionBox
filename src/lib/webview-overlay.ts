/**
 * WebContentsView 覆盖层计数器
 * 多个 dialog 嵌套时，仅最后一个关闭才恢复 WebContentsView 显示
 */
import { ref } from 'vue'

let count = 0

/** 当前是否有覆盖层（dialog/dropdown/context-menu）遮挡了 webview */
export const isOverlayActive = ref(false)

export function webviewOverlayShow(): void {
  count = Math.max(0, count - 1)
  if (count === 0) {
    isOverlayActive.value = false
    window.api.tab.setOverlayVisible(true)
  }
}

export function webviewOverlayHide(): void {
  count++
  if (count === 1) {
    isOverlayActive.value = true
    window.api.tab.setOverlayVisible(false)
  }
}
