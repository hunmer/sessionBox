/**
 * WebContentsView 覆盖层计数器
 * 多个 dialog 嵌套时，仅最后一个关闭才恢复 WebContentsView 显示
 */
let count = 0

export function webviewOverlayShow(): void {
  count = Math.max(0, count - 1)
  if (count === 0) {
    window.api.tab.setOverlayVisible(true)
  }
}

export function webviewOverlayHide(): void {
  count++
  if (count === 1) {
    window.api.tab.setOverlayVisible(false)
  }
}
