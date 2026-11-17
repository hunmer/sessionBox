import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { collectPathKeys, LINE_INDENT, LINE_R, type NodeInfo } from './types'

export interface BranchPath {
  key: string
  d: string
  stroke: string
}

/**
 * SVG 分支连线（对照源 useBranchLines）：
 * 三层覆盖 —— base 灰色 SMIL 描画入场 / hover 半透明点亮 / active 选中链路全亮。
 *
 * 两个关键实现点（从 React 移植版验证带回）：
 * 1. 动态颜色走内联 style —— SVG presentation attribute 不支持 var()，
 *    `stroke="var(--primary)"` 会被判无效导致整层线隐形；base 灰线走 CSS 类。
 * 2. rAF 防重入守卫在卸载清理时必须归零，否则一次 cancel 之后 schedule
 *    永远被守卫拦截，测量死锁（SVG 停留在初始 1×1 空壳）。
 */
export function useBranchLines(options: {
  infoMap: Ref<Map<string, NodeInfo>>
  visibleIds: Ref<Set<string>>
  selectedKey: Ref<string | undefined>
  layerRef: Ref<HTMLDivElement | null>
  rowsRef: Ref<HTMLDivElement | null>
}) {
  const { infoMap, visibleIds, selectedKey, layerRef, rowsRef } = options

  const paths = ref<BranchPath[]>([])
  const size = ref({ w: 1, h: 1 })

  const hoverId = ref<string | null>(null)
  let hoverTimer: number | null = null

  /** hover 即时点亮，移出延迟 120ms 清除（同源） */
  const setHover = (id: string | null) => {
    if (hoverTimer !== null) {
      window.clearTimeout(hoverTimer)
      hoverTimer = null
    }
    if (id) {
      hoverId.value = id
    } else {
      hoverTimer = window.setTimeout(() => (hoverId.value = null), 120)
    }
  }

  const measure = () => {
    const layer = layerRef.value
    const rowsRoot = rowsRef.value
    if (!layer || !rowsRoot) return
    const layerRect = layer.getBoundingClientRect()
    const rowEls = Array.from(rowsRoot.querySelectorAll<HTMLElement>('[data-ft-node-id]'))
    const rowMap = new Map(rowEls.map((el) => [el.dataset.ftNodeId as string, el]))

    const next: BranchPath[] = []
    for (const el of rowEls) {
      const id = el.dataset.ftNodeId as string
      if (!visibleIds.value.has(id)) continue // 折叠动画期间仍在 DOM 的行不画线
      const info = infoMap.value.get(id)
      if (!info?.parent) continue
      const parentEl = rowMap.get(info.parent.id)
      if (!parentEl) continue

      const rowRect = el.getBoundingClientRect()
      const parentRect = parentEl.getBoundingClientRect()
      // padding-left 缩进代替 @he-tree wrapper，iconOffset 恒加 (level-1)*LINE_INDENT
      const iconOffset = (info.level - 1) * LINE_INDENT
      const endX = rowRect.left - layerRect.left + 7 + iconOffset
      const trunkX = endX - 10
      const startY = parentRect.bottom - layerRect.top
      const y = rowRect.top - layerRect.top + rowRect.height / 2
      const turnY = Math.max(startY, y - LINE_R)

      next.push({
        key: `${info.parent.id}->${id}`,
        d: `M ${trunkX} ${startY} L ${trunkX} ${turnY} A ${LINE_R} ${LINE_R} 0 0 0 ${trunkX + LINE_R} ${y} L ${endX} ${y}`,
        // 内联 style 支持 var()；presentation attribute 不支持
        stroke: info.parent.color ?? 'var(--primary)',
      })
    }
    paths.value = next
    size.value = {
      w: Math.max(1, Math.ceil(layer.scrollWidth)),
      h: Math.max(1, Math.ceil(layer.scrollHeight)),
    }
  }

  let frame = 0
  const schedule = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      measure()
    })
  }

  // 可见集合 / 数据变化后（DOM patch 完成、下一帧）重测
  watch([visibleIds, infoMap], () => nextTick(schedule))

  let ro: ResizeObserver | null = null
  const onWindowResize = () => schedule()

  onMounted(() => {
    schedule()
    // 展开/收起高度动画期间持续重测（行位置随 grid-rows 过渡连续变化）
    ro = new ResizeObserver(schedule)
    if (rowsRef.value) ro.observe(rowsRef.value)
    window.addEventListener('resize', onWindowResize)
  })

  onBeforeUnmount(() => {
    // 守卫归零：防止 cancel 后调度死锁
    if (frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
    if (hoverTimer !== null) {
      window.clearTimeout(hoverTimer)
      hoverTimer = null
    }
    ro?.disconnect()
    window.removeEventListener('resize', onWindowResize)
  })

  const activeKeys = computed(() => collectPathKeys(selectedKey.value ?? null, infoMap.value))
  const hoverKeys = computed(() => collectPathKeys(hoverId.value, infoMap.value))

  return { paths, size, activeKeys, hoverKeys, setHover }
}
