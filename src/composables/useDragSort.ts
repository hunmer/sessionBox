import { type Ref } from 'vue'
import draggable from 'vuedraggable'

/**
 * 拖拽排序组合函数
 * 封装 vuedraggable 的通用配置
 */
export function useDragSort<T extends { id: string; order: number }>(list: Ref<T[]>) {
  /** 拖拽结束后同步 order 并调用回调 */
  function onDragEnd(reorderFn: (ids: string[]) => Promise<void>) {
    const ids = list.value.map((item) => item.id)
    // 本地同步 order
    list.value.forEach((item, i) => (item.order = i))
    // 通知主进程
    reorderFn(ids)
  }

  return { draggable, onDragEnd }
}
