<script setup lang="ts">
import { ref, computed, markRaw, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { VueFlow, useVueFlow, ConnectionMode, MarkerType } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import '@vue-flow/node-resizer/dist/style.css'

import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
} from '@/components/ui/menubar'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { useWorkflowStore } from '@/stores/workflow'
import CustomNodeWrapper from './CustomNodeWrapper.vue'
import CustomEdge from './CustomEdge.vue'
import NodeSidebar from './NodeSidebar.vue'
import RightPanel from './RightPanel.vue'
import ExecutionBar from './ExecutionBar.vue'
import WorkflowListDialog from './WorkflowListDialog.vue'
import NodeSelectDialog from './NodeSelectDialog.vue'
import { Plus, FolderOpen, Import, RotateCcw, RotateCw } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useNotification } from '@/composables/useNotification'

const store = useWorkflowStore()
const notify = useNotification()
const listDialogOpen = ref(false)
const nodeSelectOpen = ref(false)
const isEditingName = ref(false)
const editingName = ref('')
const FLOW_ID = 'workflow-editor-flow'

// ====== 连线放手快速添加节点 ======
let connectSource: { nodeId: string; handleId: string | null } | null = null
let connectSucceeded = false
let connectDropPosition: { x: number; y: number } | null = null

function onConnectStart({ nodeId, handleId }: { nodeId: string | null; handleId: string | null }) {
  connectSource = nodeId ? { nodeId, handleId } : null
  connectSucceeded = false
  connectDropPosition = null
}

function onConnectEnd(event: MouseEvent | TouchEvent) {
  if (connectSucceeded || !connectSource) {
    connectSource = null
    return
  }

  // 计算放手位置对应的画布坐标
  const bounds = vueFlowRef.value?.getBoundingClientRect()
  if (bounds) {
    const clientX = 'clientX' in event ? event.clientX : 0
    const clientY = 'clientY' in event ? event.clientY : 0
    connectDropPosition = project({ x: clientX - bounds.left, y: clientY - bounds.top })
  }

  nodeSelectOpen.value = true
}

function onNodeSelectFromDialog(type: string) {
  if (!connectSource || !store.currentWorkflow) return

  const sourceNode = store.currentWorkflow.nodes.find(n => n.id === connectSource!.nodeId)
  if (!sourceNode) return

  // 优先使用放手位置，否则在源节点右侧偏移
  const position = connectDropPosition || {
    x: sourceNode.position.x + 250,
    y: sourceNode.position.y,
  }

  const newNode = store.addNode(type, position)
  store.addEdge(connectSource.nodeId, newNode.id, connectSource.handleId, null)

  // 重置状态
  connectSource = null
  connectDropPosition = null
}

// ====== 边加号按钮：在两节点之间插入新节点 ======
let insertEdgeId: string | null = null
let insertSourceId: string | null = null
let insertTargetId: string | null = null

function onEdgeInsertNode(edgeId: string, sourceId: string, targetId: string) {
  insertEdgeId = edgeId
  insertSourceId = sourceId
  insertTargetId = targetId
  nodeSelectOpen.value = true
}

function onNodeSelectFromEdge(type: string) {
  if (!insertSourceId || !insertTargetId || !store.currentWorkflow) return

  const sourceNode = store.currentWorkflow.nodes.find(n => n.id === insertSourceId)
  if (!sourceNode) return

  const targetNode = store.currentWorkflow.nodes.find(n => n.id === insertTargetId)
  if (!targetNode) return

  // 新节点位置：源节点与目标节点中点
  const position = {
    x: (sourceNode.position.x + targetNode.position.x) / 2,
    y: (sourceNode.position.y + targetNode.position.y) / 2,
  }

  const newNode = store.addNode(type, position)

  // 删除原来的边
  if (insertEdgeId) {
    store.removeEdge(insertEdgeId)
  }

  // 创建两条新边：source -> newNode -> target
  store.addEdge(insertSourceId, newNode.id, null, null)
  store.addEdge(newNode.id, insertTargetId, null, null)

  // 重置状态
  insertEdgeId = null
  insertSourceId = null
  insertTargetId = null
}

function onNodeSelectDialogClose(open: boolean) {
  nodeSelectOpen.value = open
  if (!open) {
    // 对话框关闭时清理两种来源的状态
    insertEdgeId = null
    insertSourceId = null
    insertTargetId = null
    connectSource = null
    connectDropPosition = null
  }
}

// ====== ExecutionBar 折叠/展开 & 面板大小 ======
const EXEC_PANEL_SIZE_KEY = 'workflow-exec-panel-size'
const executionBarExpanded = ref(false)
const savedExecPanelSize = ref(Number(localStorage.getItem(EXEC_PANEL_SIZE_KEY)) || 25)
const execPanelRef = ref<InstanceType<typeof ResizablePanel> | null>(null)

function onExecBarResize(sizes: number[]) {
  if (executionBarExpanded.value && sizes.length === 2) {
    savedExecPanelSize.value = sizes[1]
    localStorage.setItem(EXEC_PANEL_SIZE_KEY, String(sizes[1]))
  }
}

watch(executionBarExpanded, (expanded) => {
  if (expanded) {
    nextTick(() => {
      nextTick(() => {
        execPanelRef.value?.resize(savedExecPanelSize.value)
      })
    })
  }
})

// ====== 面板尺寸持久化 ======
const PANEL_SIZES_KEY = 'workflow-panel-sizes'
const DEFAULT_SIZES = [18, 52, 30] // 左侧节点列表 / 中间画布 / 右侧属性面板

function loadPanelSizes(): number[] {
  try {
    const raw = localStorage.getItem(PANEL_SIZES_KEY)
    return raw ? JSON.parse(raw) : DEFAULT_SIZES
  } catch {
    return DEFAULT_SIZES
  }
}

const panelSizes = ref<number[]>(loadPanelSizes())

function handlePanelResize(sizes: number[]) {
  panelSizes.value = sizes
  localStorage.setItem(PANEL_SIZES_KEY, JSON.stringify(sizes))
}

// 自动保存草稿：currentWorkflow 深度变化时持久化
watch(() => store.currentWorkflow, (val) => {
  if (val) store.saveDraft()
}, { deep: true })

const {
  onNodesChange,
  onEdgesChange,
  project,
  vueFlowRef,
  onViewportChange,
  setViewport,
  fitView,
  zoomIn,
  zoomOut,
  zoomTo,
  updateNodeInternals,
  getSelectedNodes,
  getSelectedEdges,
  findNode,
  addSelectedNodes,
  nodesSelectionActive,
  getNodes,
} = useVueFlow(FLOW_ID)

onNodesChange((changes) => {
  for (const change of changes) {
    if (change.type === 'remove') {
      store.removeNode(change.id)
    } else if (change.type === 'position' && change.position) {
      store.updateNodePosition(change.id, change.position)
    }
  }
})

onEdgesChange((changes) => {
  for (const change of changes) {
    if (change.type === 'remove') {
      store.removeEdge(change.id)
    }
  }
})

const nodeTypes = {
  custom: markRaw(CustomNodeWrapper),
}

const edgeTypes = {
  custom: markRaw(CustomEdge),
}

// ====== Viewport 持久化 ======
const VIEWPORT_KEY = (id: string) => `workflow-vp-${id}`

function getSavedViewport(workflowId: string): { zoom: number; x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY(workflowId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

let cleanupFileUpdates: (() => void) | null = null

let viewportSaveTimer: ReturnType<typeof setTimeout> | null = null
onViewportChange(({ zoom, x, y }) => {
  if (!store.currentWorkflow) return
  if (viewportSaveTimer) clearTimeout(viewportSaveTimer)
  viewportSaveTimer = setTimeout(() => {
    localStorage.setItem(
      VIEWPORT_KEY(store.currentWorkflow!.id),
      JSON.stringify({ zoom, x, y }),
    )
  }, 300)
})

watch(() => store.currentWorkflow?.id, async (id) => {
  if (!id) return
  await nextTick()
  const saved = getSavedViewport(id)
  if (saved) {
    setViewport(saved)
  } else {
    fitView()
  }
})

const nodes = computed(() =>
  (store.currentWorkflow?.nodes || []).map((n) => ({
    id: n.id,
    type: 'custom',
    position: n.position,
    data: { ...n.data, label: n.label, nodeType: n.type },
  })),
)

const edges = computed(() =>
  (store.currentWorkflow?.edges || []).map((e) => ({
    id: e.id,
    type: 'custom',
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    animated: true,
    markerEnd: MarkerType.ArrowClosed,
  })),
)

function handleConnect(params: any) {
  connectSucceeded = true
  store.addEdge(
    params.source,
    params.target,
    params.sourceHandle ?? null,
    params.targetHandle ?? null,
  )
}

function handleNodesInitialized(nodes: any[]) {
  nextTick(() => {
    updateNodeInternals(nodes.map((node) => node.id))
  })
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function onDrop(event: DragEvent) {
  const type = event.dataTransfer?.getData('application/vueflow')
  if (!type) return

  const bounds = vueFlowRef.value?.getBoundingClientRect()
  if (!bounds) return

  const position = project({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  })

  store.addNode(type, position)
}

function onNodeClick({ node }: any) {
  store.selectedNodeId = node?.id || null
}

function onPaneClick() {
  store.selectedNodeId = null
}

function openWorkflow() {
  listDialogOpen.value = true
}

const nameInput = ref<HTMLInputElement | null>(null)

function startEditName() {
  if (!store.currentWorkflow) return
  editingName.value = store.currentWorkflow.name || ''
  isEditingName.value = true
  nextTick(() => nameInput.value?.focus())
}

function finishEditName() {
  if (!store.currentWorkflow || !isEditingName.value) return
  const trimmed = editingName.value.trim()
  if (trimmed) {
    store.currentWorkflow.name = trimmed
  }
  isEditingName.value = false
}

function cancelEditName() {
  isEditingName.value = false
}

async function saveWorkflow() {
  if (store.currentWorkflow) {
    await store.saveWorkflow(store.currentWorkflow)
  }
}

async function exportWorkflow() {
  const wf = store.currentWorkflow
  if (!wf) return
  const exportData = {
    name: wf.name,
    description: wf.description,
    nodes: wf.nodes,
    edges: wf.edges,
  }
  const result = await (window as any).api.workflow.exportSaveFile(JSON.stringify(exportData, null, 2))
  if (result?.success) {
    notify.success('工作流已导出')
  }
}

async function importWorkflow() {
  const result = await (window as any).api.workflow.importOpenFile()
  if (!result?.json) return
  try {
    const data = JSON.parse(result.json)
    if (!data.nodes || !data.edges) {
      notify.error('无效的工作流文件')
      return
    }
    store.newWorkflow()
    const wf = store.currentWorkflow!
    wf.name = data.name || '导入的工作流'
    wf.description = data.description
    wf.nodes = data.nodes
    wf.edges = data.edges
    notify.success('工作流已导入')
  } catch {
    notify.error('解析工作流文件失败')
  }
}

async function onListSelect(workflow: any) {
  if (workflow) {
    await store.loadData()
    store.currentWorkflow = store.workflows.find((w) => w.id === workflow.id) || workflow
    store.selectedNodeId = null
  }
}

// ====== 复制 / 粘贴 ======
interface ClipboardNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, any>
  label: string
  nodeType: string
}

interface ClipboardEdge {
  source: string
  target: string
  sourceHandle: string | null
  targetHandle: string | null
}

let clipboardNodes: ClipboardNode[] = []
let clipboardEdges: ClipboardEdge[] = []

function copySelectedNodes() {
  const selected = getSelectedNodes.value
  if (!selected.length) return

  const selectedIds = new Set(selected.map((n) => n.id))
  clipboardNodes = selected.map((n) => ({
    id: n.id,
    type: n.type ?? 'custom',
    position: { ...n.position },
    data: { ...(n.data as Record<string, any>) },
    label: (n.data as any)?.label ?? '',
    nodeType: (n.data as any)?.nodeType ?? '',
  }))

  // 收集选中节点之间的边
  clipboardEdges = (store.currentWorkflow?.edges ?? [])
    .filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
    }))

  notify.success(`已复制 ${selected.length} 个节点`)
}

const NODE_COLLISION_W = 180
const NODE_COLLISION_H = 80
const OFFSET_STEP = 60

function findSafeOffset(): { x: number; y: number } {
  const existing = store.currentWorkflow?.nodes ?? []
  for (let step = 1; step <= 30; step++) {
    const dx = OFFSET_STEP * step
    const dy = OFFSET_STEP * step
    const hasOverlap = clipboardNodes.some((cn) =>
      existing.some(
        (en) =>
          Math.abs(en.position.x - (cn.position.x + dx)) < NODE_COLLISION_W &&
          Math.abs(en.position.y - (cn.position.y + dy)) < NODE_COLLISION_H,
      ),
    )
    if (!hasOverlap) return { x: dx, y: dy }
  }
  return { x: OFFSET_STEP * 10, y: OFFSET_STEP * 10 }
}

const SINGLETON_TYPES = new Set(['start', 'end'])

function pasteClipboardNodes() {
  if (!clipboardNodes.length || !store.currentWorkflow) return

  const offset = findSafeOffset()
  const idMap = new Map<string, string>()

  for (const clip of clipboardNodes) {
    if (SINGLETON_TYPES.has(clip.nodeType)) {
      // 单例节点：复用画布上已有的，仅同步数据
      const existing = store.currentWorkflow.nodes.find((n) => n.type === clip.nodeType)
      if (existing) {
        existing.data = { ...clip.data }
        existing.label = clip.label
        idMap.set(clip.id, existing.id)
      } else {
        // 画布上没有该单例节点，正常创建
        const newNode = store.addNode(clip.nodeType, {
          x: clip.position.x + offset.x,
          y: clip.position.y + offset.y,
        })
        newNode.data = { ...clip.data }
        newNode.label = clip.label
        idMap.set(clip.id, newNode.id)
      }
    } else {
      // 普通节点：新建
      const newNode = store.addNode(clip.nodeType, {
        x: clip.position.x + offset.x,
        y: clip.position.y + offset.y,
      })
      newNode.data = { ...clip.data }
      newNode.label = clip.label
      idMap.set(clip.id, newNode.id)
    }
  }

  // 重建选中节点之间的边
  for (const edge of clipboardEdges) {
    const newSource = idMap.get(edge.source)
    const newTarget = idMap.get(edge.target)
    if (newSource && newTarget) {
      store.addEdge(newSource, newTarget, edge.sourceHandle, edge.targetHandle)
    }
  }

  // 自动选中新粘贴的节点
  // 先清空所有选中，避免原节点仍处于选中状态
  for (const node of getNodes.value) {
    node.selected = false
  }
  const newIds = new Set(idMap.values())
  const newVueFlowNodes = getNodes.value.filter((n) => newIds.has(n.id))
  addSelectedNodes(newVueFlowNodes)
  if (clipboardNodes.length > 1) {
    nodesSelectionActive.value = true
  }

  notify.success(`已粘贴 ${clipboardNodes.length} 个节点`)
}

function deleteSelected() {
  const selectedNodes = getSelectedNodes.value
  const selectedEdges = getSelectedEdges.value

  let count = 0

  // 先删边，再删节点（删节点会连带删除关联边）
  for (const edge of selectedEdges) {
    store.removeEdge(edge.id)
    count++
  }

  for (const node of selectedNodes) {
    store.removeNode(node.id)
    count++
  }

  if (count > 0) {
    notify.success(`已删除 ${count} 个元素`)
  }
}

// ====== 快捷键 ======
function handleKeyDown(e: KeyboardEvent) {
  if (!store.currentWorkflow) return
  // Ctrl+S = 保存（含版本快照）
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    saveWorkflow()
    return
  }
  // Ctrl+Shift+Z = Redo
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    store.redo()
    return
  }
  // Ctrl+Z = Undo
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    store.undo()
    return
  }
  // Ctrl+C = 复制选中节点
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
    // 不拦截输入框内的复制
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
    e.preventDefault()
    copySelectedNodes()
    return
  }
  // Ctrl+V = 粘贴
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
    e.preventDefault()
    pasteClipboardNodes()
    return
  }
  // Ctrl+A = 全选节点
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
    e.preventDefault()
    addSelectedNodes(getNodes.value)
    return
  }
  // Delete/Backspace = 删除选中节点
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
    e.preventDefault()
    deleteSelected()
  }
}

// ====== 监听主进程转发的缩放事件 ======
function onWorkflowZoomIn(e: Event) {
  zoomIn()
  ;(e as CustomEvent).preventDefault()
}

function onWorkflowZoomOut(e: Event) {
  zoomOut()
  ;(e as CustomEvent).preventDefault()
}

function onWorkflowZoomReset(e: Event) {
  zoomTo(1)
  ;(e as CustomEvent).preventDefault()
}

onMounted(() => {
  window.addEventListener('workflow:zoom-in', onWorkflowZoomIn)
  window.addEventListener('workflow:zoom-out', onWorkflowZoomOut)
  window.addEventListener('workflow:zoom-reset', onWorkflowZoomReset)
  cleanupFileUpdates = store.listenForFileUpdates()
})

onUnmounted(() => {
  window.removeEventListener('workflow:zoom-in', onWorkflowZoomIn)
  window.removeEventListener('workflow:zoom-out', onWorkflowZoomOut)
  window.removeEventListener('workflow:zoom-reset', onWorkflowZoomReset)
  cleanupFileUpdates?.()
})
</script>

<template>
  <div
    class="flex flex-col h-full min-h-0 bg-background overflow-hidden"
    tabindex="0"
    @keydown="handleKeyDown"
  >
    <!-- 顶部菜单栏：始终显示 -->
    <div class="flex items-center border-b border-border px-2 py-1">
      <Menubar class="border-0 bg-transparent h-7">
        <MenubarMenu>
          <MenubarTrigger class="text-xs h-6 px-2">
            文件
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem
              class="text-xs"
              @click="store.newWorkflow()"
            >
              新建
            </MenubarItem>
            <MenubarItem
              class="text-xs"
              @click="openWorkflow"
            >
              打开...
            </MenubarItem>
            <MenubarItem
              v-if="store.currentWorkflow"
              class="text-xs"
              @click="saveWorkflow"
            >
              保存
            </MenubarItem>
            <MenubarItem
              v-if="store.currentWorkflow"
              class="text-xs"
              @click="exportWorkflow"
            >
              导出...
            </MenubarItem>
            <MenubarItem
              class="text-xs"
              @click="importWorkflow"
            >
              导入...
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
      <input
        v-if="isEditingName"
        ref="nameInput"
        v-model="editingName"
        class="ml-3 text-xs bg-transparent border border-border rounded px-1 py-0.5 outline-none focus:border-primary w-40"
        @blur="finishEditName"
        @keydown.enter="finishEditName"
        @keydown.escape="cancelEditName"
      >
      <span
        v-else
        class="ml-3 text-xs text-muted-foreground truncate cursor-pointer hover:text-foreground"
        @dblclick="startEditName"
      >
        {{ store.currentWorkflow?.name || '未命名工作流' }}
      </span>
    </div>

    <!-- 欢迎页：无工作流时展示 -->
    <div
      v-if="!store.currentWorkflow"
      class="flex-1 flex items-center justify-center"
    >
      <div class="flex gap-8">
        <button
          class="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer w-52"
          @click="store.newWorkflow()"
        >
          <div class="p-4 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
            <Plus class="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <span class="text-base font-medium">新建工作流</span>
          <span class="text-xs text-muted-foreground text-center">从空白画布开始创建</span>
        </button>

        <button
          class="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer w-52"
          @click="openWorkflow"
        >
          <div class="p-4 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
            <FolderOpen class="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <span class="text-base font-medium">打开工作流</span>
          <span class="text-xs text-muted-foreground text-center">浏览并打开已有工作流</span>
        </button>

        <button
          class="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer w-52"
          @click="importWorkflow"
        >
          <div class="p-4 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
            <Import class="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <span class="text-base font-medium">导入工作流</span>
          <span class="text-xs text-muted-foreground text-center">从 .workflow 文件导入</span>
        </button>
      </div>
    </div>

    <!-- 编辑器：有工作流时展示 -->
    <template v-else>
      <ResizablePanelGroup
        direction="vertical"
        @layout="onExecBarResize"
      >
        <ResizablePanel
          :default-size="82"
          :min-size="40"
        >
          <ResizablePanelGroup
            direction="horizontal"
            class="h-full overflow-hidden"
            @layout="handlePanelResize"
          >
            <ResizablePanel
              :default-size="panelSizes[0]"
              :min-size="10"
              :max-size="35"
            >
              <NodeSidebar />
            </ResizablePanel>

            <ResizableHandle with-handle />

            <ResizablePanel
              :default-size="panelSizes[1]"
              :min-size="30"
              class="relative"
            >
              <VueFlow
                :id="FLOW_ID"
                :nodes="nodes"
                :edges="edges"
                :node-types="nodeTypes"
                :edge-types="edgeTypes"
                :min-zoom="0.2"
                :max-zoom="4"
                :connection-mode="ConnectionMode.Loose"
                class="h-full"
                @connect="handleConnect"
                @connect-start="onConnectStart"
                @connect-end="onConnectEnd"
                @dragover="onDragOver"
                @drop="onDrop"
                @node-click="onNodeClick"
                @nodes-initialized="handleNodesInitialized"
                @pane-click="onPaneClick"
              >
                <Background />
                <MiniMap />
                <template #edge-custom="edgeProps">
                  <CustomEdge
                    v-bind="edgeProps"
                    @insert-node="onEdgeInsertNode"
                  />
                </template>
                <Controls />
              </VueFlow>

              <!-- 悬浮工具栏 -->
              <div class="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-lg border border-border bg-background/90 backdrop-blur-sm px-2 py-1 shadow-sm">
                <TooltipProvider :delay-duration="400">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="h-7 w-7 p-0"
                        :disabled="!store.canUndo"
                        @click="store.undo()"
                      >
                        <RotateCcw class="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      class="text-xs"
                    >
                      撤销 (Ctrl+Z)
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="h-7 w-7 p-0"
                        :disabled="!store.canRedo"
                        @click="store.redo()"
                      >
                        <RotateCw class="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      class="text-xs"
                    >
                      重做 (Ctrl+Shift+Z)
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span class="text-[10px] text-muted-foreground ml-0.5 select-none">
                  {{ store.canUndo ? `${store.undoStack.length} 步可撤销` : '' }}
                </span>
              </div>
            </ResizablePanel>

            <ResizableHandle with-handle />

            <ResizablePanel
              :default-size="panelSizes[2]"
              :min-size="15"
              :max-size="50"
            >
              <RightPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle
          v-if="executionBarExpanded"
          with-handle
        />

        <ResizablePanel
          ref="execPanelRef"
          :collapsible="!executionBarExpanded"
          :collapsed-size="4"
          :default-size="executionBarExpanded ? savedExecPanelSize : 4"
          :min-size="executionBarExpanded ? 15 : 4"
          :max-size="executionBarExpanded ? 60 : 4"
        >
          <ExecutionBar v-model:expanded="executionBarExpanded" />
        </ResizablePanel>
      </ResizablePanelGroup>
    </template>

    <WorkflowListDialog
      :open="listDialogOpen"
      @update:open="listDialogOpen = $event"
      @select="onListSelect"
    />

    <NodeSelectDialog
      :open="nodeSelectOpen"
      @update:open="onNodeSelectDialogClose"
      @select="insertEdgeId ? onNodeSelectFromEdge($event) : onNodeSelectFromDialog($event)"
    />
  </div>
</template>
