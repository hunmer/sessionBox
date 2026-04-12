import { ref, provide, inject, type InjectionKey } from 'vue'

// ====== 拖拽数据协议 ======

export interface DragData {
  type: 'folder' | 'bookmark'
  id: string
}

export const DRAG_DATA_MIME = 'application/x-sessionbox-drag'

// ====== 全局拖拽状态 ======

export interface DragState {
  /** 当前正在拖拽的项 */
  data: DragData | null
  /** 当前拖拽悬浮的目标 id */
  overId: string | null
  /** 当前落点位置 */
  dropPosition: 'before' | 'after' | 'inside' | null
}

const DRAG_STATE_KEY: InjectionKey<ReturnType<typeof createDragState>> = Symbol('bookmark-drag-state')

function createDragState() {
  const state = ref<DragState>({
    data: null,
    overId: null,
    dropPosition: null
  })

  function startDrag(data: DragData) {
    state.value = { data, overId: null, dropPosition: null }
  }

  function updateOver(overId: string | null, dropPosition: 'before' | 'after' | 'inside' | null) {
    state.value = { ...state.value, overId, dropPosition }
  }

  function endDrag() {
    state.value = { data: null, overId: null, dropPosition: null }
  }

  return { state, startDrag, updateOver, endDrag }
}

export function provideDragState() {
  const dragCtx = createDragState()
  provide(DRAG_STATE_KEY, dragCtx)
  return dragCtx
}

export function useDragState() {
  const ctx = inject(DRAG_STATE_KEY)
  if (!ctx) throw new Error('useDragState must be used inside a provider')
  return ctx
}

// ====== 落点位置计算 ======

/**
 * 根据鼠标在元素上的 Y 坐标计算落点位置
 * - 上 25% → before
 * - 下 25% → after
 * - 中间 50% → inside
 */
export function getDropPosition(event: DragEvent, element: HTMLElement): 'before' | 'after' | 'inside' {
  const rect = element.getBoundingClientRect()
  const y = event.clientY - rect.top
  const threshold = rect.height * 0.25

  if (y < threshold) return 'before'
  if (y > rect.height - threshold) return 'after'
  return 'inside'
}

// ====== 拖拽辅助 ======

/** 设置拖拽数据 */
export function setDragData(event: DragEvent, data: DragData) {
  event.dataTransfer!.setData(DRAG_DATA_MIME, JSON.stringify(data))
  event.dataTransfer!.effectAllowed = 'move'
}

/** 读取拖拽数据 */
export function getDragData(event: DragEvent): DragData | null {
  const raw = event.dataTransfer!.getData(DRAG_DATA_MIME)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DragData
  } catch {
    return null
  }
}
