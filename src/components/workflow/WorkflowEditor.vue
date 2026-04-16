<script setup lang="ts">
import { ref, computed, markRaw } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
} from '@/components/ui/menubar'
import { useWorkflowStore } from '@/stores/workflow'
import CustomNodeWrapper from './CustomNodeWrapper.vue'
import NodeSidebar from './NodeSidebar.vue'
import NodeProperties from './NodeProperties.vue'
import ExecutionBar from './ExecutionBar.vue'
import WorkflowListDialog from './WorkflowListDialog.vue'
import { Plus, FolderOpen } from 'lucide-vue-next'

const store = useWorkflowStore()
const listDialogOpen = ref(false)

const { onConnect, project, vueFlowRef } = useVueFlow()

const nodeTypes = {
  custom: markRaw(CustomNodeWrapper),
}

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
    animated: true,
    style: { stroke: 'hsl(var(--border))' },
  })),
)

onConnect((params: any) => {
  store.addEdge(params.source, params.target)
})

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
      <span class="ml-3 text-xs text-muted-foreground truncate">
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
      <div class="flex flex-1 min-h-0 overflow-hidden">
        <NodeSidebar />

        <div class="flex-1">
          <VueFlow
            :nodes="nodes"
            :edges="edges"
            :node-types="nodeTypes"
            :default-viewport="{ zoom: 1, x: 0, y: 0 }"
            :min-zoom="0.2"
            :max-zoom="4"
            fit-view-on-init
            @dragover="onDragOver"
            @drop="onDrop"
            @node-click="onNodeClick"
            @pane-click="onPaneClick"
            class="h-full"
          >
            <Background />
            <MiniMap />
            <Controls />
          </VueFlow>
        </div>

        <NodeProperties />
      </div>

      <ExecutionBar />
    </template>

    <WorkflowListDialog
      :open="listDialogOpen"
      @update:open="listDialogOpen = $event"
      @select="onListSelect"
    />
  </div>
</template>
