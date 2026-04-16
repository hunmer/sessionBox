<script setup lang="ts">
import { ref, computed, markRaw, watch, nextTick } from 'vue'
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
import NodeSidebar from './NodeSidebar.vue'
import NodeProperties from './NodeProperties.vue'
import ExecutionBar from './ExecutionBar.vue'
import WorkflowListDialog from './WorkflowListDialog.vue'
import { Plus, FolderOpen } from 'lucide-vue-next'

const store = useWorkflowStore()
const listDialogOpen = ref(false)
const isEditingName = ref(false)
const editingName = ref('')
const FLOW_ID = 'workflow-editor-flow'

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
  updateNodeInternals,
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
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    animated: true,
    markerEnd: MarkerType.ArrowClosed,
    style: {
      stroke: 'var(--primary)',
      strokeWidth: 2.5,
    },
  })),
)

function handleConnect(params: any) {
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

async function onListSelect(workflow: any) {
  if (workflow) {
    await store.loadData()
    store.currentWorkflow = store.workflows.find((w) => w.id === workflow.id) || workflow
    store.selectedNodeId = null
  }
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0 bg-background overflow-hidden">
    <!-- 顶部菜单栏：始终显示 -->
    <div class="flex items-center border-b border-border px-2 py-1">
      <Menubar class="border-0 bg-transparent h-7">
        <MenubarMenu>
          <MenubarTrigger class="text-xs h-6 px-2">文件</MenubarTrigger>
          <MenubarContent>
            <MenubarItem class="text-xs" @click="store.newWorkflow()">
              新建
            </MenubarItem>
            <MenubarItem class="text-xs" @click="openWorkflow">
              打开...
            </MenubarItem>
            <MenubarItem v-if="store.currentWorkflow" class="text-xs" @click="saveWorkflow">
              保存
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
      />
      <span
        v-else
        class="ml-3 text-xs text-muted-foreground truncate cursor-pointer hover:text-foreground"
        @dblclick="startEditName"
      >
        {{ store.currentWorkflow?.name || '未命名工作流' }}
      </span>
    </div>

    <!-- 欢迎页：无工作流时展示 -->
    <div v-if="!store.currentWorkflow" class="flex-1 flex items-center justify-center">
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
      </div>
    </div>

    <!-- 编辑器：有工作流时展示 -->
    <template v-else>
      <ResizablePanelGroup direction="vertical" @layout="onExecBarResize">
        <ResizablePanel :default-size="82" :min-size="40">
          <ResizablePanelGroup
            direction="horizontal"
            class="h-full overflow-hidden"
            @layout="handlePanelResize"
          >
            <ResizablePanel :default-size="panelSizes[0]" :min-size="10" :max-size="35">
              <NodeSidebar />
            </ResizablePanel>

            <ResizableHandle with-handle />

            <ResizablePanel :default-size="panelSizes[1]" :min-size="30">
              <VueFlow
                :id="FLOW_ID"
                :nodes="nodes"
                :edges="edges"
                :node-types="nodeTypes"
                :min-zoom="0.2"
                :max-zoom="4"
                :connection-mode="ConnectionMode.Loose"
                @connect="handleConnect"
                @dragover="onDragOver"
                @drop="onDrop"
                @node-click="onNodeClick"
                @nodes-initialized="handleNodesInitialized"
                @pane-click="onPaneClick"
                class="h-full"
              >
                <Background />
                <MiniMap />
                <Controls />
              </VueFlow>
            </ResizablePanel>

            <ResizableHandle with-handle />

            <ResizablePanel :default-size="panelSizes[2]" :min-size="15" :max-size="50">
              <NodeProperties />
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
          :min-size="executionBarExpanded ? 30 : 4"
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
  </div>
</template>
