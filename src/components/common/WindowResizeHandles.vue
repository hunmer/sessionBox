<script setup lang="ts">
// Windows 上 transparent 无边框窗口没有原生 resize 边框，
// 用不可见边缘把手触发主进程 setBounds 模拟缩放
interface ResizeEdge {
  dir: 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
  class: string
}

const EDGES: ResizeEdge[] = [
  { dir: 'n', class: 'top-0 inset-x-2 h-[5px] cursor-ns-resize' },
  { dir: 's', class: 'bottom-0 inset-x-2 h-[5px] cursor-ns-resize' },
  { dir: 'w', class: 'left-0 inset-y-2 w-[5px] cursor-ew-resize' },
  { dir: 'e', class: 'right-0 inset-y-2 w-[5px] cursor-ew-resize' },
  { dir: 'nw', class: 'top-0 left-0 w-[12px] h-[12px] cursor-nwse-resize' },
  { dir: 'ne', class: 'top-0 right-0 w-[12px] h-[12px] cursor-nesw-resize' },
  { dir: 'sw', class: 'bottom-0 left-0 w-[12px] h-[12px] cursor-nesw-resize' },
  { dir: 'se', class: 'bottom-0 right-0 w-[12px] h-[12px] cursor-nwse-resize' }
]

function onPointerDown(e: PointerEvent, dir: ResizeEdge['dir']): void {
  if (e.button !== 0) return
  // 指针捕获保证光标移出窗口后松开仍能收到 pointerup
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  window.api.window.startResize(dir)
}

function onPointerUp(): void {
  window.api.window.endResize()
}
</script>

<template>
  <!-- z-index 高于顶部拖拽条(z-50)，边缘缩放优先于拖拽移动 -->
  <div aria-hidden="true" class="pointer-events-none absolute inset-0 z-[60]">
    <div
      v-for="edge in EDGES"
      :key="edge.dir"
      class="pointer-events-auto absolute"
      :class="edge.class"
      style="-webkit-app-region: no-drag"
      @pointerdown="onPointerDown($event, edge.dir)"
      @pointerup="onPointerUp"
    />
  </div>
</template>
