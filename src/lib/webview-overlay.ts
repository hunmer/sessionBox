/**
 * WebContentsView 覆盖层计数器
 * 多个 dialog 嵌套时，仅最后一个关闭才恢复 WebContentsView 显示
 */
import { ref } from 'vue'

let count = 0

/** 当前是否有覆盖层（dialog/dropdown/context-menu）遮挡了 webview */
export const isOverlayActive = ref(false)

/** 恢复 webview 可见性前的判断回调，返回 false 则跳过恢复 */
let beforeRestore: (() => boolean) | null = null

/** 设置恢复 webview 前的判断回调（由 App.vue 注入） */
export function setOverlayRestoreGuard(guard: () => boolean): void {
  beforeRestore = guard
}

export function webviewOverlayShow(): void {
  count = Math.max(0, count - 1)
  if (count === 0) {
    isOverlayActive.value = false
    const shouldShow = beforeRestore?.() ?? true
    if (shouldShow) {
      window.api.tab.setOverlayVisible(true)
    }
  }
}

export function webviewOverlayHide(): void {
  count++
  if (count === 1) {
    isOverlayActive.value = true
    window.api.tab.setOverlayVisible(false)
  }
}
