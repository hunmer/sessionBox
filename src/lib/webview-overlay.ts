/**
 * 基于真实 DOM 浮层检测 WebContentsView 是否应隐藏。
 * 比事件计数器更稳，能覆盖 HMR 后局部状态丢失的场景。
 */
import { computed, ref } from 'vue'

const BLOCKING_OVERLAY_SELECTOR = [
  '[data-slot="dialog-overlay"][data-state="open"]',
  '[data-slot="dialog-content"][data-state="open"]',
  '[data-slot="alert-dialog-overlay"][data-state="open"]',
  '[data-slot="alert-dialog-content"][data-state="open"]',
  '[data-slot="sheet-overlay"][data-state="open"]',
  '[data-slot="sheet-content"][data-state="open"]',
  '[data-slot="dropdown-menu-content"][data-state="open"]',
  '[data-slot="context-menu-content"][data-state="open"]',
  '[data-slot="popover-content"][data-state="open"]'
].join(',')

let observer: MutationObserver | null = null
let rafId: number | null = null

/** 当前是否有覆盖层（dialog/dropdown/context-menu/popover）遮挡了 webview */
export const isOverlayActive = ref(false)
export const isForcedWebviewBlocked = ref(false)
export const isWebviewBlocked = computed(() => isOverlayActive.value || isForcedWebviewBlocked.value)

function isElementVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return true

  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false
  }

  return element.getClientRects().length > 0
}

function computeOverlayActive(): boolean {
  if (typeof document === 'undefined') return false

  return Array.from(document.querySelectorAll(BLOCKING_OVERLAY_SELECTOR)).some(isElementVisible)
}

export function refreshWebviewOverlayState(): void {
  isOverlayActive.value = computeOverlayActive()
}

function scheduleOverlayStateSync(): void {
  if (typeof window === 'undefined' || rafId != null) return

  rafId = window.requestAnimationFrame(() => {
    rafId = null
    refreshWebviewOverlayState()
  })
}

export function startWebviewOverlayDetection(): void {
  if (typeof document === 'undefined') return

  if (!observer && document.body) {
    observer = new MutationObserver(() => scheduleOverlayStateSync())
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state', 'style', 'class', 'hidden', 'aria-hidden']
    })
  }

  refreshWebviewOverlayState()
}

export function stopWebviewOverlayDetection(): void {
  observer?.disconnect()
  observer = null

  if (rafId != null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(rafId)
    rafId = null
  }

  isOverlayActive.value = false
  isForcedWebviewBlocked.value = false
}

export function setForcedWebviewBlocked(blocked: boolean): void {
  isForcedWebviewBlocked.value = blocked
}

/**
 * 兼容已有 open/close 钩子。
 * 实际状态以真实 DOM 为准，这里只负责触发一次重算。
 */
export function webviewOverlayShow(): void {
  scheduleOverlayStateSync()
}

export function webviewOverlayHide(): void {
  scheduleOverlayStateSync()
}
